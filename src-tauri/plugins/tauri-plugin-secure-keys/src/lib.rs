//! Almacén seguro de claves para Android (ADR-0011).
//!
//! Delegación en Kotlin: una clave AES-256-GCM generada en el AndroidKeyStore
//! (hardware-backed cuando el dispositivo lo soporta) cifra los valores, que se
//! guardan en SharedPreferences privadas de la app. El material de la clave
//! nunca sale del Keystore.
//!
//! En plataformas no-Android este crate compila como stub que falla en runtime,
//! para que `cargo check` del workspace pase en cualquier máquina; la app solo
//! lo enlaza en target android.

#[cfg(target_os = "android")]
use serde::{Deserialize, Serialize};
use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[cfg(mobile)]
    #[error(transparent)]
    PluginInvoke(#[from] tauri::plugin::mobile::PluginInvokeError),
    #[error("secure keys is only supported on android")]
    UnsupportedPlatform,
}

pub type Result<T> = std::result::Result<T, Error>;

#[cfg(target_os = "android")]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AccountRequest<'a> {
    account: &'a str,
}

#[cfg(target_os = "android")]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SetRequest<'a> {
    account: &'a str,
    value: &'a str,
}

#[cfg(target_os = "android")]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetResponse {
    value: Option<String>,
}

#[cfg(target_os = "android")]
pub struct SecureKeys<R: Runtime>(tauri::plugin::PluginHandle<R>);

// PhantomData<fn() -> R> y no PhantomData<R>: el marcador debe ser Send + Sync
// para poder manejarse como estado de Tauri sin exigirle eso al Runtime.
#[cfg(not(target_os = "android"))]
pub struct SecureKeys<R: Runtime>(std::marker::PhantomData<fn() -> R>);

#[cfg(target_os = "android")]
impl<R: Runtime> SecureKeys<R> {
    pub fn get(&self, account: &str) -> Result<Option<String>> {
        let response: GetResponse = self
            .0
            .run_mobile_plugin("get", AccountRequest { account })?;
        Ok(response.value)
    }
    pub fn set(&self, account: &str, value: &str) -> Result<()> {
        self.0
            .run_mobile_plugin::<()>("set", SetRequest { account, value })?;
        Ok(())
    }
    pub fn delete(&self, account: &str) -> Result<()> {
        self.0
            .run_mobile_plugin::<()>("delete", AccountRequest { account })?;
        Ok(())
    }
}

#[cfg(not(target_os = "android"))]
impl<R: Runtime> SecureKeys<R> {
    pub fn get(&self, _account: &str) -> Result<Option<String>> {
        Err(Error::UnsupportedPlatform)
    }
    pub fn set(&self, _account: &str, _value: &str) -> Result<()> {
        Err(Error::UnsupportedPlatform)
    }
    pub fn delete(&self, _account: &str) -> Result<()> {
        Err(Error::UnsupportedPlatform)
    }
}

/// Acceso al plugin desde cualquier `Manager` (AppHandle, App, Window).
pub trait SecureKeysExt<R: Runtime> {
    fn secure_keys(&self) -> tauri::State<'_, SecureKeys<R>>;
}

impl<R: Runtime, T: Manager<R>> SecureKeysExt<R> for T {
    fn secure_keys(&self) -> tauri::State<'_, SecureKeys<R>> {
        self.state::<SecureKeys<R>>()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("secure-keys")
        .setup(|app, _api| {
            #[cfg(target_os = "android")]
            {
                let handle = _api
                    .register_android_plugin("click.vimo.plugin.securekeys", "SecureKeysPlugin")?;
                app.manage(SecureKeys(handle));
            }
            #[cfg(not(target_os = "android"))]
            {
                app.manage(SecureKeys::<R>(std::marker::PhantomData));
            }
            Ok(())
        })
        .build()
}
