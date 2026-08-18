use serde::Serialize;
use std::time::Duration;

use crate::api_keys::error::ApiKeyError;
use crate::api_keys::provider::Provider;

/// Una request mínima por proveedor para comprobar que la clave sirve.
/// Portado de `servidor-local/ajustes/validadores.ts` del proyecto origen,
/// unificando acá también el check Fal-Admin que vivía en rutas/ajustes.ts.
/// Sin SDKs: validar no debe arrastrar el provider entero.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationResult {
    pub ok: bool,
    /// Código de error para i18n (`apiKeys.errores.*`); ausente si ok.
    pub code: Option<&'static str>,
}

impl ValidationResult {
    fn success() -> ValidationResult {
        ValidationResult { ok: true, code: None }
    }
    fn failure(error: &ApiKeyError) -> ValidationResult {
        ValidationResult { ok: false, code: Some(error.code()) }
    }
}

fn client() -> Result<reqwest::Client, ApiKeyError> {
    reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|_| ApiKeyError::Network)
}

/// Mapea el status HTTP genérico de un proveedor a nuestro dominio de errores.
fn status_to_error(status: reqwest::StatusCode) -> ApiKeyError {
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return ApiKeyError::InvalidKey;
    }
    ApiKeyError::ProviderError
}

async fn probe(
    url: &str,
    header_name: &str,
    header_value: String,
) -> Result<reqwest::StatusCode, ApiKeyError> {
    let response = client()?
        .get(url)
        .header(header_name, header_value)
        .send()
        .await
        .map_err(|_| ApiKeyError::Network)?;
    Ok(response.status())
}

/// Check especial de Fal: la clave DEBE ser tipo Admin (sin eso la generación
/// de imágenes y el saldo no funcionan — bug histórico del proyecto origen).
/// 403 = la key existe pero no es Admin.
pub async fn check_fal_admin(key: &str) -> Result<(), ApiKeyError> {
    let status = probe(
        "https://api.fal.ai/v1/account/billing?expand=credits",
        "Authorization",
        format!("Key {key}"),
    )
    .await?;
    if status == reqwest::StatusCode::OK {
        return Ok(());
    }
    if status == reqwest::StatusCode::FORBIDDEN {
        return Err(ApiKeyError::NotAdmin);
    }
    Err(status_to_error(status))
}

async fn validate_with_provider(provider: Provider, key: &str) -> Result<(), ApiKeyError> {
    match provider {
        Provider::Fal => check_fal_admin(key).await,
        Provider::DeepInfra => {
            let status = probe(
                "https://api.deepinfra.com/v1/openai/models",
                "Authorization",
                format!("Bearer {key}"),
            )
            .await?;
            if status == reqwest::StatusCode::OK {
                return Ok(());
            }
            Err(status_to_error(status))
        }
        Provider::DubVoice => {
            let status = probe(
                "https://www.dubvoice.ai/api/v1/voices?provider=minimax&page_size=1",
                "Authorization",
                format!("Bearer {key}"),
            )
            .await?;
            if status == reqwest::StatusCode::OK {
                return Ok(());
            }
            Err(status_to_error(status))
        }
        Provider::Evolink => {
            let status = probe(
                "https://api.evolink.ai/v1/models",
                "Authorization",
                format!("Bearer {key}"),
            )
            .await?;
            if status == reqwest::StatusCode::OK {
                return Ok(());
            }
            // Evolink no expone validación directa en todos los planes: un 404
            // no dice nada de la clave — se confirma al generar (como el origen).
            if status == reqwest::StatusCode::NOT_FOUND {
                return Ok(());
            }
            Err(status_to_error(status))
        }
        Provider::ElevenLabs => {
            let status = probe(
                "https://api.elevenlabs.io/v1/user",
                "xi-api-key",
                key.to_string(),
            )
            .await?;
            if status == reqwest::StatusCode::OK {
                return Ok(());
            }
            Err(status_to_error(status))
        }
        Provider::Deepgram => {
            let status = probe(
                "https://api.deepgram.com/v1/projects",
                "Authorization",
                format!("Token {key}"),
            )
            .await?;
            if status == reqwest::StatusCode::OK {
                return Ok(());
            }
            Err(status_to_error(status))
        }
    }
}

pub async fn validate(provider: Provider, key: &str) -> ValidationResult {
    match validate_with_provider(provider, key).await {
        Ok(()) => ValidationResult::success(),
        Err(error) => ValidationResult::failure(&error),
    }
}
