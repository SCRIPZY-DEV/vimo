use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use tauri_plugin_shell::process::CommandChild;

/// Hijos vivos del sidecar por jobId: es lo que permite cancelarlos desde la
/// UI. Cada entrada se limpia cuando su proceso termina.
#[derive(Default)]
pub struct RunningJobs(pub Mutex<HashMap<String, RunningJob>>);

pub struct RunningJob {
    pub child: CommandChild,
    pub project_id: Option<String>,
    /// Lo marca `cancel_pipeline_job` al pedir la cancelación (por stdin o con
    /// el kill de respaldo). Lo comparte el loop de eventos del job, así que
    /// sigue a mano aunque la entrada ya no esté en el mapa: si el proceso
    /// termina sin evento terminal, Rust cierra el job con `cancelled` y no con
    /// `sidecar_exited` (ADR-0010, enmienda 2026-10-15).
    pub cancel_requested: Arc<AtomicBool>,
}
