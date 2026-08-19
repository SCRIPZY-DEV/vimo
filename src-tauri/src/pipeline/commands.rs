use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

use crate::pipeline::error::PipelineError;
use crate::pipeline::job::build_pipeline_job;
use crate::pipeline::jobs::RunningJobs;

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
/// subcomando, le pasa el PipelineJob por stdin y reenvía sus eventos NDJSON a
/// la webview. Devuelve el jobId con el que la UI filtra los eventos.
#[tauri::command]
pub async fn start_pipeline_job(
    app: AppHandle,
    jobs: State<'_, RunningJobs>,
    subcommand: String,
    payload: Option<Value>,
    config: Option<Value>,
    project_dir: Option<String>,
) -> Result<String, PipelineError> {
    let job_id = uuid::Uuid::new_v4().to_string();
    let job = build_pipeline_job(&app, &job_id, project_dir, config, payload);
    let entry = sidecar_entry()?;

    let (mut events, mut child) = app
        .shell()
        .command("node")
        .args([entry.to_string_lossy().as_ref(), subcommand.as_str()])
        .spawn()
        .map_err(|_| PipelineError::SidecarSpawn)?;

    // El job viaja por stdin (una línea NDJSON): las claves API nunca pasan
    // por argv, donde cualquier proceso del usuario podría listarlas.
    let job_line = format!("{job}\n");
    if child.write(job_line.as_bytes()).is_err() {
        let _ = child.kill();
        return Err(PipelineError::SidecarWrite);
    }

    jobs.0
        .lock()
        .expect("running jobs mutex poisoned")
        .insert(job_id.clone(), child);

    let app_for_events = app.clone();
    let job_id_for_events = job_id.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            match event {
                CommandEvent::Stdout(line) => match serde_json::from_slice::<Value>(&line) {
                    Ok(value) => {
                        let _ = app_for_events.emit(PIPELINE_EVENT_CHANNEL, value);
                    }
                    Err(_) => log::warn!(
                        "sidecar stdout fuera de contrato: {}",
                        String::from_utf8_lossy(&line)
                    ),
                },
                CommandEvent::Stderr(line) => {
                    log::warn!("sidecar stderr: {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Terminated(_) => {
                    let jobs = app_for_events.state::<RunningJobs>();
                    jobs.0
                        .lock()
                        .expect("running jobs mutex poisoned")
                        .remove(&job_id_for_events);
                }
                _ => {}
            }
        }
    });

    Ok(job_id)
}

/// Cancelación cooperativa (ADR-0010): se avisa por stdin y el sidecar aborta
/// con su AbortController; si stdin ya no acepta escrituras, se mata el
/// proceso como fallback.
#[tauri::command]
pub fn cancel_pipeline_job(
    jobs: State<'_, RunningJobs>,
    job_id: String,
) -> Result<(), PipelineError> {
    let mut running = jobs.0.lock().expect("running jobs mutex poisoned");
    let Some(child) = running.get_mut(&job_id) else {
        return Err(PipelineError::JobNotFound);
    };

    if child.write(b"{\"type\":\"cancel\"}\n").is_ok() {
        return Ok(());
    }
    if let Some(child) = running.remove(&job_id) {
        let _ = child.kill();
    }
    Ok(())
}
