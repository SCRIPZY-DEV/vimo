use serde_json::{json, Map, Value};
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;

use crate::api_keys::source::{current_source, KeySource};

// Espejo de src/modules/settings/constants.ts — mantener en sincronía.
const SETTINGS_STORE_FILE: &str = "settings.json";
const PROJECTS_ROOT_STORE_KEY: &str = "projectsRoot";
const DEFAULT_PROJECTS_FOLDER_NAME: &str = "Vimo";

/// Carpeta raíz de proyectos (ADR-0009): la elegida en Ajustes o el default
/// `~/Documents/Vimo`. Bajo ella el sidecar guarda los historiales.
fn resolve_projects_root(app: &AppHandle) -> Option<String> {
    if let Ok(store) = app.store(SETTINGS_STORE_FILE) {
        if let Some(value) = store.get(PROJECTS_ROOT_STORE_KEY) {
            if let Some(root) = value.as_str() {
                return Some(root.to_string());
            }
        }
    }
    let documents = app.path().document_dir().ok()?;
    Some(
        documents
            .join(DEFAULT_PROJECTS_FOLDER_NAME)
            .to_string_lossy()
            .into_owned(),
    )
}

/// Arma el PipelineJob del contrato (pipeline/runner/job.ts): config y payload
/// vienen de la UI; las claves salen de la fuente de claves (ADR-0011, una sola
/// entrada cacheada por sesión: ADR-0023) y nunca del webview. Rust no
/// redeclara los tipos del contrato: construye el JSON.
pub fn build_pipeline_job(
    app: &AppHandle,
    job_id: &str,
    project_dir: Option<String>,
    config: Option<Value>,
    payload: Option<Value>,
) -> Value {
    // Best-effort: no todo subcomando necesita todas las claves; el sidecar
    // reporta la que le falte con un job-failed traducible.
    let mut api_keys = Map::new();
    for (provider_id, key) in current_source().get_all(app).unwrap_or_default() {
        api_keys.insert(provider_id, Value::String(key));
    }

    let mut job = Map::new();
    job.insert("jobId".into(), json!(job_id));
    if let Some(dir) = project_dir {
        job.insert("projectDir".into(), Value::String(dir));
    }
    if let Some(root) = resolve_projects_root(app) {
        job.insert("projectsRoot".into(), Value::String(root));
    }
    if let Some(config) = config {
        job.insert("config".into(), config);
    }
    job.insert("apiKeys".into(), Value::Object(api_keys));
    job.insert(
        "binaryPaths".into(),
        crate::pipeline::binaries::resolve_binary_paths(),
    );
    if let Some(payload) = payload {
        job.insert("payload".into(), payload);
    }

    Value::Object(job)
}
