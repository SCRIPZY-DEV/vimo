use std::path::Path;

use serde_json::{Map, Value};

/// Rutas absolutas de los binarios que viajan como externalBin (ffmpeg y
/// yt-dlp, ADR-0013). Tauri los copia SIN sufijo de target-triple junto al
/// ejecutable de la app — en `target/debug` durante dev, en `Contents/MacOS`
/// dentro del bundle de macOS y junto a `Vimo.exe` en la carpeta de
/// instalación de Windows — así que basta mirar al lado de `current_exe`.
///
/// Best-effort, como las API keys: si un binario falta, el campo no se
/// inserta y el sidecar reporta el faltante con un job-failed traducible
/// (`ffmpeg_missing` / `ytdlp_missing`).
pub fn resolve_binary_paths() -> Value {
    let mut paths = Map::new();

    let Ok(executable) = std::env::current_exe() else {
        return Value::Object(paths);
    };
    let Some(directory) = executable.parent() else {
        return Value::Object(paths);
    };

    // Tauri conserva el sufijo de ejecutable de la plataforma al copiar los
    // externalBin: `ffmpeg.exe` en Windows, `ffmpeg` en el resto (ADR-0026).
    let ffmpeg_name = format!("ffmpeg{}", std::env::consts::EXE_SUFFIX);
    let yt_dlp_name = format!("yt-dlp{}", std::env::consts::EXE_SUFFIX);
    insert_if_present(&mut paths, directory, &ffmpeg_name, "ffmpeg");
    insert_if_present(&mut paths, directory, &yt_dlp_name, "ytDlp");

    Value::Object(paths)
}

fn insert_if_present(
    paths: &mut Map<String, Value>,
    directory: &Path,
    binary_name: &str,
    contract_field: &str,
) {
    let candidate = directory.join(binary_name);
    if !candidate.is_file() {
        return;
    }
    paths.insert(
        contract_field.into(),
        Value::String(candidate.to_string_lossy().into_owned()),
    );
}
