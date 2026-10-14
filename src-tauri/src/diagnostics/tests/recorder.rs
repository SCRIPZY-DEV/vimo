use super::*;

fn recorder(subcommand: &str, payload: Option<&Value>) -> DiagnosticRecorder {
    DiagnosticRecorder::new(subcommand, payload, Redactor::new([], None, None))
}

fn emit(recorder: &mut DiagnosticRecorder, event_type: &str, stage_id: &str) {
    recorder.record_event(&json!({ "type": event_type, "stageId": stage_id }));
}

fn fail_job(recorder: &mut DiagnosticRecorder, code: &str) {
    recorder.record_event(&json!({ "type": "job-failed", "code": code, "message": "boom" }));
}

#[test]
fn failure_keeps_code_and_running_stage() {
    let payload = json!({ "projectId": "mi-video" });
    let mut recorder = recorder("run-video-pipeline", Some(&payload));
    recorder.record_event(&json!({ "type": "stage-started", "stageId": "voice" }));
    recorder.record_event(&json!({ "type": "stage-completed", "stageId": "voice" }));
    recorder.record_event(&json!({ "type": "stage-started", "stageId": "images" }));
    recorder
        .record_event(&json!({ "type": "job-failed", "code": "image_timeout", "message": "boom" }));
    let outcome = recorder.finish(Some(1), None);

    assert_eq!(outcome.status, RunStatus::Failed);
    assert_eq!(outcome.error_code.as_deref(), Some("image_timeout"));
    assert_eq!(outcome.failed_stage.as_deref(), Some("images"));
    assert_eq!(
        outcome.subject.and_then(|subject| subject.id).as_deref(),
        Some("mi-video")
    );
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
        recorder
            .finish(Some(0), None)
            .subject
            .and_then(|subject| subject.id)
            .as_deref(),
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
        recorder
            .record_event(&json!({ "type": "log", "level": "info", "message": index.to_string() }));
    }
    let outcome = recorder.finish(Some(0), None);

    assert!(outcome.events_truncated);
    assert_eq!(
        outcome.events.len(),
        HEAD_ENTRIES_LIMIT + TAIL_ENTRIES_LIMIT
    );
    assert_eq!(outcome.events[0]["message"], json!("0"));
    assert_eq!(
        outcome.events.last().unwrap()["type"],
        json!("process-exited")
    );
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
        [
            "avatar-scene-progress",
            "avatar-scene-ready",
            "process-exited"
        ]
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

// Desde la entrega 2h (spec §24.1) el corredor corre `images` y `avatar` a la
// vez: las dos están en curso al mismo tiempo, terminan en cualquier orden y
// el job puede caer con una todavía corriendo. Estos tests fijan qué fase se
// anota como fallida en cada combinación.

#[test]
fn failure_names_images_when_the_avatar_finished_first() {
    let mut recorder = recorder("run-video-pipeline", None);
    emit(&mut recorder, "stage-started", "images");
    emit(&mut recorder, "stage-started", "avatar");
    emit(&mut recorder, "stage-completed", "avatar");
    fail_job(&mut recorder, "image_timeout");
    let outcome = recorder.finish(Some(1), None);

    assert_eq!(outcome.failed_stage.as_deref(), Some("images"));
}

#[test]
fn failure_names_the_avatar_when_images_finished_first() {
    let mut recorder = recorder("run-video-pipeline", None);
    emit(&mut recorder, "stage-started", "images");
    emit(&mut recorder, "stage-started", "avatar");
    emit(&mut recorder, "stage-completed", "images");
    fail_job(&mut recorder, "avatar_insufficient_credits");
    let outcome = recorder.finish(Some(1), None);

    assert_eq!(outcome.failed_stage.as_deref(), Some("avatar"));
    assert_eq!(
        outcome.error_code.as_deref(),
        Some("avatar_insufficient_credits")
    );
}

#[test]
fn failure_names_the_first_stage_started_while_both_still_run() {
    // Falla `images` y el corredor corta el avatar: el avatar no llega a
    // emitir `stage-completed`, pero la que falló es `images`, la primera en
    // arrancar (y la que gana si fallan las dos).
    let mut recorder = recorder("run-video-pipeline", None);
    emit(&mut recorder, "stage-started", "images");
    emit(&mut recorder, "stage-started", "avatar");
    fail_job(&mut recorder, "image_timeout");
    let outcome = recorder.finish(Some(1), None);

    assert_eq!(outcome.failed_stage.as_deref(), Some("images"));
}

#[test]
fn a_stage_that_follows_the_pair_is_named_once_both_finished() {
    // `images` y `avatar` terminan; la siguiente fase arranca y es la que cae.
    let mut recorder = recorder("run-video-pipeline", None);
    emit(&mut recorder, "stage-started", "images");
    emit(&mut recorder, "stage-started", "avatar");
    emit(&mut recorder, "stage-completed", "avatar");
    emit(&mut recorder, "stage-completed", "images");
    emit(&mut recorder, "stage-started", "animation");
    fail_job(&mut recorder, "animation_failed");
    let outcome = recorder.finish(Some(1), None);

    assert_eq!(outcome.failed_stage.as_deref(), Some("animation"));
}

#[test]
fn a_skipped_stage_takes_only_its_own_entry() {
    // Una fase salteada nunca arrancó: no saca a la que corre. Y si la que se
    // saltea es la primera, queda la otra.
    let mut skipped_avatar = recorder("run-video-pipeline", None);
    emit(&mut skipped_avatar, "stage-skipped", "avatar");
    emit(&mut skipped_avatar, "stage-started", "images");
    fail_job(&mut skipped_avatar, "image_timeout");
    assert_eq!(
        skipped_avatar.finish(Some(1), None).failed_stage.as_deref(),
        Some("images")
    );

    let mut skipped_images = recorder("run-video-pipeline", None);
    emit(&mut skipped_images, "stage-started", "images");
    emit(&mut skipped_images, "stage-started", "avatar");
    emit(&mut skipped_images, "stage-skipped", "images");
    fail_job(&mut skipped_images, "avatar_timeout");
    assert_eq!(
        skipped_images.finish(Some(1), None).failed_stage.as_deref(),
        Some("avatar")
    );
}

#[test]
fn closing_a_stage_that_never_started_leaves_the_running_one() {
    let mut recorder = recorder("run-video-pipeline", None);
    emit(&mut recorder, "stage-started", "images");
    emit(&mut recorder, "stage-completed", "avatar");
    fail_job(&mut recorder, "image_timeout");
    let outcome = recorder.finish(Some(1), None);

    assert_eq!(outcome.failed_stage.as_deref(), Some("images"));
}

#[test]
fn a_crash_with_two_stages_running_names_the_first_started() {
    let mut both = recorder("run-video-pipeline", None);
    emit(&mut both, "stage-started", "images");
    emit(&mut both, "stage-started", "avatar");
    let outcome = both.finish(None, Some(9));
    assert_eq!(outcome.status, RunStatus::Crashed);
    assert_eq!(outcome.failed_stage.as_deref(), Some("images"));

    // Si la primera ya terminó, queda la que seguía corriendo.
    let mut one = recorder("run-video-pipeline", None);
    emit(&mut one, "stage-started", "images");
    emit(&mut one, "stage-started", "avatar");
    emit(&mut one, "stage-completed", "images");
    assert_eq!(
        one.finish(None, Some(9)).failed_stage.as_deref(),
        Some("avatar")
    );
}

#[test]
fn one_completion_clears_every_copy_of_a_stage() {
    let mut recorder = recorder("run-video-pipeline", None);
    emit(&mut recorder, "stage-started", "images");
    emit(&mut recorder, "stage-started", "images");
    emit(&mut recorder, "stage-completed", "images");
    fail_job(&mut recorder, "render_failed");
    let outcome = recorder.finish(Some(1), None);

    // Un arranque repetido no deja una copia suelta: la finalización de la fase
    // las saca todas y el fallo no se anota con una fase que ya terminó.
    assert_eq!(outcome.failed_stage, None);
}

#[test]
fn stage_events_without_an_id_change_nothing() {
    let mut recorder = recorder("run-video-pipeline", None);
    recorder.record_event(&json!({ "type": "stage-started" }));
    emit(&mut recorder, "stage-started", "images");
    recorder.record_event(&json!({ "type": "stage-completed" }));
    recorder.record_event(&json!({ "type": "stage-skipped" }));
    fail_job(&mut recorder, "image_timeout");
    let outcome = recorder.finish(Some(1), None);

    assert_eq!(outcome.failed_stage.as_deref(), Some("images"));
}
