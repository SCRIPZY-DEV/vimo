use std::path::{Path, PathBuf};

use serde_json::{json, Map, Value};
use tauri::{AppHandle, Emitter, Manager};

use crate::api_keys::source::{current_source, KeySource};
use crate::diagnostics::recorder::{
    now_ms, DiagnosticRecord, RecorderOutcome, RunStatus, PIPELINE_SOURCE, UPDATE_SOURCE,
};
use crate::diagnostics::redaction::Redactor;
use crate::diagnostics::spool::write_record;
use crate::diagnostics::subject::{
    read_subject_metadata, resolve_subject_name, subject_label, Subject, SubjectKind,
};
use crate::settings::projects_root::resolve_projects_root;
use crate::updates::install_location::current_install_location;

/// Evento Tauri que avisa al webview que hay un registro nuevo para subir.
/// Espejo de src/modules/diagnostics/constants.ts — mantener en sincronía.
const LOG_READY_EVENT: &str = "diagnostic-log-ready";

const UPDATE_INSTALL_FAILED_CODE: &str = "update_install_failed";
const UPDATE_SUBCOMMAND: &str = "install-update";

/// Opciones del proyecto que sirven para diagnosticar y no son contenido:
/// nada de voces, URLs, personajes ni el estilo propio (lleva su system prompt).
const CONTEXT_OPTION_KEYS: [&str; 16] = [
    "styleId",
    "sceneCount",
    "narrationMode",
    "voiceProvider",
    "imageProvider",
    "imageQuality",
    "videoFormat",
    "useBgm",
    "bgmMode",
    "useOverlay",
    "confirmScenes",
    "secondsPerScene",
    "promptModel",
    "subtitles",
    "autoRender",
    "demo",
];
const CONTEXT_METADATA_KEYS: [&str; 6] = [
    "state",
    "completedStages",
    "audioDurationSeconds",
    "sceneCount",
    "wordCount",
    "pauseReason",
];

/// Subcomandos de lectura o de ajuste chico que la UI dispara todo el tiempo:
/// si terminan bien no se registran; si fallan o crashean, sí.
const QUIET_PREFIXES: [&str; 5] = ["list-", "get-", "set-", "update-", "delete-"];
const QUIET_SUFFIXES: [&str; 5] = ["-list", "-status", "-detail", "-delete", "-credits"];
const QUIET_SUBCOMMANDS: [&str; 5] = [
    "ping",
    "probe-tts",
    "preview-scene-cuts",
    "choose-music",
    "confirm-scenes",
];

fn is_quiet_subcommand(subcommand: &str) -> bool {
    QUIET_SUBCOMMANDS.contains(&subcommand)
        || QUIET_PREFIXES.iter().any(|prefix| subcommand.starts_with(prefix))
        || QUIET_SUFFIXES.iter().any(|suffix| subcommand.ends_with(suffix))
}

fn is_worth_recording(subcommand: &str, status: RunStatus) -> bool {
    status != RunStatus::Completed || !is_quiet_subcommand(subcommand)
}

fn copy_keys(source: Option<&Value>, keys: &[&str], target: &mut Map<String, Value>) {
    let Some(fields) = source.and_then(Value::as_object) else {
        return;
    };

    for key in keys {
        // Solo escalares y listas: un objeto anidado podría traer contenido.
        let Some(value) = fields.get(*key).filter(|value| !value.is_object()) else {
            continue;
        };
        target.insert((*key).to_owned(), value.clone());
    }
}

fn project_context(metadata: &Value) -> Value {
    let mut context = Map::new();
    copy_keys(metadata.get("options"), &CONTEXT_OPTION_KEYS, &mut context);
    copy_keys(Some(metadata), &CONTEXT_METADATA_KEYS, &mut context);

    let model_used = metadata
        .get("promptModelUsed")
        .and_then(|model| model.get("id"))
        .cloned();
    if let Some(model_used) = model_used {
        context.insert("promptModelUsed".into(), model_used);
    }

    Value::Object(context)
}

/// Identidad de la fila: proyecto (id + nombre de project.json + opciones) o,
/// para lo que no es un proyecto, la etiqueta de la entidad. Separado del
/// AppHandle para poder testearlo sobre una carpeta temporal.
struct SubjectDescription {
    project_id: Option<String>,
    project_name: Option<String>,
    context: Value,
}

fn describe_subject(projects_root: Option<&Path>, subject: Option<&Subject>) -> SubjectDescription {
    let Some(subject) = subject else {
        return SubjectDescription {
            project_id: None,
            project_name: None,
            context: json!({}),
        };
    };

    let metadata = projects_root.and_then(|root| read_subject_metadata(root, subject));
    let name = resolve_subject_name(projects_root, subject);
    let mut context = match (subject.kind, &metadata) {
        (SubjectKind::Project, Some(metadata)) => project_context(metadata),
        _ => Value::Object(Map::new()),
    };
    if let Some(fields) = context.as_object_mut() {
        fields.insert("subject".into(), json!({ "kind": subject.kind, "id": subject.id }));
    }

    SubjectDescription {
        project_id: match subject.kind {
            SubjectKind::Project => subject.id.clone(),
            _ => None,
        },
        project_name: subject_label(subject, name.as_deref()),
        context,
    }
}

fn os_version() -> Option<String> {
    let version = os_info::get().version().to_string();
    if version.is_empty() || version == "Unknown" {
        return None;
    }
    Some(version)
}

/// Redactor con los secretos y carpetas reales de esta máquina.
pub fn build_redactor(app: &AppHandle) -> Redactor {
    let api_keys = current_source().get_all(app).unwrap_or_default();
    let home = app
        .path()
        .home_dir()
        .ok()
        .map(|home| home.to_string_lossy().into_owned());

    Redactor::new(api_keys.into_values(), resolve_projects_root(app), home)
}

fn store_and_notify(app: &AppHandle, record: &DiagnosticRecord) {
    if let Err(error) = write_record(app, record) {
        log::warn!("no se pudo guardar el log de diagnóstico {}: {error}", record.id);
        return;
    }
    let _ = app.emit(LOG_READY_EVENT, &record.id);
}

/// Cierra el registro de un job del sidecar y lo deja en el spool.
pub fn store_job_record(app: &AppHandle, job_id: &str, subcommand: &str, outcome: RecorderOutcome) {
    if !is_worth_recording(subcommand, outcome.status) {
        return;
    }

    let projects_root = resolve_projects_root(app).map(PathBuf::from);
    let description = describe_subject(projects_root.as_deref(), outcome.subject.as_ref());

    let record = DiagnosticRecord {
        id: job_id.to_owned(),
        source: PIPELINE_SOURCE,
        subcommand: Some(subcommand.to_owned()),
        project_id: description.project_id,
        project_name: description.project_name,
        status: outcome.status,
        error_code: outcome.error_code,
        error_message: outcome.error_message,
        error_provider: outcome.error_provider,
        error_http_status: outcome.error_http_status,
        failed_stage: outcome.failed_stage,
        started_at_ms: outcome.started_at_ms,
        finished_at_ms: outcome.started_at_ms + outcome.duration_ms,
        duration_ms: outcome.duration_ms,
        app_version: app.package_info().version.to_string(),
        os: std::env::consts::OS,
        os_version: os_version(),
        arch: std::env::consts::ARCH,
        context: description.context,
        events: outcome.events,
        events_truncated: outcome.events_truncated,
    };
    store_and_notify(app, &record);
}

/// Fallo de instalación del actualizador: no pasa por el sidecar, así que se
/// registra como una ejecución de un solo evento.
pub fn store_update_failure(app: &AppHandle, detail: &str) {
    let now = now_ms();
    let message = build_redactor(app).redact(detail);

    let record = DiagnosticRecord {
        id: uuid::Uuid::new_v4().to_string(),
        source: UPDATE_SOURCE,
        subcommand: Some(UPDATE_SUBCOMMAND.to_owned()),
        project_id: None,
        project_name: None,
        status: RunStatus::Failed,
        error_code: Some(UPDATE_INSTALL_FAILED_CODE.to_owned()),
        error_message: Some(message.clone()),
        error_provider: None,
        error_http_status: None,
        failed_stage: None,
        started_at_ms: now,
        finished_at_ms: now,
        duration_ms: 0,
        app_version: app.package_info().version.to_string(),
        os: std::env::consts::OS,
        os_version: os_version(),
        arch: std::env::consts::ARCH,
        context: json!({ "installLocation": current_install_location() }),
        events: vec![json!({ "t": 0, "type": "update-install-failed", "message": message })],
        events_truncated: false,
    };
    store_and_notify(app, &record);
}

#[cfg(test)]
#[path = "tests/report.rs"]
mod tests;
