use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};
use tauri_plugin_fs::FsExt;
use tauri_plugin_store::StoreExt;

// Espejo de src/modules/settings/constants.ts — mantener en sincronía.
const SETTINGS_STORE_FILE: &str = "settings.json";
const PROJECTS_ROOT_STORE_KEY: &str = "projectsRoot";
const DEFAULT_PROJECTS_FOLDER_NAME: &str = "Vimo";

fn stored_projects_root(app: &AppHandle) -> Option<PathBuf> {
    let store = app.store(SETTINGS_STORE_FILE).ok()?;
    let value = store.get(PROJECTS_ROOT_STORE_KEY)?;
    value.as_str().map(PathBuf::from)
}

// `~/Documents/Vimo`. En Windows «Documentos» puede estar movida a otro disco
// (`D:\USER\Documents`), así que el default tampoco está garantizado bajo $HOME.
fn default_projects_root(app: &AppHandle) -> Option<PathBuf> {
    let documents = app.path().document_dir().ok()?;
    Some(documents.join(DEFAULT_PROJECTS_FOLDER_NAME))
}

/// Carpeta raíz de proyectos (ADR-0009): la elegida en Ajustes o el default
/// `~/Documents/Vimo`. Bajo ella el sidecar guarda los historiales.
pub fn resolve_projects_root(app: &AppHandle) -> Option<String> {
    stored_projects_root(app)
        .or_else(|| default_projects_root(app))
        .map(|root| root.to_string_lossy().into_owned())
}

/// Crea la carpeta si falta. Una ruta relativa no se crea: se resolvería
/// contra el directorio de trabajo del proceso, no contra la del usuario.
fn create_projects_root(root: &Path) -> std::io::Result<()> {
    if !root.is_absolute() {
        return Ok(());
    }
    std::fs::create_dir_all(root)
}

/// Crea `~/Documents/Vimo` en el arranque cuando es la carpeta en uso (nadie
/// eligió otra). Así el sidecar puede tratar una carpeta de proyectos que no
/// existe como lo que es —un disco desconectado, una carpeta movida o
/// borrada— y avisar, en vez de confundirla con el primer uso y mostrar las
/// bibliotecas vacías. La carpeta elegida en Ajustes no se recrea: crearla
/// vacía escondería justamente ese problema.
pub fn ensure_default_projects_root(app: &AppHandle) {
    if stored_projects_root(app).is_some() {
        return;
    }
    let Some(root) = default_projects_root(app) else {
        return;
    };
    if let Err(error) = create_projects_root(&root) {
        log::warn!("no se pudo crear la carpeta de proyectos por defecto {}: {error}", root.display());
    }
}

fn allow_directory(app: &AppHandle, directory: &Path) -> tauri::Result<()> {
    app.asset_protocol_scope().allow_directory(directory, true)?;
    app.fs_scope().allow_directory(directory, true)?;
    Ok(())
}

/// Da permiso al webview sobre la carpeta guardada y sobre la de por defecto
/// (ADR-0037): el asset protocol para mostrar imágenes y audio con
/// `convertFileSrc`, y el plugin fs para validar, abrir y restablecer. El scope
/// estático `$HOME/**` no cubre otro disco, y el que agrega el dialog se pierde
/// al reiniciar; por eso se repite en cada arranque. El permiso vive en memoria:
/// no hace falta revocar la carpeta anterior al cambiarla, desaparece al cerrar.
pub fn allow_projects_root(app: &AppHandle) {
    let roots = [stored_projects_root(app), default_projects_root(app)];
    for root in roots.into_iter().flatten() {
        // Una ruta vacía o relativa se volvería el patrón `/**`: todo el disco.
        if !root.is_absolute() {
            log::warn!("carpeta de proyectos no absoluta, sin permiso: {}", root.display());
            continue;
        }
        if let Err(error) = allow_directory(app, &root) {
            log::warn!("no se pudo dar permiso a {}: {error}", root.display());
        }
    }
}

#[cfg(test)]
#[path = "tests/projects_root.rs"]
mod tests;
