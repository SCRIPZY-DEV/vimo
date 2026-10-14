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
    /// valida lo trae (Kie.ai, PoYo, ai33 y HeyGen). La unidad depende del
    /// proveedor: créditos en Kie.ai, PoYo y ai33, dólares en HeyGen (la UI lo
    /// formatea según el `balanceUnit` del proveedor). La UI lo muestra junto
    /// al «Conectado»: ver el saldo es la prueba de que la clave sirve de verdad.
    pub credits: Option<f64>,
}

impl ValidationResult {
    fn success(credits: Option<f64>) -> ValidationResult {
        ValidationResult {
            ok: true,
            code: None,
            credits,
        }
    }
    fn failure(error: &ApiKeyError) -> ValidationResult {
        ValidationResult {
            ok: false,
            code: Some(error.code()),
            credits: None,
        }
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
/// saldo sale del mismo perfil: `data.wallet.remaining_balance`, prepago en
/// dólares (hecho verificado el 2026-10-09 con una clave real:
/// `billing_type: "wallet"`, `wallet.currency: "usd"`, sin `subscription` ni
/// `usage_based`). La UI rotula ese saldo en dólares, así que se asume USD por
/// esa sonda: si `wallet.currency` viene y no es «usd» (sin distinguir
/// mayúsculas) el saldo se descarta. Una cuenta sin billetera, con otra moneda
/// o con un número que no sirve (texto, negativo, no finito), tiene igual una
/// clave válida: devuelve `Ok(None)` y la UI muestra solo el «Conectado». Un
/// cero con signo (`-0.0`) se normaliza a `0.0`.
fn validate_heygen_response(
    status: reqwest::StatusCode,
    body: &serde_json::Value,
) -> Result<Option<f64>, ApiKeyError> {
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
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
    let wallet = body.get("data").and_then(|data| data.get("wallet"));
    // Sin `currency` se asume USD; con `currency` que no es texto o no es «usd»
    // no se sabe en qué unidad está el número y no se muestra.
    let is_usd = wallet
        .and_then(|wallet| wallet.get("currency"))
        .map_or(true, |currency| {
            currency
                .as_str()
                .is_some_and(|code| code.eq_ignore_ascii_case("usd"))
        });
    if !is_usd {
        return Ok(None);
    }
    let balance = wallet
        .and_then(|wallet| wallet.get("remaining_balance"))
        .and_then(|balance| balance.as_f64())
        .filter(|balance| balance.is_finite() && *balance >= 0.0)
        // `-0.0 >= 0.0` es verdadero: sin esto un cero con signo llegaría a la
        // UI como «-0,00 US$».
        .map(f64::abs);
    Ok(balance)
}

/// Saldo de ai33 (GET /v1/credits). La doc no fija el campo: se acepta el
/// número (o string numérico) en las claves conocidas, en la raíz o en `data`.
/// Sin saldo legible la clave igual sirve (el 200 ya lo probó): no se inventa
/// un cero que bloquearía el pre-check.
fn ai33_credits(body: &serde_json::Value) -> Option<f64> {
    const KEYS: [&str; 4] = ["credits", "credit", "balance", "ec_remain_credits"];
    let number = |value: &serde_json::Value| {
        value
            .as_f64()
            .or_else(|| value.as_str().and_then(|text| text.trim().parse::<f64>().ok()))
            .filter(|credits| credits.is_finite() && *credits >= 0.0)
    };
    [Some(body), body.get("data")]
        .into_iter()
        .flatten()
        .flat_map(|scope| KEYS.iter().filter_map(move |key| scope.get(*key)))
        .find_map(number)
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
        // tiene, no se cobra y trae el saldo de la billetera (en dólares). El
        // encabezado es `X-Api-Key`, no `Authorization`.
        Provider::HeyGen => {
            let (status, body) = probe_json(
                "https://api.heygen.com/v3/users/me",
                "X-Api-Key",
                key.to_string(),
            )
            .await?;
            validate_heygen_response(status, &body)
        }
        // ai33 también se valida contra su saldo, con su header xi-api-key.
        Provider::Ai33 => {
            let (status, body) = probe_json(
                "https://api.ai33.pro/v1/credits",
                "xi-api-key",
                key.to_string(),
            )
            .await?;
            if status == reqwest::StatusCode::FORBIDDEN {
                return Err(ApiKeyError::InvalidKey);
            }
            if status != reqwest::StatusCode::OK {
                return Err(status_to_error(status));
            }
            Ok(ai33_credits(&body))
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
