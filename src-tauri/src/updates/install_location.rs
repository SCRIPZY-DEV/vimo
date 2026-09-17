use std::path::Path;

use serde::Serialize;

/// El plugin updater reemplaza el bundle `.app` con un `rename` hacia la
/// carpeta temporal. Eso falla siempre si la app corre desde un volumen de
/// solo lectura (el DMG montado, App Translocation) o desde otro volumen que
/// la carpeta temporal (disco externo).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum InstallLocation {
    Installable,
    /// macOS ejecuta la app desde una copia de solo lectura porque se abrió
    /// sin moverla (Descargas, o el DMG en versiones viejas de macOS).
    Translocated,
    /// La app vive bajo /Volumes: el DMG montado o un disco externo.
    ExternalVolume,
}

const TRANSLOCATION_MARKER: &str = "/AppTranslocation/";
const VOLUMES_PREFIX: &str = "/Volumes/";

pub fn classify_macos_path(executable: &Path) -> InstallLocation {
    let path = executable.to_string_lossy();

    if path.contains(TRANSLOCATION_MARKER) {
        return InstallLocation::Translocated;
    }

    if path.starts_with(VOLUMES_PREFIX) {
        return InstallLocation::ExternalVolume;
    }

    InstallLocation::Installable
}

#[cfg(target_os = "macos")]
pub fn current_install_location() -> InstallLocation {
    match std::env::current_exe() {
        Ok(executable) => classify_macos_path(&executable),
        // Sin ruta no hay nada que advertir: que decida el intento de instalar.
        Err(_) => InstallLocation::Installable,
    }
}

// En Windows el instalador NSIS no depende de dónde corre la app.
#[cfg(not(target_os = "macos"))]
pub fn current_install_location() -> InstallLocation {
    InstallLocation::Installable
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn applications_folder_is_installable() {
        let path = Path::new("/Applications/Vimo.app/Contents/MacOS/app");
        assert_eq!(classify_macos_path(path), InstallLocation::Installable);
    }

    #[test]
    fn mounted_dmg_is_external_volume() {
        let path = Path::new("/Volumes/Vimo/Vimo.app/Contents/MacOS/app");
        assert_eq!(classify_macos_path(path), InstallLocation::ExternalVolume);
    }

    #[test]
    fn translocated_app_is_detected() {
        let path = Path::new(
            "/private/var/folders/ab/T/AppTranslocation/1234/d/Vimo.app/Contents/MacOS/app",
        );
        assert_eq!(classify_macos_path(path), InstallLocation::Translocated);
    }
}
