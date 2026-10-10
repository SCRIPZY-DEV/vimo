use super::*;

use crate::api_keys::provider::ALL_PROVIDERS;
use reqwest::StatusCode;
use serde_json::json;

#[test]
fn kie_accepts_numeric_balance_including_zero() {
    for credits in [0.0, 0.25, 100.0] {
        let body = json!({ "code": 200, "msg": "success", "data": credits });
        assert_eq!(
            validate_kie_response(StatusCode::OK, &body).unwrap(),
            Some(credits)
        );
    }
}

#[test]
fn kie_rejects_missing_or_malformed_success_codes() {
    for body in [
        serde_json::Value::Null,
        json!([]),
        json!({}),
        json!({ "data": 100 }),
        json!({ "code": null, "data": 100 }),
        json!({ "code": "200", "data": 100 }),
        json!({ "code": 200.5, "data": 100 }),
        json!({ "code": true, "data": 100 }),
    ] {
        assert!(
            matches!(
                validate_kie_response(StatusCode::OK, &body),
                Err(ApiKeyError::ProviderError)
            ),
            "malformed response must not validate the key: {body}"
        );
    }
}

#[test]
fn kie_rejects_missing_or_invalid_balance_after_success() {
    for body in [
        json!({ "code": 200 }),
        json!({ "code": 200, "data": null }),
        json!({ "code": 200, "data": "100" }),
        json!({ "code": 200, "data": true }),
        json!({ "code": 200, "data": {} }),
        json!({ "code": 200, "data": [] }),
        json!({ "code": 200, "data": -1 }),
    ] {
        assert!(
            matches!(
                validate_kie_response(StatusCode::OK, &body),
                Err(ApiKeyError::ProviderError)
            ),
            "missing or invalid balance must not validate the key: {body}"
        );
    }
}

#[test]
fn kie_business_authentication_errors_reject_the_key() {
    for code in [401, 403] {
        let body = json!({ "code": code, "data": 100 });
        assert!(matches!(
            validate_kie_response(StatusCode::OK, &body),
            Err(ApiKeyError::InvalidKey)
        ));
    }
}

#[test]
fn kie_other_business_errors_are_provider_failures() {
    for code in [400, 402, 429, 500] {
        let body = json!({ "code": code, "data": 100 });
        assert!(matches!(
            validate_kie_response(StatusCode::OK, &body),
            Err(ApiKeyError::ProviderError)
        ));
    }
}

#[test]
fn kie_http_errors_win_over_a_successful_body() {
    let body = json!({ "code": 200, "data": 100 });
    assert!(matches!(
        validate_kie_response(StatusCode::UNAUTHORIZED, &body),
        Err(ApiKeyError::InvalidKey)
    ));
    for status in [StatusCode::BAD_GATEWAY, StatusCode::TOO_MANY_REQUESTS] {
        assert!(matches!(
            validate_kie_response(status, &body),
            Err(ApiKeyError::ProviderError)
        ));
    }
}

#[test]
fn kie_malformed_response_cannot_produce_success_feedback() {
    let error = validate_kie_response(StatusCode::OK, &serde_json::Value::Null).unwrap_err();
    let result = ValidationResult::failure(&error);
    assert!(!result.ok);
    assert_eq!(result.code, Some("provider_error"));
    assert_eq!(result.credits, None);
}

#[test]
fn heygen_accepts_a_profile_with_username() {
    let body = json!({ "data": { "username": "sebas", "email": "s@x.io", "wallet": {} } });
    assert_eq!(
        validate_heygen_response(StatusCode::OK, &body).unwrap(),
        None
    );
}

#[test]
fn heygen_reads_the_wallet_balance() {
    // Forma real verificada el 2026-10-09: billetera prepago en dólares. Un
    // saldo en cero o entero sigue siendo un saldo legible.
    for (raw, expected) in [
        (json!(3.68), 3.68),
        (json!(120.5), 120.5),
        (json!(5), 5.0),
        (json!(0), 0.0),
    ] {
        let body = json!({
            "data": {
                "username": "sebas",
                "billing_type": "wallet",
                "wallet": {
                    "currency": "usd",
                    "remaining_balance": raw,
                    "auto_reload": { "enabled": false }
                }
            }
        });
        assert_eq!(
            validate_heygen_response(StatusCode::OK, &body).unwrap(),
            Some(expected),
            "the wallet balance must be read as is: {body}"
        );
    }
}

#[test]
fn heygen_without_wallet_is_valid_without_balance() {
    for data in [
        json!({ "username": "sebas" }),
        json!({ "username": "sebas", "wallet": null }),
        json!({ "username": "sebas", "wallet": "usd" }),
        json!({ "username": "sebas", "wallet": {} }),
        json!({ "username": "sebas", "wallet": { "currency": "usd" } }),
    ] {
        let body = json!({ "data": data });
        assert_eq!(
            validate_heygen_response(StatusCode::OK, &body).unwrap(),
            None,
            "an account without wallet is a valid key without balance: {body}"
        );
    }
}

#[test]
fn heygen_ignores_a_malformed_balance() {
    for raw in [
        json!("3.68"),
        json!(-1.5),
        json!(-0.01),
        json!(true),
        json!(null),
        json!([]),
        json!({}),
    ] {
        let body = json!({
            "data": { "username": "sebas", "wallet": { "remaining_balance": raw } }
        });
        assert_eq!(
            validate_heygen_response(StatusCode::OK, &body).unwrap(),
            None,
            "a balance that is not a finite non-negative number must be ignored: {body}"
        );
    }
}

#[test]
fn heygen_normalizes_a_negative_zero_balance() {
    // `-0.0 >= 0.0` es verdadero y `assert_eq!(Some(-0.0), Some(0.0))` también:
    // hay que mirar el signo, porque la UI lo formatearía como «-0,00 US$». Se
    // prueba el valor armado a mano y el JSON tal como llega por la red.
    let mut bodies = vec![json!({
        "data": { "username": "sebas", "wallet": { "remaining_balance": -0.0 } }
    })];
    for raw in ["-0", "-0.0"] {
        let text = r#"{ "data": { "username": "sebas", "wallet": { "remaining_balance": RAW } } }"#
            .replace("RAW", raw);
        bodies.push(serde_json::from_str(&text).unwrap());
    }
    for body in bodies {
        let sent = body["data"]["wallet"]["remaining_balance"]
            .as_f64()
            .unwrap();
        assert!(
            sent.is_sign_negative(),
            "the fixture must carry a negative zero: {body}"
        );
        let balance = validate_heygen_response(StatusCode::OK, &body)
            .unwrap()
            .expect("a zero balance is still a balance");
        assert_eq!(balance, 0.0);
        assert!(
            balance.is_sign_positive(),
            "a negative zero must not reach the UI: {body}"
        );
    }
}

#[test]
fn heygen_accepts_the_usd_currency_in_any_case_or_without_it() {
    // La UI rotula el saldo en dólares: «usd» en cualquier caso, o sin `currency`
    // (se asume USD por la sonda del 2026-10-09), se lee igual.
    for wallet in [
        json!({ "currency": "usd", "remaining_balance": 3.68 }),
        json!({ "currency": "USD", "remaining_balance": 3.68 }),
        json!({ "currency": "Usd", "remaining_balance": 3.68 }),
        json!({ "remaining_balance": 3.68 }),
    ] {
        let body = json!({ "data": { "username": "sebas", "wallet": wallet } });
        assert_eq!(
            validate_heygen_response(StatusCode::OK, &body).unwrap(),
            Some(3.68),
            "a USD (or unlabeled) wallet must show its balance: {body}"
        );
    }
}

#[test]
fn heygen_ignores_a_balance_in_another_currency() {
    // La clave vale igual: solo se descarta el saldo, que la UI mostraría como
    // dólares. Una moneda que ni siquiera es texto tampoco se puede interpretar.
    for currency in [
        json!("eur"),
        json!("EUR"),
        json!("brl"),
        json!(""),
        json!(null),
        json!(840),
    ] {
        let body = json!({
            "data": {
                "username": "sebas",
                "wallet": { "currency": currency, "remaining_balance": 10 }
            }
        });
        assert_eq!(
            validate_heygen_response(StatusCode::OK, &body).unwrap(),
            None,
            "a balance whose currency is not USD must not be shown as dollars: {body}"
        );
    }
}

#[test]
fn heygen_unauthorized_and_forbidden_reject_the_key() {
    let body = json!({ "error": { "code": "unauthorized", "message": "Invalid API key" } });
    for status in [StatusCode::UNAUTHORIZED, StatusCode::FORBIDDEN] {
        assert!(matches!(
            validate_heygen_response(status, &body),
            Err(ApiKeyError::InvalidKey)
        ));
    }
}

#[test]
fn heygen_rejects_a_success_without_profile() {
    for body in [
        serde_json::Value::Null,
        json!({}),
        json!({ "data": null }),
        json!({ "data": {} }),
        json!({ "data": { "username": "" } }),
        json!({ "data": { "username": 42 } }),
        // Un saldo no reemplaza al perfil: sin `username` la clave no se valida.
        json!({ "data": { "wallet": { "remaining_balance": 3.68 } } }),
    ] {
        assert!(
            matches!(
                validate_heygen_response(StatusCode::OK, &body),
                Err(ApiKeyError::ProviderError)
            ),
            "a response without a profile must not validate the key: {body}"
        );
    }
}

#[test]
fn heygen_other_http_errors_are_provider_failures() {
    let body = json!({ "data": { "username": "sebas" } });
    for status in [
        StatusCode::TOO_MANY_REQUESTS,
        StatusCode::BAD_GATEWAY,
        StatusCode::INTERNAL_SERVER_ERROR,
    ] {
        assert!(matches!(
            validate_heygen_response(status, &body),
            Err(ApiKeyError::ProviderError)
        ));
    }
}

#[test]
fn heygen_round_trips_through_provider_ids() {
    assert_eq!(Provider::HeyGen.id(), "heygen");
    assert_eq!(Provider::from_id("heygen").unwrap(), Provider::HeyGen);
    assert!(ALL_PROVIDERS.contains(&Provider::HeyGen));
}
