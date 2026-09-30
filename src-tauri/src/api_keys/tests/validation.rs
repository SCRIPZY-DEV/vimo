use super::*;

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
