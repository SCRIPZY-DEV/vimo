use serde::Serialize;

/// Solo códigos traducibles: no se exponen URL, rutas privadas ni errores HTTP.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, thiserror::Error)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum ExtensionReleaseError {
    #[error("extension release network failure")]
    Network,
    #[error("extension release unavailable")]
    Unavailable,
    #[error("invalid extension manifest")]
    InvalidManifest,
    #[error("extension download failed")]
    DownloadFailed,
    #[error("extension archive integrity failure")]
    IntegrityFailed,
    #[error("extension archive save failed")]
    SaveFailed,
    #[error("extension download already active")]
    Busy,
}
