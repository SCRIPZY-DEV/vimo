use std::collections::{HashMap, VecDeque};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::{json, Map, Value};

use crate::diagnostics::redaction::Redactor;
use crate::diagnostics::subject::{subject_from_payload, Subject, SubjectKind, CREATE_PROJECT_SUBCOMMAND};

/// Tope de entradas de la línea de tiempo: al excederlo se conservan el
/// arranque y el final, que es donde está el fallo.
const HEAD_ENTRIES_LIMIT: usize = 500;
const TAIL_ENTRIES_LIMIT: usize = 1500;
/// De los eventos de progreso se guarda uno por cada salto de este tamaño.
const PROGRESS_BUCKET_PERCENT: f64 = 10.0;
/// Los progresos sin porcentaje se muestrean por tiempo.
const PROGRESS_BUCKET_SECONDS: u64 = 30;
/// Un stdout fuera de contrato puede ser un NDJSON roto con contenido: solo
/// se guarda el arranque, redactado.
const INVALID_STDOUT_PREVIEW_CHARS: usize = 200;

/// Progreso por escena: cientos de entradas sin valor de diagnóstico; el
/// desenlace de cada escena ya viaja en scene-image-ready / scene-image-failed.
const IGNORED_EVENT_TYPES: [&str; 2] = ["scene-image-progress", "scene-image-started"];

const CANCELLED_CODE: &str = "cancelled";
const AWAITING_CONFIRMATION_STATUS: &str = "awaiting-confirmation";
/// Código estable de un proceso que murió sin evento terminal: así un crash
/// no queda con `error_code` vacío y se filtra como cualquier otro fallo.
const PROCESS_CRASHED_CODE: &str = "process_crashed";
/// El emitter espeja los `log` warn/error a stderr con este prefijo: ya
/// entraron como evento, no se guardan dos veces.
const MIRRORED_STDERR_PREFIXES: [&str; 2] = ["[warn] ", "[error] "];

pub const PIPELINE_SOURCE: &str = "pipeline";
pub const UPDATE_SOURCE: &str = "update";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RunStatus {
    Completed,
    Failed,
    Cancelled,
    Paused,
    /// El proceso terminó sin job-completed ni job-failed.
    Crashed,
}

/// Registro de una ejecución tal como queda en el spool. El webview le suma
/// la identidad del usuario y lo inserta en `diagnostic_logs`.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticRecord {
    pub id: String,
    pub source: &'static str,
    pub subcommand: Option<String>,
    pub project_id: Option<String>,
    pub project_name: Option<String>,
    pub status: RunStatus,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub error_provider: Option<String>,
    pub error_http_status: Option<u64>,
    pub failed_stage: Option<String>,
    pub started_at_ms: u64,
    pub finished_at_ms: u64,
    pub duration_ms: u64,
    pub app_version: String,
    pub os: &'static str,
    pub os_version: Option<String>,
    pub arch: &'static str,
    pub context: Value,
    pub events: Vec<Value>,
    pub events_truncated: bool,
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or_default()
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::to_owned)
}

// Porcentaje del evento: el propio, o el que sale de `ready` / `total`.
fn progress_percent(event: &Value) -> Option<f64> {
    if let Some(percent) = event.get("percent").and_then(Value::as_f64) {
        return Some(percent);
    }

    let ready = event.get("ready").and_then(Value::as_f64)?;
    let total = event.get("total").and_then(Value::as_f64)?;
    if total <= 0.0 {
        return None;
    }
    Some(ready / total * 100.0)
}

/// Lo que el recorder deja al cerrar; el resto del registro (entorno, nombre
/// del proyecto, contexto) lo completa quien conoce la app.
pub struct RecorderOutcome {
    pub subject: Option<Subject>,
    pub status: RunStatus,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub error_provider: Option<String>,
    pub error_http_status: Option<u64>,
    pub failed_stage: Option<String>,
    pub started_at_ms: u64,
    pub duration_ms: u64,
    pub events: Vec<Value>,
    pub events_truncated: bool,
}

/// Acumula la línea de tiempo de un job mientras Rust reenvía sus eventos.
pub struct DiagnosticRecorder {
    subcommand: String,
    subject: Option<Subject>,
    redactor: Redactor,
    started_at_ms: u64,
    started: Instant,
    head: Vec<Value>,
    tail: VecDeque<Value>,
    truncated: bool,
    progress_buckets: HashMap<String, u64>,
    /// Las fases en curso, en el orden en que arrancaron. El corredor puede
    /// correr dos a la vez (`images` y `avatar`, ADR-0013 y spec §24.1): cada
    /// `stage-completed` o `stage-skipped` saca solo la suya, y la que falló es
    /// la primera que sigue en curso cuando llega `job-failed`.
    running_stages: Vec<String>,
    status: Option<RunStatus>,
    error_code: Option<String>,
    error_message: Option<String>,
    error_provider: Option<String>,
    error_http_status: Option<u64>,
    failed_stage: Option<String>,
}

impl DiagnosticRecorder {
    pub fn new(subcommand: &str, payload: Option<&Value>, redactor: Redactor) -> Self {
        Self {
            subcommand: subcommand.to_owned(),
            subject: subject_from_payload(subcommand, payload),
            redactor,
            started_at_ms: now_ms(),
            started: Instant::now(),
            head: Vec::new(),
            tail: VecDeque::new(),
            truncated: false,
            progress_buckets: HashMap::new(),
            running_stages: Vec::new(),
            status: None,
            error_code: None,
            error_message: None,
            error_provider: None,
            error_http_status: None,
            failed_stage: None,
        }
    }

    fn push(&mut self, mut entry: Map<String, Value>) {
        entry.insert("t".into(), json!(self.started.elapsed().as_millis() as u64));
        let entry = Value::Object(entry);

        if self.head.len() < HEAD_ENTRIES_LIMIT {
            self.head.push(entry);
            return;
        }

        if self.tail.len() == TAIL_ENTRIES_LIMIT {
            self.tail.pop_front();
            self.truncated = true;
        }
        self.tail.push_back(entry);
    }

    // true si este progreso cae en un tramo que todavía no se guardó.
    fn enters_new_progress_bucket(&mut self, event_type: &str, event: &Value) -> bool {
        let bucket = match progress_percent(event) {
            Some(percent) => (percent.max(0.0) / PROGRESS_BUCKET_PERCENT) as u64,
            None => self.started.elapsed().as_secs() / PROGRESS_BUCKET_SECONDS,
        };
        let stage = event.get("stageId").and_then(Value::as_str).unwrap_or("");
        let key = format!("{event_type}:{stage}");

        if self.progress_buckets.get(&key) == Some(&bucket) {
            return false;
        }
        self.progress_buckets.insert(key, bucket);
        true
    }

    // `stage-started`: la fase entra al final de las que están en curso. Un
    // evento sin `stageId` no se puede seguir.
    fn start_stage(&mut self, event: &Value) {
        let Some(stage) = string_field(event, "stageId") else {
            return;
        };
        self.running_stages.push(stage);
    }

    // `stage-completed` y `stage-skipped`: sacan solo la fase del evento (todas
    // sus entradas, si arrancó dos veces). Una que nunca arrancó (la salteada)
    // o un evento sin `stageId` no tocan a las que siguen corriendo.
    fn end_stage(&mut self, event: &Value) {
        let Some(stage) = string_field(event, "stageId") else {
            return;
        };
        self.running_stages.retain(|running| *running != stage);
    }

    // La fase que se da por fallida si el job cae: la primera que sigue en
    // curso. Con las reglas del corredor (§24.1) es la que de verdad falló: si
    // `images` falla se corta el avatar (que no llega a completarse) y si
    // fallan las dos gana `images`, la primera en arrancar; si falla el avatar,
    // `images` termina antes de que el job caiga y ya no está en curso.
    //
    // Es una heurística, no un dato del evento: `job-failed` no dice qué fase
    // falló. El límite conocido es un fallo que llega DESPUÉS del
    // `stage-completed` de su fase, en el gancho que guarda su avance
    // (`onStageCompleted`, por ejemplo sin disco): el corredor corta a la otra,
    // que sigue en curso, y el `job-failed` queda anotado con ella (o sin fase
    // si no queda ninguna). Es muy raro, y el campo es una pista para soporte,
    // no una prueba.
    fn failing_stage(&self) -> Option<String> {
        self.running_stages.first().cloned()
    }

    fn track_outcome(&mut self, event_type: &str, event: &Value) {
        match event_type {
            "stage-started" => self.start_stage(event),
            "stage-completed" | "stage-skipped" => self.end_stage(event),
            "job-completed" => {
                let result = event.get("result");
                let awaiting = result
                    .and_then(|result| result.get("status"))
                    .and_then(Value::as_str)
                    == Some(AWAITING_CONFIRMATION_STATUS);
                self.status = Some(if awaiting {
                    RunStatus::Paused
                } else {
                    RunStatus::Completed
                });

                // El proyecto recién creado no viene en el payload: nace acá.
                if self.subcommand == CREATE_PROJECT_SUBCOMMAND {
                    let subject = self.subject.get_or_insert(Subject {
                        kind: SubjectKind::Project,
                        id: None,
                        name: None,
                    });
                    if subject.id.is_none() {
                        subject.id = result.and_then(|result| string_field(result, "projectId"));
                    }
                }
            }
            "job-failed" => {
                let code = string_field(event, "code");
                let cancelled = code.as_deref() == Some(CANCELLED_CODE);
                self.status = Some(if cancelled {
                    RunStatus::Cancelled
                } else {
                    RunStatus::Failed
                });
                self.error_message = event
                    .get("message")
                    .and_then(Value::as_str)
                    .map(|message| self.redactor.redact(message));
                self.error_code = code;
                self.error_provider = string_field(event, "provider");
                self.error_http_status = event.get("httpStatus").and_then(Value::as_u64);
                self.failed_stage = self.failing_stage();
            }
            _ => {}
        }
    }

    pub fn record_event(&mut self, event: &Value) {
        let Some(event_type) = event.get("type").and_then(Value::as_str) else {
            return;
        };
        self.track_outcome(event_type, event);

        if IGNORED_EVENT_TYPES.contains(&event_type) {
            return;
        }
        if event_type.ends_with("progress") && !self.enters_new_progress_bucket(event_type, event) {
            return;
        }

        let entry = self.redactor.project_event(event);
        self.push(entry);
    }

    pub fn record_stderr(&mut self, line: &[u8]) {
        let text = String::from_utf8_lossy(line);
        if MIRRORED_STDERR_PREFIXES.iter().any(|prefix| text.starts_with(prefix)) {
            return;
        }

        let message = self.redactor.redact(text.trim_end());
        let mut entry = Map::new();
        entry.insert("type".into(), json!("sidecar-stderr"));
        entry.insert("message".into(), json!(message));
        self.push(entry);
    }

    pub fn record_invalid_stdout(&mut self, line: &[u8]) {
        let text = String::from_utf8_lossy(line);
        let preview: String = text.chars().take(INVALID_STDOUT_PREVIEW_CHARS).collect();
        let mut entry = Map::new();
        entry.insert("type".into(), json!("sidecar-stdout-invalid"));
        entry.insert("length".into(), json!(line.len()));
        entry.insert("message".into(), json!(self.redactor.redact(&preview)));
        self.push(entry);
    }

    pub fn finish(mut self, exit_code: Option<i32>, signal: Option<i32>) -> RecorderOutcome {
        let mut entry = Map::new();
        entry.insert("type".into(), json!("process-exited"));
        entry.insert("exitCode".into(), json!(exit_code));
        entry.insert("signal".into(), json!(signal));
        self.push(entry);

        let status = self.status.unwrap_or(RunStatus::Crashed);
        let (error_code, error_message, failed_stage) = match status {
            RunStatus::Crashed => (
                Some(PROCESS_CRASHED_CODE.to_owned()),
                Some(format!(
                    "process exited without a terminal event (exit code {exit_code:?}, signal {signal:?})"
                )),
                self.failing_stage(),
            ),
            _ => (self.error_code, self.error_message, self.failed_stage),
        };
        let mut events = self.head;
        events.extend(self.tail);

        RecorderOutcome {
            subject: self.subject,
            status,
            error_code,
            error_message,
            error_provider: self.error_provider,
            error_http_status: self.error_http_status,
            failed_stage,
            started_at_ms: self.started_at_ms,
            duration_ms: self.started.elapsed().as_millis() as u64,
            events,
            events_truncated: self.truncated,
        }
    }
}

#[cfg(test)]
#[path = "tests/recorder.rs"]
mod tests;
