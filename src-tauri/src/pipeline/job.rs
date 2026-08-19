use std::collections::HashMap;
use std::sync::Mutex;

use serde_json::{json, Map, Value};
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;

use crate::api_keys::provider::ALL_PROVIDERS;
use crate::api_keys::source::{current_source, KeySource};

/// Caché en memoria de las claves por sesión: el keychain de macOS puede
/// pedirle confirmación al usuario por CADA lectura cuando la firma de la app
/// no es estable (builds ad-hoc), y cada job leía las 6. Se invalida al
/// guardar o eliminar una clave desde Ajustes.
static API_KEYS_CACHE: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

pub fn invalidate_api_keys_cache() {
    *API_KEYS_CACHE.lock().expect("api keys cache poisoned") = None;
}

fn read_api_keys(app: &AppHandle) -> HashMap<String, String> {
    let mut cache = API_KEYS_CACHE.lock().expect("api keys cache poisoned");
    if let Some(keys) = cache.as_ref() {
        return keys.clone();
    }

    let source = current_source();
    let mut keys = HashMap::new();
    for provider in ALL_PROVIDERS {
        // Best-effort: no todo subcomando necesita todas las claves; el
        // sidecar reporta la que le falte con un job-failed traducible.
        if let Ok(key) = source.get(app, provider) {
            keys.insert(provider.id().to_string(), key);
        }
    }
    *cache = Some(keys.clone());
    keys
}

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
/// vienen de la UI; las claves salen de la fuente de claves (ADR-0011) y nunca
/// del webview. Rust no redeclara los tipos del contrato: construye el JSON.
pub fn build_pipeline_job(
    app: &AppHandle,
    job_id: &str,
    project_dir: Option<String>,
    config: Option<Value>,
    payload: Option<Value>,
) -> Value {
    let mut api_keys = Map::new();
    for (provider_id, key) in read_api_keys(app) {
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
    // binaryPaths: ffmpeg/yt-dlp llegarán como externalBin con la fase de
    // distribución; el contrato ya reserva el campo (ADR-0010).
    job.insert("binaryPaths".into(), json!({}));
    if let Some(payload) = payload {
        job.insert("payload".into(), payload);
    }

    Value::Object(job)
}
