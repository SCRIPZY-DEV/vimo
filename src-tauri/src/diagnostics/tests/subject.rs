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

#[test]
fn avatar_subcommands_are_their_own_family() {
    let create = subject_from_payload(
        "avatar-create-photo",
        Some(&json!({ "name": "Ana", "photoPath": "/x/ana.png" })),
    )
    .expect("avatar subject");
    assert_eq!(create.kind, SubjectKind::Avatar);
    assert_eq!(create.id, None);
    assert_eq!(create.name.as_deref(), Some("Ana"));

    // Agregar un avatar del stock: el nombre del listado viaja en el payload
    // solo para esta fila (el sidecar no lo usa).
    let added = subject_from_payload(
        "avatar-add",
        Some(&json!({ "groupId": "group-1", "ownership": "stock", "name": "Bob" })),
    )
    .expect("avatar subject");
    assert_eq!(added.kind, SubjectKind::Avatar);
    assert_eq!(added.id, None);
    assert_eq!(added.name.as_deref(), Some("Bob"));

    let refreshed = subject_from_payload("avatar-refresh", Some(&json!({ "id": "ana-abc123" })))
        .expect("avatar subject");
    assert_eq!(refreshed.id.as_deref(), Some("ana-abc123"));
    assert_eq!(
        subject_from_payload("avatars-list", None).map(|subject| subject.kind),
        Some(SubjectKind::Avatar)
    );

    assert_eq!(
        subject_label(&subject(SubjectKind::Avatar, "ana-abc123"), Some("Ana")).as_deref(),
        Some("Avatar: Ana")
    );
    assert_eq!(
        subject_label(&subject(SubjectKind::Avatar, "ana-abc123"), None).as_deref(),
        Some("Avatar")
    );
}

#[test]
fn avatar_names_are_read_from_the_library_on_disk() {
    let root = TempDir::new().unwrap();
    let avatar_directory = root.path().join(AVATARS_SUBDIRECTORY).join("ana-abc123");
    fs::create_dir_all(&avatar_directory).unwrap();
    fs::write(
        avatar_directory.join(AVATAR_METADATA_FILE),
        r#"{ "name": "Ana", "lookId": "look-1" }"#,
    )
    .unwrap();

    assert_eq!(
        resolve_subject_name(Some(root.path()), &subject(SubjectKind::Avatar, "ana-abc123")).as_deref(),
        Some("Ana")
    );
    // Un id con `..` nunca sale de la carpeta raíz, también para avatares.
    assert_eq!(
        read_subject_metadata(root.path(), &subject(SubjectKind::Avatar, "../x")),
        None
    );
}

#[test]
fn a_generated_look_is_logged_under_its_avatar_name() {
    let root = TempDir::new().unwrap();
    let avatar_directory = root.path().join(AVATARS_SUBDIRECTORY).join("ana-abc123");
    fs::create_dir_all(&avatar_directory).unwrap();
    fs::write(
        avatar_directory.join(AVATAR_METADATA_FILE),
        r#"{ "name": "Ana", "groupId": "group-1", "looks": [] }"#,
    )
    .unwrap();

    // «Crear escenario»: `name` es el del look nuevo, no el del avatar.
    let generated = subject_from_payload(
        "avatar-generate-look",
        Some(&json!({
            "id": "ana-abc123",
            "prompt": "privado",
            "aspectRatio": "auto",
            "name": "Cocina luminosa"
        })),
    )
    .expect("avatar subject");
    assert_eq!(generated.id.as_deref(), Some("ana-abc123"));
    assert_eq!(generated.name, None);

    let name = resolve_subject_name(Some(root.path()), &generated);
    assert_eq!(
        subject_label(&generated, name.as_deref()).as_deref(),
        Some("Avatar: Ana")
    );
}

#[test]
fn avatar_scene_renders_are_logged_under_their_project() {
    let root = TempDir::new().unwrap();
    let project_directory = root.path().join("mi-video");
    fs::create_dir_all(&project_directory).unwrap();
    fs::write(
        project_directory.join(PROJECT_METADATA_FILE),
        r#"{ "name": "Mi video" }"#,
    )
    .unwrap();

    // Lleva `projectId`: es un job del proyecto aunque su nombre empiece con
    // «avatar» (ADR-0038; ruling de la entrega 2 de la ADR-0057).
    let render = subject_from_payload(
        "avatar-render-scenes",
        Some(&json!({ "projectId": "mi-video", "sceneIds": [2, 5] })),
    )
    .expect("project subject");
    assert_eq!(render, subject(SubjectKind::Project, "mi-video"));

    let name = resolve_subject_name(Some(root.path()), &render);
    assert_eq!(
        subject_label(&render, name.as_deref()).as_deref(),
        Some("Mi video")
    );
}
