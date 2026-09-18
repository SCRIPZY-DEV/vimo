use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::diagnostics::error::DiagnosticsError;
use crate::diagnostics::recorder::DiagnosticRecord;

const SPOOL_FOLDER_NAME: &str = "diagnostics";
const RECORD_EXTENSION: &str = "json";
const TEMPORARY_EXTENSION: &str = "tmp";
/// Sin red o sin sesión el spool crece: se acota por cantidad y por edad.
const SPOOL_FILES_LIMIT: usize = 100;
const SPOOL_MAX_AGE: Duration = Duration::from_secs(7 * 24 * 60 * 60);
/// Registros que se entregan al webview por llamada.
const PENDING_BATCH_LIMIT: usize = 20;

// Junto a vimo.log (macOS: ~/Library/Logs/click.vimo.portable/diagnostics).
fn spool_directory(app: &AppHandle) -> Result<PathBuf, DiagnosticsError> {
    let logs = app
        .path()
        .app_log_dir()
        .map_err(|_| DiagnosticsError::SpoolUnavailable)?;
    Ok(logs.join(SPOOL_FOLDER_NAME))
}

fn record_path(directory: &Path, id: &str) -> PathBuf {
    directory.join(format!("{id}.{RECORD_EXTENSION}"))
}

// Archivos de registro del spool, del más viejo al más nuevo.
fn record_files(directory: &Path) -> Vec<(PathBuf, SystemTime)> {
    let Ok(entries) = fs::read_dir(directory) else {
        return Vec::new();
    };

    let mut files: Vec<(PathBuf, SystemTime)> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|extension| extension.to_str()) == Some(RECORD_EXTENSION))
        .filter_map(|path| {
            let modified = fs::metadata(&path).and_then(|metadata| metadata.modified()).ok()?;
            Some((path, modified))
        })
        .collect();
    files.sort_by_key(|(_, modified)| *modified);
    files
}

// Borra los que sobran por cantidad (los más viejos) y los que superan la edad
// máxima respecto de `now`.
fn prune(directory: &Path, now: SystemTime) {
    let files = record_files(directory);
    let excess = files.len().saturating_sub(SPOOL_FILES_LIMIT);

    for (index, (path, modified)) in files.iter().enumerate() {
        let expired = now
            .duration_since(*modified)
            .map(|age| age > SPOOL_MAX_AGE)
            .unwrap_or(false);
        if index < excess || expired {
            let _ = fs::remove_file(path);
        }
    }
}

// Escritura atómica: el webview nunca lee un registro a medio escribir.
fn write_record_to(directory: &Path, record: &DiagnosticRecord) -> Result<(), DiagnosticsError> {
    fs::create_dir_all(directory).map_err(|_| DiagnosticsError::SpoolUnavailable)?;

    let target = record_path(directory, &record.id);
    let temporary = target.with_extension(TEMPORARY_EXTENSION);
    let body = serde_json::to_vec(record).map_err(|_| DiagnosticsError::SpoolWrite)?;
    fs::write(&temporary, body).map_err(|_| DiagnosticsError::SpoolWrite)?;
    fs::rename(&temporary, &target).map_err(|_| DiagnosticsError::SpoolWrite)?;

    prune(directory, SystemTime::now());
    Ok(())
}

// Registros pendientes de subir, del más viejo al más nuevo. Uno ilegible se
// borra: nunca se va a poder subir y trabaría la cola.
fn list_records_in(directory: &Path) -> Vec<Value> {
    let mut records = Vec::new();

    for (path, _) in record_files(directory) {
        if records.len() == PENDING_BATCH_LIMIT {
            break;
        }

        let parsed = fs::read(&path)
            .ok()
            .and_then(|body| serde_json::from_slice::<Value>(&body).ok());
        match parsed {
            Some(record) => records.push(record),
            None => {
                let _ = fs::remove_file(&path);
            }
        }
    }

    records
}

// El id llega del webview: se valida como UUID para que nunca sea una ruta.
fn delete_record_in(directory: &Path, id: &str) -> Result<(), DiagnosticsError> {
    let id = uuid::Uuid::parse_str(id).map_err(|_| DiagnosticsError::InvalidId)?;
    let path = record_path(directory, &id.to_string());

    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        // Ya subido y borrado por otra pasada: no es un error.
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err(DiagnosticsError::SpoolWrite),
    }
}

/// Escritura atómica: el webview nunca lee un registro a medio escribir.
pub fn write_record(app: &AppHandle, record: &DiagnosticRecord) -> Result<(), DiagnosticsError> {
    write_record_to(&spool_directory(app)?, record)
}

/// Registros pendientes de subir, del más viejo al más nuevo. Uno ilegible se
/// borra: nunca se va a poder subir y trabaría la cola.
pub fn list_records(app: &AppHandle) -> Result<Vec<Value>, DiagnosticsError> {
    Ok(list_records_in(&spool_directory(app)?))
}

/// El id llega del webview: se valida como UUID para que nunca sea una ruta.
pub fn delete_record(app: &AppHandle, id: &str) -> Result<(), DiagnosticsError> {
    delete_record_in(&spool_directory(app)?, id)
}

#[cfg(test)]
#[path = "tests/spool.rs"]
mod tests;
