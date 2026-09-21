use super::*;

use std::fs;

use serde_json::json;
use tempfile::TempDir;

fn subject(kind: SubjectKind, id: &str) -> Subject {
    Subject {
        kind,
        id: Some(id.to_owned()),
        name: None,
    }
}

#[test]
fn project_payloads_take_the_project_id() {
    let single = json!({ "projectId": "mi-video", "audioPath": "/x.mp3" });
    let many = json!({ "projectIds": ["uno", "dos"] });

    assert_eq!(
        subject_from_payload("upload-narration", Some(&single)),
        Some(subject(SubjectKind::Project, "mi-video"))
    );
    assert_eq!(
        subject_from_payload("delete-video-projects", Some(&many)),
        Some(subject(SubjectKind::Project, "uno"))
    );
    // Un payload con proyecto manda aunque el subcomando sea de otra familia.
    let music = json!({ "prompt": "lo-fi", "projectId": "mi-video" });
    assert_eq!(
        subject_from_payload("generate-music", Some(&music)).map(|subject| subject.kind),
        Some(SubjectKind::Project)
    );
}

#[test]
fn project_creation_keeps_the_name_without_id() {
    let payload = json!({ "name": "Mi video", "script": "guion privado", "options": {} });
    let subject = subject_from_payload(CREATE_PROJECT_SUBCOMMAND, Some(&payload)).unwrap();

    assert_eq!(subject.kind, SubjectKind::Project);
    assert_eq!(subject.id, None);
    assert_eq!(subject.name.as_deref(), Some("Mi video"));
}

#[test]
fn entities_take_id_and_name_but_never_content() {
    let style = json!({ "id": "neon", "name": "Neón", "systemPrompt": "privado" });
    assert_eq!(
        subject_from_payload("style-save", Some(&style)),
        Some(Subject {
            kind: SubjectKind::Style,
            id: Some("neon".into()),
            name: Some("Neón".into())
        })
    );

    let samples = json!({ "styleId": "neon", "imageProvider": "fal" });
    assert_eq!(
        subject_from_payload("generate-style-samples", Some(&samples)),
        Some(subject(SubjectKind::Style, "neon"))
    );

    let character = json!({ "name": "Ana", "description": "privado", "gem": "x" });
    let designed = subject_from_payload("design-style-character", Some(&character)).unwrap();
    assert_eq!(designed.kind, SubjectKind::Character);
    assert_eq!(designed.name.as_deref(), Some("Ana"));

    let voice = json!({ "provider": "dubvoice", "voiceId": "v1", "voiceName": "Rachel", "text": "privado" });
    let generated = subject_from_payload("generate-voice", Some(&voice)).unwrap();
    assert_eq!(
        generated,
        Subject {
            kind: SubjectKind::Voice,
            id: Some("v1".into()),
            name: Some("Rachel".into())
        }
    );

    let probe = json!({ "provider": "elevenlabs" });
    assert_eq!(
        subject_from_payload("probe-tts", Some(&probe)).and_then(|subject| subject.name),
        Some("elevenlabs".into())
    );

    let music = json!({ "prompt": "privado" });
    assert_eq!(
        subject_from_payload("generate-music", Some(&music)),
        Some(Subject {
            kind: SubjectKind::Music,
            id: None,
            name: None
        })
    );
    assert_eq!(
        subject_from_payload("demo-prepare", None),
        Some(Subject {
            kind: SubjectKind::Demo,
            id: None,
            name: None
        })
    );
    assert_eq!(subject_from_payload("list-prompt-models", None), None);
}

#[test]
fn labels_carry_a_fixed_prefix() {
    assert_eq!(
        subject_label(&subject(SubjectKind::Style, "neon"), Some("Neón")).as_deref(),
        Some("Estilo: Neón")
    );
    assert_eq!(
        subject_label(&subject(SubjectKind::Character, "ana-1"), None).as_deref(),
        Some("Personaje")
    );
    assert_eq!(
        subject_label(&subject(SubjectKind::Voice, "v1"), Some("Rachel")).as_deref(),
        Some("Voz: Rachel")
    );
    assert_eq!(
        subject_label(&subject(SubjectKind::Music, ""), None).as_deref(),
        Some("Música")
    );
    assert_eq!(
        subject_label(&subject(SubjectKind::Demo, ""), None).as_deref(),
        Some("Demo")
    );
    assert_eq!(
        subject_label(&subject(SubjectKind::Project, "p"), Some("Mi video")).as_deref(),
        Some("Mi video")
    );
    assert_eq!(subject_label(&subject(SubjectKind::Project, "p"), None), None);
}

#[test]
fn names_are_read_from_the_library_on_disk() {
    let root = TempDir::new().unwrap();
    let style_directory = root.path().join(STYLES_SUBDIRECTORY).join("neon");
    fs::create_dir_all(&style_directory).unwrap();
    fs::write(
        style_directory.join(STYLE_METADATA_FILE),
        r#"{"id":"neon","name":"Neón"}"#,
    )
    .unwrap();
    let character_directory = root.path().join(CHARACTERS_SUBDIRECTORY).join("Ana_x1");
    fs::create_dir_all(&character_directory).unwrap();
    fs::write(character_directory.join(CHARACTER_METADATA_FILE), r#"{"name":"Ana"}"#).unwrap();

    assert_eq!(
        resolve_subject_name(Some(root.path()), &subject(SubjectKind::Style, "neon")).as_deref(),
        Some("Neón")
    );
    assert_eq!(
        resolve_subject_name(Some(root.path()), &subject(SubjectKind::Character, "Ana_x1")).as_deref(),
        Some("Ana")
    );
    // El nombre del payload gana sobre el disco; sin archivo no hay nombre.
    let named = Subject {
        kind: SubjectKind::Style,
        id: Some("neon".into()),
        name: Some("Otro".into()),
    };
    assert_eq!(resolve_subject_name(Some(root.path()), &named).as_deref(), Some("Otro"));
    assert_eq!(
        resolve_subject_name(Some(root.path()), &subject(SubjectKind::Style, "missing")),
        None
    );
    assert_eq!(resolve_subject_name(None, &subject(SubjectKind::Style, "neon")), None);
}

#[test]
fn ids_cannot_escape_the_root() {
    assert!(is_safe_entity_id("mi-video-2"));
    assert!(is_safe_entity_id("Ana_x1"));
    assert!(!is_safe_entity_id("../secretos"));
    assert!(!is_safe_entity_id("a/b"));
    assert!(!is_safe_entity_id(""));

    let root = TempDir::new().unwrap();
    assert_eq!(
        read_subject_metadata(root.path(), &subject(SubjectKind::Project, "../x")),
        None
    );
}
