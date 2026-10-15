use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use super::download::{check_release, download_archive, save_archive};
use super::error::ExtensionReleaseError;
use super::manifest::ExtensionRelease;

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
pub async fn download_extension_release(
    app: AppHandle,
    downloads: State<'_, ExtensionDownloads>,
    release: ExtensionRelease,
) -> Result<Option<String>, ExtensionReleaseError> {
    release.validate()?;
    let _guard = downloads.start()?;
    let archive_name = release.archive_name();
    let selected = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .add_filter("ZIP", &["zip"])
            .set_file_name(archive_name)
            .blocking_save_file()
    })
    .await
    .map_err(|_| ExtensionReleaseError::SaveFailed)?;
    let Some(selected) = selected else {
        return Ok(None);
    };
    let destination = selected
        .into_path()
        .map_err(|_| ExtensionReleaseError::SaveFailed)?;
    let bytes = download_archive(&release).await?;
    tauri::async_runtime::spawn_blocking(move || {
        save_archive(&release, &bytes, &destination)?;
        Ok(Some(destination.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|_| ExtensionReleaseError::SaveFailed)?
}

#[cfg(test)]
#[path = "tests/commands.rs"]
mod tests;
