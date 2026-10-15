use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;

use super::download::{check_release, download_archive};
use super::error::ExtensionReleaseError;
use super::manifest::ExtensionRelease;
use super::storage::{find_download, save_download, verified_download_directory};

#[derive(Default)]
pub struct ExtensionDownloads(AtomicBool);

struct DownloadGuard<'a>(&'a AtomicBool);

impl ExtensionDownloads {
    fn start(&self) -> Result<DownloadGuard<'_>, ExtensionReleaseError> {
        self.0
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| ExtensionReleaseError::Busy)?;
        Ok(DownloadGuard(&self.0))
    }
}

impl Drop for DownloadGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

#[tauri::command]
pub async fn check_extension_release() -> Result<ExtensionRelease, ExtensionReleaseError> {
    check_release().await
}

#[tauri::command]
pub async fn find_extension_download(
    app: AppHandle,
    release: ExtensionRelease,
) -> Result<Option<String>, ExtensionReleaseError> {
    release.validate()?;
    let documents = app
        .path()
        .document_dir()
        .map_err(|_| ExtensionReleaseError::DocumentsUnavailable)?;
    tauri::async_runtime::spawn_blocking(move || {
        find_download(&documents, &release)
            .map(|path| path.map(|path| path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|_| ExtensionReleaseError::SaveFailed)?
}

/// Abre sólo la carpeta de un ZIP verificado, nunca una ruta del webview.
/// Se usa el opener nativo para respetar Documentos redirigida fuera de $HOME.
#[tauri::command]
pub async fn open_extension_download_folder(
    app: AppHandle,
    release: ExtensionRelease,
) -> Result<(), ExtensionReleaseError> {
    release.validate()?;
    let documents = app
        .path()
        .document_dir()
        .map_err(|_| ExtensionReleaseError::DocumentsUnavailable)?;
    let directory = tauri::async_runtime::spawn_blocking(move || {
        verified_download_directory(&documents, &release)
    })
    .await
    .map_err(|_| ExtensionReleaseError::SaveFailed)??;
    let directory = directory
        .to_str()
        .ok_or(ExtensionReleaseError::SaveFailed)?;
    app.opener()
        .open_path(directory, None::<&str>)
        .map_err(|_| ExtensionReleaseError::SaveFailed)
}

#[tauri::command]
pub async fn download_extension_release(
    app: AppHandle,
    downloads: State<'_, ExtensionDownloads>,
    release: ExtensionRelease,
) -> Result<String, ExtensionReleaseError> {
    release.validate()?;
    let _guard = downloads.start()?;
    let documents = app
        .path()
        .document_dir()
        .map_err(|_| ExtensionReleaseError::DocumentsUnavailable)?;
    let existing_documents = documents.clone();
    let existing_release = release.clone();
    let existing = tauri::async_runtime::spawn_blocking(move || {
        find_download(&existing_documents, &existing_release)
    })
    .await
    .map_err(|_| ExtensionReleaseError::SaveFailed)??;
    if let Some(path) = existing {
        return Ok(path.to_string_lossy().into_owned());
    }
    let bytes = download_archive(&release).await?;
    tauri::async_runtime::spawn_blocking(move || {
        save_download(&documents, &release, &bytes).map(|path| path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|_| ExtensionReleaseError::SaveFailed)?
}

#[cfg(test)]
#[path = "tests/commands.rs"]
mod tests;
