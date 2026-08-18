use crate::api_keys::error::ApiKeyError;

/// Proveedores con clave BYO soportados. Espejo del dataset
/// `src/modules/api-keys/providers.ts` — si se agrega uno allá, se agrega acá.
/// (Groq/whisper-local/llama no se portan: ADR-0010.)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Provider {
    DeepInfra,
    Fal,
    Evolink,
    DubVoice,
    ElevenLabs,
    Deepgram,
}

pub const ALL_PROVIDERS: [Provider; 6] = [
    Provider::DeepInfra,
    Provider::Fal,
    Provider::Evolink,
    Provider::DubVoice,
    Provider::ElevenLabs,
    Provider::Deepgram,
];

impl Provider {
    /// Id estable compartido con el frontend y usado como `account` en el keychain.
    pub fn id(&self) -> &'static str {
        match self {
            Provider::DeepInfra => "deepinfra",
            Provider::Fal => "fal",
            Provider::Evolink => "evolink",
            Provider::DubVoice => "dubvoice",
            Provider::ElevenLabs => "elevenlabs",
            Provider::Deepgram => "deepgram",
        }
    }

    pub fn from_id(id: &str) -> Result<Provider, ApiKeyError> {
        match id {
            "deepinfra" => Ok(Provider::DeepInfra),
            "fal" => Ok(Provider::Fal),
            "evolink" => Ok(Provider::Evolink),
            "dubvoice" => Ok(Provider::DubVoice),
            "elevenlabs" => Ok(Provider::ElevenLabs),
            "deepgram" => Ok(Provider::Deepgram),
            _ => Err(ApiKeyError::UnknownProvider),
        }
    }
}

/// Versión enmascarada para mostrar en la UI: nunca viaja la clave completa.
/// Claves cortas se ocultan enteras para no filtrar material útil.
pub fn mask_key(key: &str) -> String {
    let visible = 4;
    if key.len() <= visible * 2 {
        return "•".repeat(key.len().min(12));
    }
    let start: String = key.chars().take(visible).collect();
    let end: String = key.chars().rev().take(visible).collect::<Vec<_>>().into_iter().rev().collect();
    format!("{start}…{end}")
}
