use super::*;

#[test]
fn quiet_subcommands_are_recorded_only_when_they_fail() {
    for subcommand in ["list-video-projects", "video-project-status", "get-image-credits", "update-audio-mix"] {
        assert!(!is_worth_recording(subcommand, RunStatus::Completed));
        assert!(is_worth_recording(subcommand, RunStatus::Failed));
        assert!(is_worth_recording(subcommand, RunStatus::Crashed));
    }
}

#[test]
fn generating_subcommands_are_always_recorded() {
    for subcommand in ["run-video-pipeline", "generate-voice", "character-create", "render-video", "demo-prepare"] {
        assert!(is_worth_recording(subcommand, RunStatus::Completed));
    }
}

#[test]
fn project_context_drops_content() {
    let metadata = json!({
        "name": "Mi video",
        "state": "error",
        "completedStages": ["voice"],
        "promptModelUsed": { "id": "scout", "label": "Scout" },
        "options": {
            "imageProvider": "fal",
            "demo": false,
            "voiceName": "Ana",
            "bgmUrl": "https://youtube.com/x",
            "customStyle": { "systemPrompt": "privado" },
        },
    });

    assert_eq!(
        project_context(&metadata),
        json!({
            "imageProvider": "fal",
            "demo": false,
            "state": "error",
            "completedStages": ["voice"],
            "promptModelUsed": "scout",
        })
    );
}

#[test]
fn project_id_cannot_escape_the_root() {
    assert!(is_valid_project_id("mi-video-2"));
    assert!(!is_valid_project_id("../secretos"));
    assert!(!is_valid_project_id(""));
}
