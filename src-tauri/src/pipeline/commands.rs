use serde_json::Value;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_shell::process::CommandEvent;
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

    running.insert(job_id.clone(), RunningJob { child, project_id });
    drop(running);

    let app_for_events = app.clone();
    let job_id_for_events = job_id.clone();
    let subcommand_for_events = subcommand.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            match event {
                CommandEvent::Stdout(line) => match serde_json::from_slice::<Value>(&line) {
                    Ok(value) => {
                        recorder.record_event(&value);
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
                CommandEvent::Terminated(exit) => {
                    let jobs = app_for_events.state::<RunningJobs>();
                    jobs.0
                        .lock()
                        .expect("running jobs mutex poisoned")
                        .remove(&job_id_for_events);

                    let outcome = recorder.finish(exit.code, exit.signal);
                    store_job_record(
                        &app_for_events,
                        &job_id_for_events,
                        &subcommand_for_events,
                        outcome,
                    );
                    break;
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
    let Some(job) = running.get_mut(&job_id) else {
        return Err(PipelineError::JobNotFound);
    };

    if job.child.write(b"{\"type\":\"cancel\"}\n").is_ok() {
        return Ok(());
    }
    if let Some(job) = running.remove(&job_id) {
        let _ = job.child.kill();
    }
    Ok(())
}
