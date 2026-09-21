use super::*;
use serde_json::json;

fn redactor() -> Redactor {
    Redactor::new(
        [String::from("sk-live-1234567890abcdef")],
        Some(String::from("/Users/ana/Documents/Vimo")),
        Some(String::from("/Users/ana")),
    )
}

#[test]
fn replaces_exact_api_keys() {
    let output = redactor().redact("401 for key sk-live-1234567890abcdef rejected");
    assert_eq!(output, "401 for key [REDACTED_KEY] rejected");
}

#[test]
fn replaces_bearer_and_query_tokens() {
    let output = redactor().redact("Authorization: Bearer abc.def.ghi url?key=zzz999&x=1");
    assert_eq!(
        output,
        "Authorization: Bearer [REDACTED_KEY] url?key=[REDACTED_KEY]&x=1"
    );
}

#[test]
fn replaces_projects_root_before_home() {
    let output = redactor()
        .redact("/Users/ana/Documents/Vimo/mi-video/scenes/scene_1.jpg y /Users/ana/Downloads/a.mp3");
    assert_eq!(output, "<projects>/mi-video/scenes/scene_1.jpg y ~/Downloads/a.mp3");
}

#[test]
fn masks_unknown_user_directories() {
    let output = redactor().redact("C:\\Users\\Pedro\\AppData\\x.log and /home/luis/file");
    assert_eq!(output, "C:\\Users\\<user>\\AppData\\x.log and /home/<user>/file");
}

#[test]
fn replaces_windows_path_variants() {
    let redactor = Redactor::new([], Some(String::from("D:\\USER\\Documents\\Vimo")), None);
    assert_eq!(
        redactor.redact("D:/USER/Documents/Vimo/a D:\\\\USER\\\\Documents\\\\Vimo\\\\b"),
        "<projects>/a <projects>\\\\b"
    );
}

#[test]
fn truncates_long_strings() {
    let output = redactor().redact(&"a".repeat(STRING_LIMIT + 50));
    assert_eq!(output.chars().count(), STRING_LIMIT);
}

#[test]
fn keeps_only_allowed_keys() {
    let event = json!({
        "type": "scene-prompt-ready",
        "jobId": "x",
        "scene": { "text": "guion privado", "imagePrompt": "prompt privado" },
        "imagePath": "/Users/ana/Documents/Vimo/a/scene_1.jpg",
        "sceneId": 3,
        "sceneIds": [1, 2],
        "detail": { "nested": "contenido" },
    });
    let entry = redactor().project_event(&event);

    assert_eq!(
        Value::Object(entry),
        json!({ "type": "scene-prompt-ready", "sceneId": 3, "sceneIds": [1, 2] })
    );
}

#[test]
fn provider_failures_keep_their_structured_keys() {
    let event = json!({
        "type": "provider-failure",
        "provider": "fal",
        "code": "image_provider_error",
        "httpStatus": 503,
        "attempt": 1,
        "maxAttempts": 3,
        "recovered": true,
        "detail": "status=503 for /Users/ana/x",
        "prompt": "contenido",
    });
    let entry = redactor().project_event(&event);

    assert_eq!(
        Value::Object(entry),
        json!({
            "type": "provider-failure",
            "provider": "fal",
            "code": "image_provider_error",
            "httpStatus": 503,
            "attempt": 1,
            "maxAttempts": 3,
            "recovered": true,
            "detail": "status=503 for ~/x",
        })
    );
}
