#[cfg(any(windows, target_os = "linux"))]
use tauri_plugin_deep_link::DeepLinkExt;
#[cfg(desktop)]
use tauri::Manager;

mod api_keys;
mod pipeline;
mod settings;
mod updates;

const LOG_FILE_NAME: &str = "vimo";
const LOG_FILE_MAX_BYTES: u128 = 2_000_000;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default();

  // Debe ser el PRIMER plugin registrado (requisito del plugin). Con la feature
  // deep-link, la URL vimo:// que trae la instancia nueva en argv se reenvía al
  // plugin deep-link de esta instancia, así el onOpenUrl del webview la recibe
  // aunque la app ya estuviera abierta (login OAuth en Windows/Linux, ADR-0026).
  #[cfg(desktop)]
  let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
    if let Some(window) = app.get_webview_window("main") {
      let _ = window.set_focus();
    }
  }));

  // Actualizaciones automáticas (ADR-0027). El chequeo lo dirige el webview
  // (settingsApi.checkForUpdate) al arrancar y desde Ajustes; acá solo se
  // registran el updater y `process` (relaunch tras instalar en macOS).
  #[cfg(desktop)]
  let builder = builder
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init());

  let builder = builder
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_store::Builder::default().build())
    .plugin(tauri_plugin_shell::init());

  // Android no tiene keychain accesible desde Rust: las claves API van al
  // Android Keystore vía el plugin local (ADR-0011).
  #[cfg(target_os = "android")]
  let builder = builder.plugin(tauri_plugin_secure_keys::init());

  builder
    // Hijos vivos del sidecar del pipeline, para poder cancelarlos (ADR-0010).
    .manage(pipeline::jobs::RunningJobs::default())
    .invoke_handler(tauri::generate_handler![
      api_keys::commands::get_api_keys_status,
      api_keys::commands::save_api_key,
      api_keys::commands::delete_api_key,
      api_keys::commands::validate_api_key,
      pipeline::commands::start_pipeline_job,
      pipeline::commands::cancel_pipeline_job,
      settings::commands::sync_projects_root_scope,
      updates::commands::get_update_install_location,
      updates::commands::has_running_pipeline_jobs,
      updates::commands::report_update_install_failure,
    ])
    .setup(|app| {
      // También en release: sin log no hay forma de diagnosticar un fallo del
      // updater en la máquina de un usuario. El archivo queda en el directorio
      // de logs de la app (macOS: ~/Library/Logs/click.vimo.portable).
      app.handle().plugin(
        tauri_plugin_log::Builder::default()
          .level(log::LevelFilter::Info)
          .level_for("tauri_plugin_updater", log::LevelFilter::Debug)
          .targets([
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
              file_name: Some(LOG_FILE_NAME.into()),
            }),
          ])
          .max_file_size(LOG_FILE_MAX_BYTES)
          .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
          .build(),
      )?;
      // La carpeta de proyectos puede estar fuera de $HOME (otro disco, o
      // «Documentos» movida en Windows): se le da permiso en cada arranque para
      // que las imágenes locales se vean y Ajustes pueda validarla (ADR-0037).
      settings::projects_root::allow_projects_root(app.handle());
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
