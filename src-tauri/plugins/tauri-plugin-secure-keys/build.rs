// Sin comandos JS: el plugin se consume solo desde Rust (run_mobile_plugin),
// así que no expone superficie al webview ni necesita permisos en capabilities.
const COMMANDS: &[&str] = &[];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
