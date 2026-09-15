use tauri::AppHandle;

use crate::settings::projects_root::allow_projects_root;

/// Repite el permiso sobre la carpeta de proyectos tras cambiarla o
/// restablecerla (ADR-0037). No recibe la ruta: la lee del store, así el
/// webview no puede pedir permiso sobre una carpeta arbitraria con este comando.
#[tauri::command]
pub fn sync_projects_root_scope(app: AppHandle) {
    allow_projects_root(&app);
}
