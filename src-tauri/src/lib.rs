#[cfg(any(windows, target_os = "linux"))]
use tauri_plugin_deep_link::DeepLinkExt;

mod api_keys;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default()
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_store::Builder::default().build());

  // Android no tiene keychain accesible desde Rust: las claves API van al
  // Android Keystore vía el plugin local (ADR-0011).
  #[cfg(target_os = "android")]
  let builder = builder.plugin(tauri_plugin_secure_keys::init());

  builder
    .invoke_handler(tauri::generate_handler![
      api_keys::commands::get_api_keys_status,
      api_keys::commands::save_api_key,
      api_keys::commands::delete_api_key,
      api_keys::commands::validate_api_key,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      // En Windows/Linux el scheme vimo:// se registra en runtime para que el
      // deep link funcione también en dev; en macOS solo lo registra el bundle
      // (Info.plist), así que en dev el retorno OAuth requiere la app empaquetada e instalad.
      #[cfg(any(windows, target_os = "linux"))]
      app.deep_link().register_all()?;
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
