use serde_json::{json, Map, Value};
use tauri::AppHandle;

use crate::api_keys::provider::ALL_PROVIDERS;
use crate::api_keys::source::{current_source, KeySource};

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
    let source = current_source();
    let mut api_keys = Map::new();
    for provider in ALL_PROVIDERS {
        // Best-effort: no todo subcomando necesita todas las claves; el
        // sidecar reporta la que le falte con un job-failed traducible.
        if let Ok(key) = source.get(app, provider) {
            api_keys.insert(provider.id().to_string(), Value::String(key));
        }
    }

    let mut job = Map::new();
    job.insert("jobId".into(), json!(job_id));
    if let Some(dir) = project_dir {
        job.insert("projectDir".into(), Value::String(dir));
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
