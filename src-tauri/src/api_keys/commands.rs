use serde::Serialize;
use tauri::AppHandle;

use crate::api_keys::error::ApiKeyError;
use crate::api_keys::provider::{mask_key, Provider, ALL_PROVIDERS};
use crate::api_keys::source::{current_source, KeySource};
use crate::api_keys::store;
use crate::api_keys::validation::{self, ValidationResult};

/// Estado por proveedor que ve la UI. NUNCA incluye la clave completa.
/// `source` anticipa la membresía: 'manual' hoy, 'managed' cuando las claves
/// bajen de Supabase (ADR-0011).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyStatus {
    pub provider_id: &'static str,
    pub configured: bool,
    pub source: &'static str,
    pub masked_key: Option<String>,
    pub saved_at: Option<u64>,
    pub last_validated_at: Option<u64>,
}

#[tauri::command]
pub fn get_api_keys_status(app: AppHandle) -> Vec<ApiKeyStatus> {
    ALL_PROVIDERS
        .iter()
        .map(|provider| {
            let metadata = store::read_metadata(&app, *provider);
            ApiKeyStatus {
                provider_id: provider.id(),
                configured: metadata.is_some(),
                source: "manual",
                masked_key: metadata.as_ref().map(|m| m.masked_key.clone()),
                saved_at: metadata.as_ref().map(|m| m.saved_at),
                last_validated_at: metadata.as_ref().and_then(|m| m.last_validated_at),
            }
        })
        .collect()
}

#[tauri::command]
pub async fn save_api_key(
    app: AppHandle,
    provider_id: String,
    key: String,
) -> Result<(), ApiKeyError> {
    let provider = Provider::from_id(&provider_id)?;
    let key = key.trim().to_string();
    if key.is_empty() {
        return Err(ApiKeyError::EmptyKey);
    }

    // Fal exige clave tipo Admin: se chequea ANTES de persistir para que el
    // error llegue al guardar y no días después al generar. Un fallo de red
    // no bloquea el guardado (igual que el origen): se valida al usar.
    if provider == Provider::Fal {
        match validation::check_fal_admin(&key).await {
            Ok(()) => {}
            Err(ApiKeyError::Network) => {}
            Err(error) => return Err(error),
        }
    }

    current_source().set(&app, provider, &key)?;
    // El pipeline cachea las claves por sesión: un cambio debe verse ya.
    crate::pipeline::job::invalidate_api_keys_cache();
    let metadata = store::KeyMetadata {
        masked_key: mask_key(&key),
        saved_at: store::now_epoch_milliseconds(),
        last_validated_at: None,
    };
    store::write_metadata(&app, provider, &metadata)
}

#[tauri::command]
pub fn delete_api_key(app: AppHandle, provider_id: String) -> Result<(), ApiKeyError> {
    let provider = Provider::from_id(&provider_id)?;
    current_source().delete(&app, provider)?;
    crate::pipeline::job::invalidate_api_keys_cache();
    store::delete_metadata(&app, provider)
}

#[tauri::command]
pub async fn validate_api_key(
    app: AppHandle,
    provider_id: String,
    key: Option<String>,
) -> Result<ValidationResult, ApiKeyError> {
    let provider = Provider::from_id(&provider_id)?;
    let key_to_check = match key.map(|k| k.trim().to_string()) {
        Some(k) if !k.is_empty() => k,
        // Sin clave explícita se prueba la guardada.
        _ => current_source().get(&app, provider)?,
    };

    let result = validation::validate(provider, &key_to_check).await;
    if result.ok {
        store::touch_last_validated(&app, provider);
    }
    Ok(result)
}
