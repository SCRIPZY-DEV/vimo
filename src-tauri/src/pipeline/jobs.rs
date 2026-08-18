use std::collections::HashMap;
use std::sync::Mutex;

use tauri_plugin_shell::process::CommandChild;

/// Hijos vivos del sidecar por jobId: es lo que permite cancelarlos desde la
/// UI. Cada entrada se limpia cuando su proceso termina.
#[derive(Default)]
pub struct RunningJobs(pub Mutex<HashMap<String, CommandChild>>);
