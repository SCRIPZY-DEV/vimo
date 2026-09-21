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
fn project_rows_take_name_and_options_from_disk() {
    let root = tempfile::TempDir::new().unwrap();
    let directory = root.path().join("mi-video");
    std::fs::create_dir_all(&directory).unwrap();
    std::fs::write(
        directory.join("project.json"),
        r#"{"name":"Mi video","state":"done","options":{"imageProvider":"fal"}}"#,
    )
    .unwrap();
    let subject = Subject { kind: SubjectKind::Project, id: Some("mi-video".into()), name: None };

    let description = describe_subject(Some(root.path()), Some(&subject));
    assert_eq!(description.project_id.as_deref(), Some("mi-video"));
    assert_eq!(description.project_name.as_deref(), Some("Mi video"));
    assert_eq!(
        description.context,
        json!({
            "imageProvider": "fal",
            "state": "done",
            "subject": { "kind": "project", "id": "mi-video" },
        })
    );
}

#[test]
fn failed_creation_keeps_the_payload_name() {
    let subject = Subject { kind: SubjectKind::Project, id: None, name: Some("Mi video".into()) };
    let description = describe_subject(None, Some(&subject));

    assert_eq!(description.project_id, None);
    assert_eq!(description.project_name.as_deref(), Some("Mi video"));
}

#[test]
fn entities_are_labelled_without_project_id() {
    let subject = Subject { kind: SubjectKind::Style, id: Some("neon".into()), name: Some("Neón".into()) };
    let description = describe_subject(None, Some(&subject));

    assert_eq!(description.project_id, None);
    assert_eq!(description.project_name.as_deref(), Some("Estilo: Neón"));
    assert_eq!(description.context, json!({ "subject": { "kind": "style", "id": "neon" } }));

    let anonymous = describe_subject(None, None);
    assert_eq!(anonymous.project_name, None);
    assert_eq!(anonymous.context, json!({}));
}
