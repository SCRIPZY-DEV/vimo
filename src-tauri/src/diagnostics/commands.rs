use serde_json::Value;
use tauri::AppHandle;

use crate::diagnostics::error::DiagnosticsError;
use crate::diagnostics::spool::{delete_record, list_records};

/// Registros que esperan subirse. Ya están redactados: el webview solo les
/// suma la identidad del usuario.
#[tauri::command]
pub fn list_pending_diagnostic_logs(app: AppHandle) -> Result<Vec<Value>, DiagnosticsError> {
    list_records(&app)
}

/// Se llama tras subir un registro. Recibe un id, nunca una ruta.
#[tauri::command]
pub fn delete_diagnostic_log(app: AppHandle, id: String) -> Result<(), DiagnosticsError> {
    delete_record(&app, &id)
}
