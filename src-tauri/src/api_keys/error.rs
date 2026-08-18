use serde::Serialize;

/// Errores del dominio de claves API. Se serializan como `{ "code": "..." }`
/// para que la UI traduzca el código a un mensaje i18n (`apiKeys.errores.*`);
/// acá nunca viajan textos user-facing.
#[derive(Debug, thiserror::Error)]
pub enum ApiKeyError {
    #[error("secure storage unavailable")]
    KeychainUnavailable,
    #[error("key not found")]
    NotFound,
    #[error("empty key")]
    EmptyKey,
    #[error("invalid key")]
    InvalidKey,
    #[error("key is not admin")]
    NotAdmin,
    #[error("network error")]
    Network,
    #[error("provider error")]
    ProviderError,
    #[error("unknown provider")]
    UnknownProvider,
    #[error("metadata store error")]
    MetadataStore,
}

impl ApiKeyError {
    pub fn code(&self) -> &'static str {
        match self {
            ApiKeyError::KeychainUnavailable => "keychain_unavailable",
            ApiKeyError::NotFound => "not_found",
            ApiKeyError::EmptyKey => "empty_key",
            ApiKeyError::InvalidKey => "invalid_key",
            ApiKeyError::NotAdmin => "not_admin",
            ApiKeyError::Network => "network",
            ApiKeyError::ProviderError => "provider_error",
            ApiKeyError::UnknownProvider => "unknown_provider",
            ApiKeyError::MetadataStore => "metadata_store",
        }
    }
}

// Tauri exige que el error de un comando sea serializable; el frontend recibe
// el objeto `{ code }` como cuerpo del rechazo del invoke().
impl Serialize for ApiKeyError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("ApiKeyError", 1)?;
        state.serialize_field("code", self.code())?;
        state.end()
    }
}
