use super::*;

fn recorder(subcommand: &str, payload: Option<&Value>) -> DiagnosticRecorder {
    DiagnosticRecorder::new(subcommand, payload, Redactor::new([], None, None))
}

#[test]
fn failure_keeps_code_and_running_stage() {
    let payload = json!({ "projectId": "mi-video" });
    let mut recorder = recorder("run-video-pipeline", Some(&payload));
    recorder.record_event(&json!({ "type": "stage-started", "stageId": "voice" }));
    recorder.record_event(&json!({ "type": "stage-completed", "stageId": "voice" }));
    recorder.record_event(&json!({ "type": "stage-started", "stageId": "images" }));
    recorder.record_event(
        &json!({ "type": "job-failed", "code": "image_timeout", "message": "boom" }),
    );
    let outcome = recorder.finish(Some(1), None);

    assert_eq!(outcome.status, RunStatus::Failed);
    assert_eq!(outcome.error_code.as_deref(), Some("image_timeout"));
    assert_eq!(outcome.failed_stage.as_deref(), Some("images"));
    assert_eq!(outcome.subject.and_then(|subject| subject.id).as_deref(), Some("mi-video"));
}

#[test]
fn failure_keeps_provider_and_http_status() {
    let mut recorder = recorder("generate-voice", None);
    recorder.record_event(&json!({
        "type": "job-failed",
        "code": "voice_invalid_api_key",
        "message": "rejected",
        "provider": "dubvoice",
        "httpStatus": 401,
    }));
    let outcome = recorder.finish(Some(1), None);

    assert_eq!(outcome.error_provider.as_deref(), Some("dubvoice"));
    assert_eq!(outcome.error_http_status, Some(401));
}

#[test]
fn missing_terminal_event_is_a_crash() {
    let mut recorder = recorder("run-video-pipeline", None);
    recorder.record_event(&json!({ "type": "stage-started", "stageId": "render" }));
    let outcome = recorder.finish(None, Some(9));

    assert_eq!(outcome.status, RunStatus::Crashed);
    assert_eq!(outcome.error_code.as_deref(), Some("process_crashed"));
    assert!(outcome.error_message.unwrap().contains("signal Some(9)"));
    assert_eq!(outcome.failed_stage.as_deref(), Some("render"));
    assert_eq!(outcome.events.last().unwrap()["signal"], json!(9));
}

#[test]
fn cancelled_and_awaiting_confirmation_are_not_failures() {
    let mut cancelled = recorder("run-video-pipeline", None);
    cancelled.record_event(&json!({ "type": "job-failed", "code": "cancelled", "message": "" }));
    assert_eq!(cancelled.finish(Some(1), None).status, RunStatus::Cancelled);

    let mut paused = recorder("run-video-pipeline", None);
    paused.record_event(
        &json!({ "type": "job-completed", "result": { "status": "awaiting-confirmation" } }),
    );
    assert_eq!(paused.finish(Some(0), None).status, RunStatus::Paused);
}

#[test]
fn created_project_id_comes_from_the_result() {
    let mut recorder = recorder("create-video-project", None);
    recorder.record_event(
        &json!({ "type": "job-completed", "result": { "projectId": "nuevo", "projectDir": "/x" } }),
    );
    assert_eq!(
        recorder.finish(Some(0), None).subject.and_then(|subject| subject.id).as_deref(),
        Some("nuevo")
    );
}

#[test]
fn failed_creation_keeps_the_name_from_the_payload() {
    let payload = json!({ "name": "Mi video", "script": "guion privado", "options": {} });
    let mut recorder = recorder("create-video-project", Some(&payload));
    recorder.record_event(&json!({ "type": "job-failed", "code": "llm_auth", "message": "401" }));
    let subject = recorder.finish(Some(1), None).subject.unwrap();

    assert_eq!(subject.id, None);
    assert_eq!(subject.name.as_deref(), Some("Mi video"));
}

#[test]
fn mirrored_stderr_lines_are_not_stored_twice() {
    let mut recorder = recorder("run-video-pipeline", None);
    recorder.record_event(&json!({ "type": "log", "level": "warn", "message": "lane failed" }));
    recorder.record_stderr(b"[warn] lane failed");
    recorder.record_stderr(b"TypeError: boom");
    let outcome = recorder.finish(Some(1), None);

    // log + stderr real + process-exited: el espejo del warn no entra.
    assert_eq!(outcome.events.len(), 3);
    assert_eq!(outcome.events[1]["type"], json!("sidecar-stderr"));
}

#[test]
fn progress_is_sampled_by_bucket() {
    let mut recorder = recorder("render-video", None);
    for percent in 0..=100 {
        recorder.record_event(
            &json!({ "type": "render-progress", "percent": percent, "phase": "final" }),
        );
    }
    recorder.record_event(&json!({ "type": "scene-image-progress", "sceneId": 1, "percent": 5 }));
    let outcome = recorder.finish(Some(0), None);

    // 11 tramos (0, 10, …, 100) + process-exited.
    assert_eq!(outcome.events.len(), 12);
}

#[test]
fn long_timelines_keep_head_and_tail() {
    let mut recorder = recorder("run-video-pipeline", None);
    for index in 0..(HEAD_ENTRIES_LIMIT + TAIL_ENTRIES_LIMIT + 100) {
        recorder.record_event(&json!({ "type": "log", "level": "info", "message": index.to_string() }));
    }
    let outcome = recorder.finish(Some(0), None);

    assert!(outcome.events_truncated);
    assert_eq!(outcome.events.len(), HEAD_ENTRIES_LIMIT + TAIL_ENTRIES_LIMIT);
    assert_eq!(outcome.events[0]["message"], json!("0"));
    assert_eq!(outcome.events.last().unwrap()["type"], json!("process-exited"));
}

#[test]
fn avatar_scene_progress_is_sampled_by_time() {
    let payload = json!({ "projectId": "mi-video" });
    let mut recorder = recorder("run-video-pipeline", Some(&payload));
    for step in 0..20 {
        recorder.record_event(&json!({
            "type": "avatar-scene-progress",
            "sceneId": 2,
            "phase": "render",
            "elapsedSeconds": step * 5,
        }));
    }
    recorder.record_event(&json!({ "type": "avatar-scene-ready", "sceneId": 2 }));
    let outcome = recorder.finish(Some(0), None);

    // Sin porcentaje, el progreso de un render de HeyGen se guarda uno por
    // tramo de 30 s (el test corre en menos): un registro, el desenlace y el
    // cierre del proceso.
    let types: Vec<&str> = outcome
        .events
        .iter()
        .filter_map(|event| event["type"].as_str())
        .collect();
    assert_eq!(
        types,
        ["avatar-scene-progress", "avatar-scene-ready", "process-exited"]
    );
}

#[test]
fn avatar_scene_progress_is_sampled_by_type_not_by_scene() {
    let payload = json!({ "projectId": "mi-video" });
    let mut recorder = recorder("run-video-pipeline", Some(&payload));
    // Tres renders en paralelo: sus avisos llegan intercalados y, sin
    // porcentaje, comparten el mismo tramo de 30 s.
    for step in 0..6 {
        for scene_id in [2, 5, 8] {
            recorder.record_event(&json!({
                "type": "avatar-scene-progress",
                "sceneId": scene_id,
                "phase": "render",
                "elapsedSeconds": step * 5,
            }));
        }
    }
    let outcome = recorder.finish(Some(0), None);

    // El cubo se indexa por tipo de evento (y `stageId`, que este no trae),
    // no por escena: de las 18 entradas queda la primera, la de la escena 2,
    // y las escenas 5 y 8 no dejan ninguna.
    let progress: Vec<&Value> = outcome
        .events
        .iter()
        .filter(|event| event["type"] == json!("avatar-scene-progress"))
        .collect();
    assert_eq!(progress.len(), 1);
    assert_eq!(progress[0]["sceneId"], json!(2));
    assert_eq!(outcome.events.len(), 2);
}
