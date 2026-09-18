use tauri::{AppHandle, State};

use crate::diagnostics::report::store_update_failure;
use crate::pipeline::jobs::RunningJobs;
use crate::updates::install_location::{current_install_location, InstallLocation};

/// Tope del detalle que el webview puede mandar al log.
const FAILURE_DETAIL_LIMIT: usize = 2000;

/// Dice si la app corre desde un lugar donde el updater puede reemplazarla.
#[tauri::command]
pub fn get_update_install_location() -> InstallLocation {
    current_install_location()
}

/// Instalar reinicia la app y, en Windows, los sidecars en curso bloquean los
/// archivos que el instalador tiene que reemplazar: con un job vivo no se instala.
#[tauri::command]
pub fn has_running_pipeline_jobs(jobs: State<'_, RunningJobs>) -> bool {
    match jobs.0.lock() {
        Ok(running) => !running.is_empty(),
        // Un mutex envenenado no debe impedir actualizar.
        Err(_) => false,
    }
}

/// El plugin updater devuelve el error al webview sin registrarlo: el webview
/// lo reenvía acá para que quede en el archivo de log de la app y en el log de
/// diagnóstico que se sube a soporte (ADR-0038).
#[tauri::command]
pub fn report_update_install_failure(app: AppHandle, detail: String) {
    let detail: String = detail.chars().take(FAILURE_DETAIL_LIMIT).collect();
    let executable = std::env::current_exe()
        .map(|path| path.display().to_string())
        .unwrap_or_else(|_| String::from("desconocido"));

    log::error!("fallo al instalar la actualización: {detail} (ejecutable: {executable})");
    store_update_failure(&app, &format!("{detail} (ejecutable: {executable})"));
}
