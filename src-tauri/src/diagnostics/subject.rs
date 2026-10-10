use std::path::Path;

use serde::Serialize;
use serde_json::Value;

/// Qué identifica a un job en el log de diagnóstico (ADR-0038): el proyecto
/// cuando lo hay, y si no, la entidad sobre la que trabaja el subcomando
/// (estilo, personaje, avatar, voz…). Soporte busca por correo + `project_name`,
/// así que toda fila debería llevar un nombre legible.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SubjectKind {
    Project,
    Style,
    Character,
    Avatar,
    Voice,
    Music,
    Demo,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Subject {
    pub kind: SubjectKind,
    pub id: Option<String>,
    pub name: Option<String>,
}

pub const CREATE_PROJECT_SUBCOMMAND: &str = "create-video-project";

/// Palabra del subcomando → familia, en orden de prioridad: gana la primera
/// (`design-style-character` diseña un personaje; `set-project-music` es del
/// proyecto). Espejo conceptual de SUBCOMMAND_MODULE_KEYWORDS del webview.
const SUBCOMMAND_KIND_KEYWORDS: [(&str, SubjectKind); 8] = [
    ("project", SubjectKind::Project),
    ("demo", SubjectKind::Demo),
    ("avatar", SubjectKind::Avatar),
    ("character", SubjectKind::Character),
    ("style", SubjectKind::Style),
    ("music", SubjectKind::Music),
    ("voice", SubjectKind::Voice),
    ("tts", SubjectKind::Voice),
];

/// Etiquetas de `project_name` para lo que no es un proyecto. Son un valor de
/// datos que lee soporte, no texto de la UI: el prefijo fijo permite filtrar
/// (`project_name like 'Estilo:%'`) sin mezclar con proyectos reales.
const STYLE_LABEL: &str = "Estilo";
const CHARACTER_LABEL: &str = "Personaje";
const AVATAR_LABEL: &str = "Avatar";
const VOICE_LABEL: &str = "Voz";
const MUSIC_LABEL: &str = "Música";
const DEMO_LABEL: &str = "Demo";
const LABEL_SEPARATOR: &str = ": ";

/// Dónde vive cada biblioteca bajo la carpeta de proyectos y qué archivo
/// lleva el nombre. Espejo de pipeline/project/paths.ts, styles/style-store.ts,
/// characters/character-library.ts y avatars/avatar-library.ts.
const PROJECT_METADATA_FILE: &str = "project.json";
const STYLES_SUBDIRECTORY: &str = "_styles";
const STYLE_METADATA_FILE: &str = "style.json";
const CHARACTERS_SUBDIRECTORY: &str = "characters";
const CHARACTER_METADATA_FILE: &str = "metadata.json";
const AVATARS_SUBDIRECTORY: &str = "avatars";
const AVATAR_METADATA_FILE: &str = "metadata.json";
const NAME_FIELD: &str = "name";

fn string_field(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .filter(|text| !text.is_empty())
        .map(str::to_owned)
}

fn first_string_of(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_array)
        .and_then(|items| items.first())
        .and_then(Value::as_str)
        .map(str::to_owned)
}

// Superconjunto de los ids de proyecto/estilo ([a-z0-9-]) y de personaje
// ([a-zA-Z0-9_-]): el id viene del payload del webview y arma una ruta, así
// que nunca puede llevar `.`, `/` ni `\`.
pub fn is_safe_entity_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-' || character == '_')
}

fn kind_of(subcommand: &str, payload: Option<&Value>) -> Option<SubjectKind> {
    // Un payload con proyecto es del proyecto, se llame como se llame.
    let has_project = payload
        .map(|payload| payload.get("projectId").is_some() || payload.get("projectIds").is_some())
        .unwrap_or(false);
    if has_project {
        return Some(SubjectKind::Project);
    }

    SUBCOMMAND_KIND_KEYWORDS
        .iter()
        .find(|(keyword, _)| subcommand.contains(keyword))
        .map(|(_, kind)| *kind)
}

/// Extrae del subcomando y del payload lo que identifica al job. Solo ids y
/// nombres de entidades: nunca `text`, `prompt` ni `script`, que son contenido.
pub fn subject_from_payload(subcommand: &str, payload: Option<&Value>) -> Option<Subject> {
    let kind = kind_of(subcommand, payload)?;
    let Some(payload) = payload else {
        return Some(Subject {
            kind,
            id: None,
            name: None,
        });
    };

    let (id, name) = match kind {
        SubjectKind::Project => (
            string_field(payload, "projectId").or_else(|| first_string_of(payload, "projectIds")),
            // Solo la creación trae el nombre: si falla, es lo único que hay.
            string_field(payload, NAME_FIELD),
        ),
        SubjectKind::Style => (
            string_field(payload, "id").or_else(|| string_field(payload, "styleId")),
            string_field(payload, NAME_FIELD),
        ),
        SubjectKind::Character => (string_field(payload, "id"), string_field(payload, NAME_FIELD)),
        // Un avatar que ya está en la biblioteca (payload con `id`) se nombra
        // desde su metadata: en `avatar-generate-look`, `name` es el del look
        // nuevo, no el del avatar. Sin `id` (crear desde foto, agregar del
        // stock) el `name` del payload es el del avatar.
        SubjectKind::Avatar => match string_field(payload, "id") {
            Some(id) => (Some(id), None),
            None => (None, string_field(payload, NAME_FIELD)),
        },
        SubjectKind::Voice => (
            string_field(payload, "voiceId"),
            string_field(payload, "voiceName")
                .or_else(|| string_field(payload, NAME_FIELD))
                .or_else(|| string_field(payload, "provider")),
        ),
        SubjectKind::Music | SubjectKind::Demo => (None, None),
    };

    Some(Subject { kind, id, name })
}

/// Metadata en disco de la entidad (`project.json`, `style.json`,
/// `metadata.json`), si el id es seguro y el archivo existe.
pub fn read_subject_metadata(projects_root: &Path, subject: &Subject) -> Option<Value> {
    let id = subject.id.as_deref().filter(|id| is_safe_entity_id(id))?;
    let path = match subject.kind {
        SubjectKind::Project => projects_root.join(id).join(PROJECT_METADATA_FILE),
        SubjectKind::Style => projects_root
            .join(STYLES_SUBDIRECTORY)
            .join(id)
            .join(STYLE_METADATA_FILE),
        SubjectKind::Character => projects_root
            .join(CHARACTERS_SUBDIRECTORY)
            .join(id)
            .join(CHARACTER_METADATA_FILE),
        SubjectKind::Avatar => projects_root
            .join(AVATARS_SUBDIRECTORY)
            .join(id)
            .join(AVATAR_METADATA_FILE),
        SubjectKind::Voice | SubjectKind::Music | SubjectKind::Demo => return None,
    };
    let body = std::fs::read(path).ok()?;
    serde_json::from_slice(&body).ok()
}

/// Nombre de la entidad: el que vino en el payload o el guardado en disco.
pub fn resolve_subject_name(projects_root: Option<&Path>, subject: &Subject) -> Option<String> {
    if let Some(name) = &subject.name {
        return Some(name.clone());
    }

    let metadata = read_subject_metadata(projects_root?, subject)?;
    string_field(&metadata, NAME_FIELD)
}

/// Etiqueta final para `project_name`. Un proyecto va con su nombre a secas;
/// el resto lleva el prefijo de su familia y, si se conoce, el nombre.
pub fn subject_label(subject: &Subject, name: Option<&str>) -> Option<String> {
    let prefix = match subject.kind {
        SubjectKind::Project => return name.map(str::to_owned),
        SubjectKind::Style => STYLE_LABEL,
        SubjectKind::Character => CHARACTER_LABEL,
        SubjectKind::Avatar => AVATAR_LABEL,
        SubjectKind::Voice => VOICE_LABEL,
        SubjectKind::Music => MUSIC_LABEL,
        SubjectKind::Demo => DEMO_LABEL,
    };

    match name {
        Some(name) => Some(format!("{prefix}{LABEL_SEPARATOR}{name}")),
        None => Some(prefix.to_owned()),
    }
}

#[cfg(test)]
#[path = "tests/subject.rs"]
mod tests;
