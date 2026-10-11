use serde_json::{Map, Value};

/// Únicas claves de un evento del sidecar que llegan al log (ADR-0038). Rust no
/// redeclara los tipos de pipeline/runner/events.ts: filtra por nombre de clave.
/// Todo lo que no está acá se descarta — `scene`, `scenes`, `imagePath`,
/// `result`: contenido del usuario o rutas. Una clave nueva no se sube hasta
/// agregarla; nunca sumar una que lleve guion, prompts o rutas.
pub const ALLOWED_EVENT_KEYS: [&str; 31] = [
    "type",
    "stageId",
    "level",
    "code",
    "message",
    "detail",
    "percent",
    "phase",
    "kind",
    "status",
    "sceneId",
    "sceneIds",
    "pass",
    "maxPasses",
    "modelId",
    "provider",
    "ready",
    "total",
    "totalChars",
    "elapsedSeconds",
    "partIndex",
    "partTotal",
    "suggestedScenes",
    "audioDurationSeconds",
    "wordCount",
    "secondsPerScene",
    // avatar-planned (ADR-0057): apariciones del avatar que no entraron.
    "dropped",
    // provider-failure y job-failed: proveedor, status HTTP y reintento.
    "httpStatus",
    "attempt",
    "maxAttempts",
    "recovered",
];

/// Tope de cada string del log.
pub const STRING_LIMIT: usize = 2000;
/// Tope de un array numérico (`sceneIds`).
const ARRAY_LIMIT: usize = 100;
/// Una clave más corta que esto no se busca: reemplazaría texto común.
const SECRET_MIN_LENGTH: usize = 8;

const REDACTED_KEY: &str = "[REDACTED_KEY]";
const PROJECTS_PLACEHOLDER: &str = "<projects>";
const HOME_PLACEHOLDER: &str = "~";
const USER_PLACEHOLDER: &str = "<user>";

/// Marcadores tras los que viene un secreto hasta el próximo separador.
const SECRET_MARKERS: [&str; 6] = [
    "Bearer ",
    "bearer ",
    "api_key=",
    "apikey=",
    "key=",
    "token=",
];
/// Prefijos de carpeta de usuario: el segmento siguiente es el nombre de la cuenta.
const USER_DIRECTORY_MARKERS: [&str; 5] = [
    "/Users/",
    "/home/",
    "\\Users\\",
    "\\\\Users\\\\",
    "/users/",
];

/// Quita secretos y rutas personales de los strings del log. Conoce los valores
/// reales de las claves API y las carpetas del usuario: reemplaza por
/// coincidencia exacta y deja los marcadores genéricos como segunda red.
pub struct Redactor {
    secrets: Vec<String>,
    paths: Vec<(String, &'static str)>,
}

// Una ruta de Windows puede aparecer tal cual, con `/` o con las barras
// escapadas de un JSON incrustado en el mensaje.
fn path_variants(path: &str) -> Vec<String> {
    let mut variants = vec![path.to_owned()];
    if path.contains('\\') {
        variants.push(path.replace('\\', "/"));
        variants.push(path.replace('\\', "\\\\"));
    }
    variants
}

fn is_secret_end(character: char) -> bool {
    character.is_whitespace() || matches!(character, '&' | '"' | '\'' | ',' | ';' | ')' | '}' | ']')
}

fn is_path_separator(character: char) -> bool {
    is_secret_end(character) || matches!(character, '/' | '\\' | ':')
}

// Reemplaza lo que sigue a cada aparición de `marker` hasta que `is_end` corte.
fn replace_after_marker(
    text: &str,
    marker: &str,
    replacement: &str,
    is_end: fn(char) -> bool,
) -> String {
    let mut output = String::with_capacity(text.len());
    let mut rest = text;

    while let Some(position) = rest.find(marker) {
        let after = &rest[position + marker.len()..];
        let end = after.find(is_end).unwrap_or(after.len());
        output.push_str(&rest[..position + marker.len()]);
        if end > 0 {
            output.push_str(replacement);
        }
        rest = &after[end..];
    }

    output.push_str(rest);
    output
}

impl Redactor {
    pub fn new(
        api_keys: impl IntoIterator<Item = String>,
        projects_root: Option<String>,
        home: Option<String>,
    ) -> Self {
        let secrets = api_keys
            .into_iter()
            .filter(|key| key.len() >= SECRET_MIN_LENGTH)
            .collect();

        // La carpeta de proyectos va primero: suele vivir DENTRO del home.
        let mut paths = Vec::new();
        for (path, placeholder) in [
            (projects_root, PROJECTS_PLACEHOLDER),
            (home, HOME_PLACEHOLDER),
        ] {
            let Some(path) = path.filter(|path| path.len() > 1) else {
                continue;
            };
            for variant in path_variants(&path) {
                paths.push((variant, placeholder));
            }
        }

        Self { secrets, paths }
    }

    pub fn redact(&self, text: &str) -> String {
        let mut output = text.to_owned();

        for secret in &self.secrets {
            output = output.replace(secret, REDACTED_KEY);
        }
        for marker in SECRET_MARKERS {
            output = replace_after_marker(&output, marker, REDACTED_KEY, is_secret_end);
        }
        for (path, placeholder) in &self.paths {
            output = output.replace(path, placeholder);
        }
        for marker in USER_DIRECTORY_MARKERS {
            output = replace_after_marker(&output, marker, USER_PLACEHOLDER, is_path_separator);
        }

        output.chars().take(STRING_LIMIT).collect()
    }

    // Strings redactados, números y booleanos tal cual, arrays solo numéricos.
    // Objetos y arrays de otra cosa se descartan: ahí viaja contenido.
    fn project_value(&self, value: &Value) -> Option<Value> {
        match value {
            Value::String(text) => Some(Value::String(self.redact(text))),
            Value::Number(_) | Value::Bool(_) => Some(value.clone()),
            Value::Array(items) if items.iter().all(Value::is_number) => Some(Value::Array(
                items.iter().take(ARRAY_LIMIT).cloned().collect(),
            )),
            _ => None,
        }
    }

    /// Proyección de un evento del sidecar a su entrada del log.
    pub fn project_event(&self, event: &Value) -> Map<String, Value> {
        let mut entry = Map::new();
        let Some(fields) = event.as_object() else {
            return entry;
        };

        for key in ALLOWED_EVENT_KEYS {
            let Some(value) = fields.get(key).and_then(|value| self.project_value(value)) else {
                continue;
            };
            entry.insert(key.to_owned(), value);
        }

        entry
    }
}

#[cfg(test)]
#[path = "tests/redaction.rs"]
mod tests;
