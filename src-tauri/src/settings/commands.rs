use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use crate::settings::projects_root::{allow_projects_root, resolve_projects_root};

/// Repite el permiso sobre la carpeta de proyectos tras cambiarla o
/// restablecerla (ADR-0037). No recibe la ruta: la lee del store, así el
/// webview no puede pedir permiso sobre una carpeta arbitraria con este comando.
#[tauri::command]
pub fn sync_projects_root_scope(app: AppHandle) {
    allow_projects_root(&app);
}

/// Abre la carpeta de proyectos en el explorador del sistema. El scope de
/// `opener:allow-open-path` es estático (`$HOME/**`) y el plugin no deja
/// ampliarlo en runtime, así que una carpeta en otro disco se rechazaba desde
/// el webview; desde Rust no pasa por ese scope. Tampoco recibe la ruta: abre
/// solo la carpeta guardada (o la de por defecto).
#[tauri::command]
pub fn open_projects_root(app: AppHandle) -> Result<(), String> {
    let root = resolve_projects_root(&app).ok_or("projects root unavailable")?;
    app.opener()
        .open_path(root, None::<&str>)
        .map_err(|error| error.to_string())
}
