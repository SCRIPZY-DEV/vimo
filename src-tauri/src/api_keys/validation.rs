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
    /// Saldo leído en la misma comprobación, cuando el endpoint con el que se
    /// valida es el de saldo (Kie.ai y PoYo). La UI lo muestra junto al
    /// «Conectado»: ver el saldo es la prueba de que la clave sirve de verdad.
    pub credits: Option<f64>,
}

impl ValidationResult {
    fn success(credits: Option<f64>) -> ValidationResult {
        ValidationResult { ok: true, code: None, credits }
    }
    fn failure(error: &ApiKeyError) -> ValidationResult {
        ValidationResult { ok: false, code: Some(error.code()), credits: None }
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

/// Como `probe`, pero conserva el cuerpo JSON: los proveedores de animación y
/// el de avatar validan contra un endpoint cuyo cuerpo importa. Un cuerpo que
/// no es JSON se trata como vacío, nunca como fallo de red.
async fn probe_json(
    url: &str,
    header_name: &str,
    header_value: String,
) -> Result<(reqwest::StatusCode, serde_json::Value), ApiKeyError> {
    let response = client()?
        .get(url)
        .header(header_name, header_value)
        .send()
        .await
        .map_err(|_| ApiKeyError::Network)?;
    let status = response.status();
    let body = response
        .json::<serde_json::Value>()
        .await
        .unwrap_or(serde_json::Value::Null);
    Ok((status, body))
}

/// Kie exige tanto éxito de negocio como saldo numérico en su endpoint:
/// https://docs.kie.ai/common-api/get-account-credits
/// Un HTTP 200 con JSON vacío o incompleto no demuestra que la clave sirve.
fn validate_kie_response(
    status: reqwest::StatusCode,
    body: &serde_json::Value,
) -> Result<Option<f64>, ApiKeyError> {
    if status != reqwest::StatusCode::OK {
        return Err(status_to_error(status));
    }
    match body.get("code").and_then(|code| code.as_i64()) {
        Some(200) => {}
        Some(401) | Some(403) => return Err(ApiKeyError::InvalidKey),
        _ => return Err(ApiKeyError::ProviderError),
    }
    let credits = body
        .get("data")
        .and_then(|data| data.as_f64())
        .filter(|credits| credits.is_finite() && *credits >= 0.0)
        .ok_or(ApiKeyError::ProviderError)?;
    Ok(Some(credits))
}

/// HeyGen (ADR-0057) responde 200 con el perfil (`data.username`) cuando la
/// clave sirve y 401/403 cuando no. Un 200 sin perfil no demuestra nada. El
/// saldo no se lee todavía: la unidad de `wallet` / `usage_based` se confirma
/// con la sonda de la entrega 1 (diseño §17) y entra con la entrega 2.
fn validate_heygen_response(
    status: reqwest::StatusCode,
    body: &serde_json::Value,
) -> Result<Option<f64>, ApiKeyError> {
    if status == reqwest::StatusCode::UNAUTHORIZED
        || status == reqwest::StatusCode::FORBIDDEN
    {
        return Err(ApiKeyError::InvalidKey);
    }
    if status != reqwest::StatusCode::OK {
        return Err(status_to_error(status));
    }
    let has_profile = body
        .get("data")
        .and_then(|data| data.get("username"))
        .and_then(|username| username.as_str())
        .is_some_and(|username| !username.is_empty());
    if !has_profile {
        return Err(ApiKeyError::ProviderError);
    }
    Ok(None)
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

/// Ok(saldo) cuando la clave sirve; el saldo solo viene de los proveedores
/// cuyo endpoint de validación es el de saldo.
async fn validate_with_provider(provider: Provider, key: &str) -> Result<Option<f64>, ApiKeyError> {
    match provider {
        Provider::Fal => check_fal_admin(key).await.map(|_| None),
        Provider::DeepInfra => {
            let status = probe(
                "https://api.deepinfra.com/v1/openai/models",
                "Authorization",
                format!("Bearer {key}"),
            )
            .await?;
            if status == reqwest::StatusCode::OK {
                return Ok(None);
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
                return Ok(None);
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
                return Ok(None);
            }
            // Evolink no expone validación directa en todos los planes: un 404
            // no dice nada de la clave — se confirma al generar (como el origen).
            if status == reqwest::StatusCode::NOT_FOUND {
                return Ok(None);
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
                return Ok(None);
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
                return Ok(None);
            }
            Err(status_to_error(status))
        }
        // Los dos proveedores de animación se validan contra su endpoint de
        // saldo, que es la lectura más barata que tienen, y el saldo leído
        // vuelve en el resultado (pedido del dueño 2026-09-12: ver el saldo al
        // probar la clave es la prueba de que funcionó). Kie devuelve el error
        // en `code` CON HTTP 200, así que se mira el cuerpo, no solo el status.
        Provider::Kie => {
            let (status, body) = probe_json(
                "https://api.kie.ai/api/v1/chat/credit",
                "Authorization",
                format!("Bearer {key}"),
            )
            .await?;
            validate_kie_response(status, &body)
        }
        Provider::Poyo => {
            let (status, body) = probe_json(
                "https://api.poyo.ai/api/user/balance",
                "Authorization",
                format!("Bearer {key}"),
            )
            .await?;
            if status != reqwest::StatusCode::OK {
                return Err(status_to_error(status));
            }
            Ok(body
                .get("data")
                .and_then(|data| data.get("credits_amount"))
                .and_then(|credits| credits.as_f64()))
        }
        // HeyGen (ADR-0057): el perfil del usuario es la lectura más barata que
        // tiene y no se cobra. El encabezado es `X-Api-Key`, no `Authorization`.
        Provider::HeyGen => {
            let (status, body) = probe_json(
                "https://api.heygen.com/v3/users/me",
                "X-Api-Key",
                key.to_string(),
            )
            .await?;
            validate_heygen_response(status, &body)
        }
    }
}

pub async fn validate(provider: Provider, key: &str) -> ValidationResult {
    match validate_with_provider(provider, key).await {
        Ok(credits) => ValidationResult::success(credits),
        Err(error) => ValidationResult::failure(&error),
    }
}

#[cfg(test)]
#[path = "tests/validation.rs"]
mod tests;
