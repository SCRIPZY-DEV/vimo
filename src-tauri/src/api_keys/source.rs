use std::collections::HashMap;

use tauri::AppHandle;

use crate::api_keys::error::ApiKeyError;
use crate::api_keys::provider::Provider;

/// `service` bajo el que se registran las entradas en el almacén seguro.
/// Coincide con el identifier de la app (tauri.conf.json).
pub const KEYCHAIN_SERVICE: &str = "click.vimo.portable";

/// `account` de la ÚNICA entrada del almacén seguro: guarda todas las claves
/// como un JSON `{ "<providerId>": "<key>" }`. Una sola entrada implica un
/// solo diálogo de macOS por build, en vez de uno por proveedor (ADR-0023).
#[cfg(not(target_os = "android"))]
pub const KEYCHAIN_ACCOUNT: &str = "api-keys";

/// Fuente de claves: hoy manual (el usuario las pega), mañana managed
/// (bajadas de Supabase con la membresía) detrás de este mismo contrato.
/// La implementación se elige por plataforma en compile-time (ADR-0011).
pub trait KeySource {
    fn get(&self, app: &AppHandle, provider: Provider) -> Result<String, ApiKeyError>;
    fn set(&self, app: &AppHandle, provider: Provider, key: &str) -> Result<(), ApiKeyError>;
    fn delete(&self, app: &AppHandle, provider: Provider) -> Result<(), ApiKeyError>;
    /// Todas las claves configuradas, por id de proveedor. Es lo que consume
    /// el pipeline al armar el job.
    fn get_all(&self, app: &AppHandle) -> Result<HashMap<String, String>, ApiKeyError>;
}

/// Keychain de macOS/iOS, Credential Manager de Windows y secret-service de
/// Linux, vía el crate `keyring`. El SO cifra; nosotros no tocamos criptografía.
#[cfg(not(target_os = "android"))]
pub struct KeychainSource;

/// Caché en memoria de las claves por sesión: macOS puede pedir confirmación
/// al usuario por cada lectura cuando la firma de la app no es estable (builds
/// ad-hoc). Con el caché se lee el almacén una sola vez por sesión; set/delete
/// lo actualizan en el mismo paso en que escriben.
#[cfg(not(target_os = "android"))]
static KEYS_CACHE: std::sync::Mutex<Option<HashMap<String, String>>> = std::sync::Mutex::new(None);

#[cfg(not(target_os = "android"))]
impl KeychainSource {
    fn entry(account: &str) -> Result<keyring::Entry, ApiKeyError> {
        keyring::Entry::new(KEYCHAIN_SERVICE, account).map_err(|_| ApiKeyError::KeychainUnavailable)
    }

    fn load() -> Result<HashMap<String, String>, ApiKeyError> {
        let mut cache = KEYS_CACHE.lock().expect("api keys cache poisoned");
        if let Some(keys) = cache.as_ref() {
            return Ok(keys.clone());
        }

        let keys = match Self::entry(KEYCHAIN_ACCOUNT)?.get_password() {
            Ok(raw) => serde_json::from_str(&raw).map_err(|_| ApiKeyError::KeychainUnavailable)?,
            Err(keyring::Error::NoEntry) => Self::migrate_legacy_entries()?,
            Err(_) => return Err(ApiKeyError::KeychainUnavailable),
        };
        *cache = Some(keys.clone());
        Ok(keys)
    }

    fn store(keys: HashMap<String, String>) -> Result<(), ApiKeyError> {
        let entry = Self::entry(KEYCHAIN_ACCOUNT)?;
        if keys.is_empty() {
            // Sin claves no se deja un `{}` colgado en el llavero.
            match entry.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => {}
                Err(_) => return Err(ApiKeyError::KeychainUnavailable),
            }
        } else {
            let raw = serde_json::to_string(&keys).map_err(|_| ApiKeyError::KeychainUnavailable)?;
            entry
                .set_password(&raw)
                .map_err(|_| ApiKeyError::KeychainUnavailable)?;
        }

        *KEYS_CACHE.lock().expect("api keys cache poisoned") = Some(keys);
        Ok(())
    }

    /// Versiones anteriores guardaban una entrada por proveedor (account = id).
    /// Se leen una última vez, se consolidan en la entrada única y se borran
    /// solo las que se pudieron leer: si el usuario negó el diálogo de alguna,
    /// esa queda para reintentar en la próxima carga.
    fn migrate_legacy_entries() -> Result<HashMap<String, String>, ApiKeyError> {
        use crate::api_keys::provider::ALL_PROVIDERS;

        let mut keys = HashMap::new();
        let mut migrated = Vec::new();
        for provider in ALL_PROVIDERS {
            let Ok(entry) = Self::entry(provider.id()) else { continue };
            let Ok(key) = entry.get_password() else { continue };
            keys.insert(provider.id().to_string(), key);
            migrated.push(entry);
        }

        if keys.is_empty() {
            return Ok(keys);
        }

        // La entrada única la crea el binario actual, que queda como dueño del
        // permiso; recién entonces se retiran las entradas viejas.
        let raw = serde_json::to_string(&keys).map_err(|_| ApiKeyError::KeychainUnavailable)?;
        Self::entry(KEYCHAIN_ACCOUNT)?
            .set_password(&raw)
            .map_err(|_| ApiKeyError::KeychainUnavailable)?;
        for entry in migrated {
            // Best-effort: una entrada vieja que no se pudo borrar no invalida
            // la migración; se volverá a intentar solo si desaparece la única.
            let _ = entry.delete_credential();
        }

        Ok(keys)
    }
}

#[cfg(not(target_os = "android"))]
impl KeySource for KeychainSource {
    fn get(&self, _app: &AppHandle, provider: Provider) -> Result<String, ApiKeyError> {
        Self::load()?
            .remove(provider.id())
            .ok_or(ApiKeyError::NotFound)
    }
    fn set(&self, _app: &AppHandle, provider: Provider, key: &str) -> Result<(), ApiKeyError> {
        let mut keys = Self::load()?;
        keys.insert(provider.id().to_string(), key.to_string());
        Self::store(keys)
    }
    fn delete(&self, _app: &AppHandle, provider: Provider) -> Result<(), ApiKeyError> {
        let mut keys = Self::load()?;
        if keys.remove(provider.id()).is_none() {
            return Ok(());
        }
        Self::store(keys)
    }
    fn get_all(&self, _app: &AppHandle) -> Result<HashMap<String, String>, ApiKeyError> {
        Self::load()
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
    fn get_all(&self, app: &AppHandle) -> Result<HashMap<String, String>, ApiKeyError> {
        use crate::api_keys::provider::ALL_PROVIDERS;
        // El Keystore no muestra diálogos: leer por proveedor no tiene costo.
        let mut keys = HashMap::new();
        for provider in ALL_PROVIDERS {
            if let Ok(key) = self.get(app, provider) {
                keys.insert(provider.id().to_string(), key);
            }
        }
        Ok(keys)
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
