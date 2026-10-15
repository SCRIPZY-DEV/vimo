use std::fs::{self, File, OpenOptions};
use std::io::{ErrorKind, Read, Write};
use std::path::{Path, PathBuf};

use super::download::verify_archive;
use super::error::ExtensionReleaseError;
use super::manifest::{extension_version_parts, ExtensionRelease};

const MAX_DOWNLOAD_CANDIDATES: usize = 20;

#[derive(PartialEq)]
enum CandidateState {
    Missing,
    Occupied,
    Verified,
}

fn download_directory(documents: &Path) -> Result<PathBuf, ExtensionReleaseError> {
    if !documents.is_absolute() {
        return Err(ExtensionReleaseError::DocumentsUnavailable);
    }
    Ok(documents.join("Vimo").join("Extensiones"))
}

fn candidate_path(directory: &Path, release: &ExtensionRelease, index: usize) -> PathBuf {
    if index == 0 {
        return directory.join(release.archive_name());
    }
    directory.join(format!("vimo-automate-{} ({index}).zip", release.version))
}

fn open_without_following_link(path: &Path) -> std::io::Result<File> {
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        // O_NONBLOCK también evita bloquearse si un FIFO reemplazó al archivo.
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        // FILE_FLAG_OPEN_REPARSE_POINT: abre el enlace, nunca su destino.
        const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
        options.custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
    }
    options.open(path)
}

fn is_regular_archive(metadata: &fs::Metadata) -> bool {
    // En Windows, FileType distingue enlaces NameSurrogate de archivos Cloud Files.
    // OneDrive también usa reparse points para archivos regulares: no se rechaza
    // ese atributo por sí solo. El handle y los bytes se verifican igualmente.
    metadata.is_file() && !metadata.file_type().is_symlink()
}

fn candidate_state(
    path: &Path,
    release: &ExtensionRelease,
) -> Result<CandidateState, ExtensionReleaseError> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(CandidateState::Missing),
        Err(_) => return Err(ExtensionReleaseError::SaveFailed),
    };
    if !is_regular_archive(&metadata) || metadata.len() != release.size_bytes {
        return Ok(CandidateState::Occupied);
    }
    let file = match open_without_following_link(path) {
        Ok(file) => file,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(CandidateState::Missing),
        #[cfg(unix)]
        Err(error) if error.raw_os_error() == Some(libc::ELOOP) => {
            return Ok(CandidateState::Occupied)
        }
        Err(_) => return Err(ExtensionReleaseError::SaveFailed),
    };
    // Se comprueba el handle abierto: una sustitución entre metadata/open no
    // convierte un enlace, directorio o FIFO en un ZIP válido.
    let metadata = file
        .metadata()
        .map_err(|_| ExtensionReleaseError::SaveFailed)?;
    if !is_regular_archive(&metadata) || metadata.len() != release.size_bytes {
        return Ok(CandidateState::Occupied);
    }
    let mut bytes = Vec::new();
    file.take(release.size_bytes + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| ExtensionReleaseError::SaveFailed)?;
    if verify_archive(release, &bytes).is_err() {
        return Ok(CandidateState::Occupied);
    }
    Ok(CandidateState::Verified)
}

/// Sólo consulta archivos reales; no crea carpetas ni confía en un recibo de UI.
/// La raíz Documentos la resuelve Tauri (Known Folder/XDG); puede estar redirigida.
pub(super) fn find_download(
    documents: &Path,
    release: &ExtensionRelease,
) -> Result<Option<PathBuf>, ExtensionReleaseError> {
    release.validate()?;
    let directory = download_directory(documents)?;
    match fs::metadata(&directory) {
        Ok(metadata) if !metadata.is_dir() => return Err(ExtensionReleaseError::SaveFailed),
        Ok(_) => {}
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(ExtensionReleaseError::SaveFailed),
    }
    for index in 0..MAX_DOWNLOAD_CANDIDATES {
        let candidate = candidate_path(&directory, release, index);
        if candidate_state(&candidate, release)? == CandidateState::Verified {
            return Ok(Some(candidate));
        }
    }
    Ok(None)
}

fn managed_archive_version(name: &str) -> Option<[u16; 4]> {
    let stem = name.strip_prefix("vimo-automate-")?.strip_suffix(".zip")?;
    let version = match stem.split_once(" (") {
        Some((version, suffix)) => {
            let number = suffix.strip_suffix(')')?;
            if number.starts_with('0') || !number.bytes().all(|byte| byte.is_ascii_digit()) {
                return None;
            }
            let index = number.parse::<usize>().ok()?;
            if !(1..MAX_DOWNLOAD_CANDIDATES).contains(&index) {
                return None;
            }
            version
        }
        None => stem,
    };
    extension_version_parts(version)
}

/// Sólo tras una descarga válida: borra ZIPs anteriores con nombres administrados
/// por Vimo dentro de su carpeta dedicada. No recorre carpetas ni sigue enlaces.
/// true indica limpieza incompleta; el ZIP nuevo sigue siendo un éxito válido.
pub(super) fn cleanup_previous_downloads(documents: &Path, release: &ExtensionRelease) -> bool {
    if !matches!(find_download(documents, release), Ok(Some(_))) {
        return true;
    }
    let Some(current) = extension_version_parts(&release.version) else {
        return true;
    };
    let Ok(directory) = download_directory(documents) else {
        return true;
    };
    let Ok(entries) = fs::read_dir(directory) else {
        return true;
    };
    let mut incomplete = false;
    for entry in entries {
        let Ok(entry) = entry else {
            incomplete = true;
            continue;
        };
        let name = entry.file_name();
        let Some(previous) = name.to_str().and_then(managed_archive_version) else {
            continue;
        };
        if previous >= current {
            continue;
        }
        let kind = match entry.file_type() {
            Ok(kind) => kind,
            Err(_) => {
                incomplete = true;
                continue;
            }
        };
        if !kind.is_file() || kind.is_symlink() {
            continue;
        }
        if let Err(error) = fs::remove_file(entry.path()) {
            incomplete |= error.kind() != ErrorKind::NotFound;
        }
    }
    incomplete
}

/// Para abrir la carpeta se exige que el ZIP siga presente y conserve su hash.
/// No crea directorios ni permite resolver una ruta suministrada por el webview.
pub(super) fn verified_download_directory(
    documents: &Path,
    release: &ExtensionRelease,
) -> Result<PathBuf, ExtensionReleaseError> {
    let archive = find_download(documents, release)?.ok_or(ExtensionReleaseError::SaveFailed)?;
    archive
        .parent()
        .map(Path::to_path_buf)
        .ok_or(ExtensionReleaseError::SaveFailed)
}

/// Reutiliza sólo bytes verificados. Una colisión conserva el archivo ajeno y
/// prueba el siguiente nombre; persist_noclobber decide el ganador atómicamente.
pub(super) fn save_download(
    documents: &Path,
    release: &ExtensionRelease,
    bytes: &[u8],
) -> Result<PathBuf, ExtensionReleaseError> {
    release.validate()?;
    verify_archive(release, bytes)?;
    if let Some(path) = find_download(documents, release)? {
        return Ok(path);
    }
    let directory = download_directory(documents)?;
    fs::create_dir_all(&directory).map_err(|_| ExtensionReleaseError::SaveFailed)?;
    let mut temporary = tempfile::Builder::new()
        .prefix(".vimo-extension-")
        .tempfile_in(&directory)
        .map_err(|_| ExtensionReleaseError::SaveFailed)?;
    temporary
        .write_all(bytes)
        .and_then(|_| temporary.as_file().sync_all())
        .map_err(|_| ExtensionReleaseError::SaveFailed)?;
    for index in 0..MAX_DOWNLOAD_CANDIDATES {
        let candidate = candidate_path(&directory, release, index);
        match candidate_state(&candidate, release)? {
            CandidateState::Verified => return Ok(candidate),
            CandidateState::Occupied => continue,
            CandidateState::Missing => {}
        }
        match temporary.persist_noclobber(&candidate) {
            Ok(_) => return Ok(candidate),
            Err(error) if error.error.kind() == ErrorKind::AlreadyExists => {
                temporary = error.file;
                if candidate_state(&candidate, release)? == CandidateState::Verified {
                    return Ok(candidate);
                }
            }
            Err(_) => return Err(ExtensionReleaseError::SaveFailed),
        }
    }
    Err(ExtensionReleaseError::SaveFailed)
}

#[cfg(test)]
#[path = "tests/storage.rs"]
mod tests;
