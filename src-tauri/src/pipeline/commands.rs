use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde_json::{json, Value};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_shell::process::{CommandEvent, TerminatedPayload};
use tauri_plugin_shell::ShellExt;

use crate::diagnostics::recorder::DiagnosticRecorder;
use crate::diagnostics::report::{build_redactor, store_job_record};
use crate::pipeline::error::PipelineError;
use crate::pipeline::job::build_pipeline_job;
use crate::pipeline::jobs::{RunningJob, RunningJobs};

/// El sidecar empaquetado como externalBin: binario único Node SEA generado
/// por scripts/build-sidecar.mjs (corre en beforeDev/BuildCommand). Dev y
/// producción usan el MISMO binario — el sidecar nunca depende del Node del
/// sistema, porque una app lanzada desde Finder no hereda el PATH de la
/// terminal. Para iterar el pipeline por CLI sigue existiendo `pnpm pipeline`.
fn sidecar_command(
    app: &AppHandle,
    subcommand: &str,
) -> Result<tauri_plugin_shell::process::Command, PipelineError> {
    let command = app
        .shell()
        .sidecar("vimo-pipeline")
        .map_err(|_| PipelineError::SidecarMissing)?;
    Ok(command.args([subcommand]))
}

/// Comando genérico del pipeline (ADR-0010, paso 1): spawnea el sidecar con un
/// subcomando, le pasa el PipelineJob por stdin y reenvía sus eventos NDJSON
/// por el Channel del invoke — cada job tiene su propio canal, sin filtrado
/// por jobId en la UI. El catálogo de eventos vive en pipeline/runner/events.ts;
/// Rust no redeclara los tipos: parsea cada línea y la reenvía tal cual.
/// Todo job termina en job-completed o job-failed: si el proceso termina sin
/// haber emitido ninguno, Rust manda el que falta (`closing_event`).
#[tauri::command]
pub async fn start_pipeline_job(
    app: AppHandle,
    jobs: State<'_, RunningJobs>,
    subcommand: String,
    payload: Option<Value>,
    config: Option<Value>,
    project_dir: Option<String>,
    on_event: Channel<Value>,
) -> Result<String, PipelineError> {
    let project_id = if subcommand == "run-video-pipeline" {
        payload
            .as_ref()
            .and_then(|value| value.get("projectId"))
            .and_then(Value::as_str)
            .map(str::to_owned)
    } else {
        None
    };
    // Comprobar y registrar bajo el MISMO mutex: dos invokes concurrentes
    // nunca pueden lanzar la narración del mismo proyecto dos veces.
    let mut running = jobs.0.lock().expect("running jobs mutex poisoned");
    if project_id.is_some() && running.values().any(|job| job.project_id == project_id) {
        return Err(PipelineError::ProjectBusy);
    }
    let job_id = uuid::Uuid::new_v4().to_string();
    // Log de diagnóstico del job (ADR-0038): se alimenta en el loop de eventos.
    let mut recorder = DiagnosticRecorder::new(&subcommand, payload.as_ref(), build_redactor(&app));
    let job = build_pipeline_job(&app, &job_id, project_dir, config, payload);

    let (mut events, mut child) = sidecar_command(&app, &subcommand)?
        .spawn()
        .map_err(|_| PipelineError::SidecarSpawn)?;

    // El job viaja por stdin (una línea NDJSON): las claves API nunca pasan
    // por argv, donde cualquier proceso del usuario podría listarlas.
    let job_line = format!("{job}\n");
    if child.write(job_line.as_bytes()).is_err() {
        let _ = child.kill();
        return Err(PipelineError::SidecarWrite);
    }

    let cancel_requested = Arc::new(AtomicBool::new(false));
    running.insert(
        job_id.clone(),
        RunningJob {
            child,
            project_id,
            cancel_requested: Arc::clone(&cancel_requested),
        },
    );
    drop(running);

    let app_for_events = app.clone();
    let job_id_for_events = job_id.clone();
    let subcommand_for_events = subcommand.clone();
    tauri::async_runtime::spawn(async move {
        // Si el sidecar ya emitió su job-completed / job-failed, el cierre de
        // abajo no manda otro: un job nunca recibe dos eventos terminales.
        let mut terminal_forwarded = false;
        // Cómo terminó el proceso; None si el stream de eventos se corta sin
        // `Terminated` (el plugin no pudo esperar al proceso).
        let mut exit = None;
        while let Some(event) = events.recv().await {
            match event {
                CommandEvent::Stdout(line) => match serde_json::from_slice::<Value>(&line) {
                    Ok(value) => {
                        recorder.record_event(&value);
                        if is_terminal_event(&value) {
                            terminal_forwarded = true;
                            kill_if_lingering(app_for_events.clone(), job_id_for_events.clone());
                        }
                        let _ = on_event.send(value);
                    }
                    Err(_) => {
                        recorder.record_invalid_stdout(&line);
                        log::warn!(
                            "sidecar stdout fuera de contrato: {}",
                            String::from_utf8_lossy(&line)
                        );
                    }
                },
                CommandEvent::Stderr(line) => {
                    recorder.record_stderr(&line);
                    log::warn!("sidecar stderr: {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Error(message) => {
                    log::warn!("sidecar {job_id_for_events}: {message}");
                }
                CommandEvent::Terminated(payload) => {
                    exit = Some(payload);
                    break;
                }
                _ => {}
            }
        }

        // El evento terminal que falte va antes que la limpieza: quien espera
        // el job por el canal no queda colgado aunque lo que sigue falle.
        let closing = closing_event(
            &job_id_for_events,
            terminal_forwarded,
            cancel_requested.load(Ordering::SeqCst),
            exit.as_ref(),
        );
        if let Some(event) = closing {
            log::warn!("sidecar {job_id_for_events} terminó sin evento terminal: {event}");
            let _ = on_event.send(event);
        }

        // Sin `Terminated` el proceso pudo seguir vivo: soltar su entrada le
        // cierra stdin y el sidecar aborta solo (pipeline/main.ts).
        let jobs = app_for_events.state::<RunningJobs>();
        jobs.0
            .lock()
            .expect("running jobs mutex poisoned")
            .remove(&job_id_for_events);

        let (exit_code, signal) = exit.map_or((None, None), |exit| (exit.code, exit.signal));
        let outcome = recorder.finish(exit_code, signal);
        store_job_record(
            &app_for_events,
            &job_id_for_events,
            &subcommand_for_events,
            outcome,
        );
    });

    Ok(job_id)
}

/// Margen entre el evento terminal de un job y la salida de su proceso. El
/// sidecar sale solo apenas vacía stdout; pasado este margen se lo mata.
const TERMINAL_EXIT_GRACE: Duration = Duration::from_secs(10);

fn is_terminal_event(event: &Value) -> bool {
    matches!(
        event.get("type").and_then(Value::as_str),
        Some("job-completed" | "job-failed")
    )
}

/// Código con el que Rust cierra un job cuyo proceso terminó sin evento
/// terminal sin que nadie pidiera cancelarlo. La UI lo traduce como cualquier
/// `code` de job-failed (`CREATE_ERROR_MESSAGE_KEYS`, `DEMO_ERROR_MESSAGE_KEYS`).
const SIDECAR_EXITED_CODE: &str = "sidecar_exited";
/// El código con el que el propio sidecar informa una cancelación
/// (pipeline/main.ts): la UI ya lo trata como cancelación, no como error.
const CANCELLED_CODE: &str = "cancelled";

/// El evento terminal que falta cuando el proceso del sidecar termina sin
/// haber emitido job-completed ni job-failed (un crash, falta de memoria, un
/// kill, un binario roto): sin él, quien espera el job por el canal queda
/// colgado. Es un job-failed con la forma de los del sidecar (`code`,
/// `message` y `jobId`): `cancelled` si se había pedido la cancelación (el
/// kill de respaldo de `cancel_pipeline_job`, o un proceso que murió mientras
/// abortaba) y `sidecar_exited` si no. `exit` es None si el stream de eventos
/// se cortó sin `Terminated`. Devuelve None si el sidecar ya emitió su evento
/// terminal: un job nunca recibe dos.
fn closing_event(
    job_id: &str,
    terminal_forwarded: bool,
    cancel_requested: bool,
    exit: Option<&TerminatedPayload>,
) -> Option<Value> {
    if terminal_forwarded {
        return None;
    }

    let code = if cancel_requested {
        CANCELLED_CODE
    } else {
        SIDECAR_EXITED_CODE
    };
    let message = format!(
        "sidecar exited without a terminal event ({})",
        describe_exit(exit)
    );
    Some(json!({ "type": "job-failed", "code": code, "message": message, "jobId": job_id }))
}

/// Cómo terminó el proceso, para el `message` del cierre: diagnóstico, nunca
/// texto que vea la persona. Sin `Terminated` no hay estado de salida.
fn describe_exit(exit: Option<&TerminatedPayload>) -> String {
    match exit.map(|exit| (exit.code, exit.signal)) {
        Some((Some(code), _)) => format!("exit code {code}"),
        Some((None, Some(signal))) => format!("signal {signal}"),
        _ => "no exit status".to_owned(),
    }
}

/// Red de seguridad: un sidecar que ya emitió job-completed / job-failed no
/// tiene nada más que guardar. Si sigue vivo, su entrada en RunningJobs deja
/// el proyecto «con una generación en curso» (project_busy) hasta reiniciar
/// la app. Nunca se usa para la cancelación: matar a mitad de un encargo de
/// voz deja el recibo sin taskId y bloquea el siguiente intento.
fn kill_if_lingering(app: AppHandle, job_id: String) {
    std::thread::spawn(move || {
        std::thread::sleep(TERMINAL_EXIT_GRACE);
        let jobs = app.state::<RunningJobs>();
        let lingering = jobs
            .0
            .lock()
            .expect("running jobs mutex poisoned")
            .remove(&job_id);
        if let Some(job) = lingering {
            log::warn!("sidecar {job_id} seguía vivo tras su evento terminal: se mata");
            let _ = job.child.kill();
        }
    });
}

/// Cancelación cooperativa (ADR-0010): se avisa por stdin y el sidecar aborta
/// con su AbortController; si stdin ya no acepta escrituras, se mata el
/// proceso como fallback. En los dos casos queda anotado que se pidió: si el
/// proceso termina sin evento terminal, su job se cierra con `cancelled`.
#[tauri::command]
pub fn cancel_pipeline_job(
    jobs: State<'_, RunningJobs>,
    job_id: String,
) -> Result<(), PipelineError> {
    let mut running = jobs.0.lock().expect("running jobs mutex poisoned");
    let Some(job) = running.get_mut(&job_id) else {
        return Err(PipelineError::JobNotFound);
    };

    job.cancel_requested.store(true, Ordering::SeqCst);
    if job.child.write(b"{\"type\":\"cancel\"}\n").is_ok() {
        return Ok(());
    }
    if let Some(job) = running.remove(&job_id) {
        let _ = job.child.kill();
    }
    Ok(())
}

#[cfg(test)]
#[path = "tests/commands.rs"]
mod tests;
