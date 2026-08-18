use tauri::AppHandle;

use crate::api_keys::error::ApiKeyError;
use crate::api_keys::provider::Provider;

/// `service` bajo el que se registran las entradas en el almacén seguro.
/// Coincide con el identifier de la app (tauri.conf.json).
pub const KEYCHAIN_SERVICE: &str = "click.vimo.portable";

/// Fuente de claves: hoy manual (el usuario las pega), mañana managed
/// (bajadas de Supabase con la membresía) detrás de este mismo contrato.
/// La implementación se elige por plataforma en compile-time (ADR-0011).
pub trait KeySource {
    fn get(&self, app: &AppHandle, provider: Provider) -> Result<String, ApiKeyError>;
    fn set(&self, app: &AppHandle, provider: Provider, key: &str) -> Result<(), ApiKeyError>;
    fn delete(&self, app: &AppHandle, provider: Provider) -> Result<(), ApiKeyError>;
}

/// Keychain de macOS/iOS, Credential Manager de Windows y secret-service de
/// Linux, vía el crate `keyring`. El SO cifra; nosotros no tocamos criptografía.
#[cfg(not(target_os = "android"))]
pub struct KeychainSource;

#[cfg(not(target_os = "android"))]
impl KeychainSource {
    fn entry(provider: Provider) -> Result<keyring::Entry, ApiKeyError> {
        keyring::Entry::new(KEYCHAIN_SERVICE, provider.id())
            .map_err(|_| ApiKeyError::KeychainUnavailable)
    }
}

#[cfg(not(target_os = "android"))]
impl KeySource for KeychainSource {
    fn get(&self, _app: &AppHandle, provider: Provider) -> Result<String, ApiKeyError> {
        match Self::entry(provider)?.get_password() {
            Ok(key) => Ok(key),
            Err(keyring::Error::NoEntry) => Err(ApiKeyError::NotFound),
            Err(_) => Err(ApiKeyError::KeychainUnavailable),
        }
    }
    fn set(&self, _app: &AppHandle, provider: Provider, key: &str) -> Result<(), ApiKeyError> {
        Self::entry(provider)?
            .set_password(key)
            .map_err(|_| ApiKeyError::KeychainUnavailable)
    }
    fn delete(&self, _app: &AppHandle, provider: Provider) -> Result<(), ApiKeyError> {
        match Self::entry(provider)?.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(ApiKeyError::KeychainUnavailable),
        }
    }
}

/// Android: delega en el plugin local `tauri-plugin-secure-keys` (Kotlin +
/// Android Keystore). El crate `keyring` no tiene backend para Android.
#[cfg(target_os = "android")]
pub struct AndroidKeystoreSource;

#[cfg(target_os = "android")]
impl KeySource for AndroidKeystoreSource {
    fn get(&self, app: &AppHandle, provider: Provider) -> Result<String, ApiKeyError> {
        use tauri_plugin_secure_keys::SecureKeysExt;
        match app.secure_keys().get(provider.id()) {
            Ok(Some(key)) => Ok(key),
            Ok(None) => Err(ApiKeyError::NotFound),
            Err(_) => Err(ApiKeyError::KeychainUnavailable),
        }
    }
    fn set(&self, app: &AppHandle, provider: Provider, key: &str) -> Result<(), ApiKeyError> {
        use tauri_plugin_secure_keys::SecureKeysExt;
        app.secure_keys()
            .set(provider.id(), key)
            .map_err(|_| ApiKeyError::KeychainUnavailable)
    }
    fn delete(&self, app: &AppHandle, provider: Provider) -> Result<(), ApiKeyError> {
        use tauri_plugin_secure_keys::SecureKeysExt;
        app.secure_keys()
            .delete(provider.id())
            .map_err(|_| ApiKeyError::KeychainUnavailable)
    }
}

#[cfg(not(target_os = "android"))]
pub fn current_source() -> impl KeySource {
    KeychainSource
}

#[cfg(target_os = "android")]
pub fn current_source() -> impl KeySource {
    AndroidKeystoreSource
}
