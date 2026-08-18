use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use crate::api_keys::error::ApiKeyError;
use crate::api_keys::provider::Provider;

/// Archivo de metadata NO sensible en appDataDir. La clave real vive en el
/// almacén seguro (source.rs); acá solo estado para pintar la UI sin tocar
/// el keychain en cada render. Nunca se escribe una clave en claro acá.
pub const METADATA_STORE_FILE: &str = "api-keys.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyMetadata {
    pub masked_key: String,
    /// Epoch en milisegundos; la UI lo formatea según el idioma.
    pub saved_at: u64,
    pub last_validated_at: Option<u64>,
}

pub fn now_epoch_milliseconds() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

pub fn read_metadata(app: &AppHandle, provider: Provider) -> Option<KeyMetadata> {
    let store = app.store(METADATA_STORE_FILE).ok()?;
    let value = store.get(provider.id())?;
    serde_json::from_value(value).ok()
}

pub fn write_metadata(
    app: &AppHandle,
    provider: Provider,
    metadata: &KeyMetadata,
) -> Result<(), ApiKeyError> {
    let store = app
        .store(METADATA_STORE_FILE)
        .map_err(|_| ApiKeyError::MetadataStore)?;
    let value = serde_json::to_value(metadata).map_err(|_| ApiKeyError::MetadataStore)?;
    store.set(provider.id(), value);
    store.save().map_err(|_| ApiKeyError::MetadataStore)
}

pub fn delete_metadata(app: &AppHandle, provider: Provider) -> Result<(), ApiKeyError> {
    let store = app
        .store(METADATA_STORE_FILE)
        .map_err(|_| ApiKeyError::MetadataStore)?;
    store.delete(provider.id());
    store.save().map_err(|_| ApiKeyError::MetadataStore)
}

pub fn touch_last_validated(app: &AppHandle, provider: Provider) {
    // Best-effort: si la metadata no existe o el store falla, no es un error
    // que deba cortar la validación (la clave ya se probó bien).
    let Some(mut metadata) = read_metadata(app, provider) else {
        return;
    };
    metadata.last_validated_at = Some(now_epoch_milliseconds());
    let _ = write_metadata(app, provider, &metadata);
}
