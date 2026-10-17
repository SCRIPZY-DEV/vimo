use std::time::Duration;

use reqwest::{Client, StatusCode};
use sha2::{Digest, Sha256};

use super::error::ExtensionReleaseError;
use super::manifest::ExtensionRelease;
use super::{
    CONNECT_TIMEOUT_SECONDS, DOWNLOAD_TIMEOUT_SECONDS, MANIFEST_TIMEOUT_SECONDS,
    MAX_MANIFEST_BYTES, READ_TIMEOUT_SECONDS, RELEASE_MANIFEST_URL,
};

fn release_client() -> Result<Client, ExtensionReleaseError> {
    Client::builder()
        .https_only(true)
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(CONNECT_TIMEOUT_SECONDS))
        .read_timeout(Duration::from_secs(READ_TIMEOUT_SECONDS))
        .build()
        .map_err(|_| ExtensionReleaseError::Network)
}

pub async fn check_release() -> Result<ExtensionRelease, ExtensionReleaseError> {
    let client = release_client()?;
    let bytes = fetch_bytes(
        &client,
        RELEASE_MANIFEST_URL,
        MAX_MANIFEST_BYTES,
        MANIFEST_TIMEOUT_SECONDS,
        ExtensionReleaseError::Unavailable,
        ExtensionReleaseError::InvalidManifest,
    )
    .await?;
    let release: ExtensionRelease =
        serde_json::from_slice(&bytes).map_err(|_| ExtensionReleaseError::InvalidManifest)?;
    release.validate()?;
    Ok(release)
}

pub async fn download_archive(
    release: &ExtensionRelease,
) -> Result<Vec<u8>, ExtensionReleaseError> {
    release.validate()?;
    let bytes = fetch_bytes(
        &release_client()?,
        &release.download_url,
        release.size_bytes as usize,
        DOWNLOAD_TIMEOUT_SECONDS,
        ExtensionReleaseError::DownloadFailed,
        ExtensionReleaseError::IntegrityFailed,
    )
    .await?;
    verify_archive(release, &bytes)?;
    Ok(bytes)
}

/// El límite se aplica aun sin Content-Length y durante la lectura del body;
/// un 200 truncado o una desconexión posterior a los headers no da éxito.
async fn fetch_bytes(
    client: &Client,
    url: &str,
    max_bytes: usize,
    timeout_seconds: u64,
    status_error: ExtensionReleaseError,
    size_error: ExtensionReleaseError,
) -> Result<Vec<u8>, ExtensionReleaseError> {
    let mut response = client
        .get(url)
        .header(reqwest::header::ACCEPT_ENCODING, "identity")
        .header(reqwest::header::CACHE_CONTROL, "no-cache")
        .timeout(Duration::from_secs(timeout_seconds))
        .send()
        .await
        .map_err(|_| ExtensionReleaseError::Network)?;
    if response.status() != StatusCode::OK {
        return Err(status_error);
    }
    if response
        .content_length()
        .is_some_and(|size| size > max_bytes as u64)
    {
        return Err(size_error);
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| ExtensionReleaseError::Network)?
    {
        if chunk.len() > max_bytes.saturating_sub(bytes.len()) {
            return Err(size_error);
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

pub(super) fn verify_archive(
    release: &ExtensionRelease,
    bytes: &[u8],
) -> Result<(), ExtensionReleaseError> {
    if bytes.len() as u64 != release.size_bytes
        || !bytes.starts_with(b"PK\x03\x04")
        || !format!("{:x}", Sha256::digest(bytes)).eq_ignore_ascii_case(&release.sha256)
    {
        return Err(ExtensionReleaseError::IntegrityFailed);
    }
    Ok(())
}

#[cfg(test)]
#[path = "tests/download.rs"]
mod tests;
