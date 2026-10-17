use std::{env, path::PathBuf};

// El manifiesto de Windows pide Common Controls v6, donde viven funciones que
// usa tauri-plugin-dialog (`TaskDialogIndirect`). tauri-build solo lo incrusta
// en el binario de la app: el ejecutable de `cargo test` arrancaba sin él y
// Windows lo abortaba con STATUS_ENTRYPOINT_NOT_FOUND. Lo incrusta el linker,
// que sí alcanza a la app y a los tests; tauri-build deja de ponerlo para no
// duplicarlo.
const WINDOWS_APP_MANIFEST: &str = "windows-app-manifest.xml";

fn main() {
  embed_windows_manifest();

  let windows = tauri_build::WindowsAttributes::new_without_app_manifest();
  tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows))
    .expect("failed to run tauri-build");
}

fn embed_windows_manifest() {
  let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
  let target_env = env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();
  if target_os != "windows" || target_env != "msvc" {
    return;
  }

  let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap()).join(WINDOWS_APP_MANIFEST);
  println!("cargo:rerun-if-changed={WINDOWS_APP_MANIFEST}");
  println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
  println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
}
