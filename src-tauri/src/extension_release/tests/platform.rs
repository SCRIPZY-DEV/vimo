use tauri::Manager;

// Sólo se simula el runtime de ventanas. document_dir ejecuta la API real
// del sistema operativo: Known Folders en Windows y XDG en Linux.
fn native_documents() -> tauri::Result<std::path::PathBuf> {
    tauri::test::mock_app().path().document_dir()
}

#[cfg(target_os = "macos")]
#[test]
fn documents_resolver_returns_native_macos_documents_without_writing() {
    let documents = native_documents().expect("macOS Documents must resolve");
    let home = tauri::test::mock_app().path().home_dir().unwrap();
    assert!(documents.is_absolute());
    assert_eq!(documents, home.join("Documents"));
}

#[cfg(target_os = "linux")]
#[test]
fn documents_resolver_respects_linux_xdg_configuration() {
    const EXPECTED: &str = "VIMO_TEST_EXPECTED_DOCUMENTS";
    if let Some(expected) = std::env::var_os(EXPECTED) {
        let actual = native_documents();
        if expected.is_empty() {
            assert!(
                actual.is_err(),
                "Disabled or missing XDG Documents must not fall back to HOME/Documents"
            );
        } else {
            assert_eq!(actual.unwrap(), std::path::PathBuf::from(expected));
        }
        return;
    }

    // Cada hijo hereda HOME intacto y sólo recibe su propio XDG_CONFIG_HOME.
    // Ningún test cambia env global ni la configuración real del usuario.
    let fixture = tempfile::tempdir().unwrap();
    let redirected = fixture.path().join("Documentos O'Neill [á 音]");
    let cases = [
        (
            "redirected",
            format!("XDG_DOCUMENTS_DIR=\"{}\"\n", redirected.display()),
            Some(redirected.as_path()),
        ),
        ("disabled", "XDG_DOCUMENTS_DIR=\"$HOME/\"\n".into(), None),
        ("missing", String::new(), None),
        (
            "relative-invalid",
            "XDG_DOCUMENTS_DIR=\"relative/Documents\"\n".into(),
            None,
        ),
    ];
    for (name, config, expected) in cases {
        let config_dir = fixture.path().join(name);
        std::fs::create_dir(&config_dir).unwrap();
        std::fs::write(config_dir.join("user-dirs.dirs"), config).unwrap();
        let child = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "extension_release::platform_tests::documents_resolver_respects_linux_xdg_configuration",
                "--nocapture",
                "--test-threads=1",
            ])
            .env("XDG_CONFIG_HOME", &config_dir)
            .env(EXPECTED, expected.map(|path| path.as_os_str()).unwrap_or_default())
            .output()
            .unwrap();
        assert!(
            child.status.success(),
            "XDG case {name}: {}\n{}",
            String::from_utf8_lossy(&child.stdout),
            String::from_utf8_lossy(&child.stderr)
        );
        // Evita un falso verde si cambia el nombre del test y el hijo corre 0.
        assert!(
            String::from_utf8_lossy(&child.stdout).contains("1 passed"),
            "XDG child did not execute its resolver assertion"
        );
    }
}

#[cfg(windows)]
#[test]
fn documents_resolver_matches_current_windows_known_folder() {
    use std::{ffi::c_void, os::windows::ffi::OsStringExt, ptr};

    #[repr(C)]
    struct Guid {
        data1: u32,
        data2: u16,
        data3: u16,
        data4: [u8; 8],
    }
    // FOLDERID_Documents, sin KF_FLAG_DEFAULT_PATH: respeta OneDrive y otras
    // redirecciones registradas. No altera la configuración de Known Folders.
    // https://learn.microsoft.com/windows/win32/shell/knownfolderid
    const DOCUMENTS: Guid = Guid {
        data1: 0xfdd39ad0,
        data2: 0x238f,
        data3: 0x46af,
        data4: [0xad, 0xb4, 0x6c, 0x85, 0x48, 0x03, 0x69, 0xc7],
    };
    #[link(name = "shell32")]
    extern "system" {
        fn SHGetKnownFolderPath(
            id: *const Guid,
            flags: u32,
            token: *mut c_void,
            path: *mut *mut u16,
        ) -> i32;
    }
    #[link(name = "ole32")]
    extern "system" {
        fn CoTaskMemFree(pointer: *const c_void);
    }

    let mut pointer = ptr::null_mut();
    // SAFETY: GUID válido, token nulo = usuario actual y salida inicializada.
    let result = unsafe { SHGetKnownFolderPath(&DOCUMENTS, 0, ptr::null_mut(), &mut pointer) };
    let expected = if result >= 0 && !pointer.is_null() {
        // SAFETY: la API devuelve una cadena UTF-16 terminada en cero propia.
        let value = unsafe {
            let mut length = 0;
            while *pointer.add(length) != 0 {
                length += 1;
            }
            std::ffi::OsString::from_wide(std::slice::from_raw_parts(pointer, length))
        };
        Some(std::path::PathBuf::from(value))
    } else {
        None
    };
    // SAFETY: SHGetKnownFolderPath exige liberar incluso tras un fallo.
    unsafe { CoTaskMemFree(pointer.cast()) };
    let actual = native_documents();
    match expected {
        Some(expected) => {
            assert!(expected.is_absolute());
            assert_eq!(actual.unwrap(), expected);
        }
        None => assert!(
            actual.is_err(),
            "Unavailable Known Folder must not fall back to USERPROFILE/Documents"
        ),
    }
}

#[cfg(windows)]
#[test]
fn locked_windows_zip_is_preserved_and_can_be_reused_after_unlock() {
    use super::{error::ExtensionReleaseError, manifest::ExtensionRelease, storage};
    use sha2::{Digest, Sha256};
    use std::{fs, os::windows::fs::OpenOptionsExt};

    let mut bytes = b"PK\x03\x04".to_vec();
    bytes.extend_from_slice(&[0; 64]);
    let release: ExtensionRelease = serde_json::from_value(serde_json::json!({
        "schemaVersion":1,"version":"0.2.37","publishedAt":"2026-10-15T18:20:00.000Z",
        "notes":{"es":"Cambios","en":"Changes","pt":"Alterações"},
        "downloadUrl":"https://releases.vimo.click/extensions/v0.2.37/vimo-automate-0.2.37.zip",
        "sha256":format!("{:x}",Sha256::digest(&bytes)),"sizeBytes":bytes.len()
    }))
    .unwrap();
    let documents = tempfile::tempdir().unwrap();
    let saved = storage::save_download(documents.path(), &release, &bytes).unwrap();
    // FileShare.None real: fuerza ERROR_SHARING_VIOLATION al leer el ZIP.
    let locked = fs::OpenOptions::new()
        .read(true)
        .share_mode(0)
        .open(&saved)
        .unwrap();
    assert_eq!(
        storage::find_download(documents.path(), &release),
        Err(ExtensionReleaseError::SaveFailed)
    );
    assert_eq!(
        storage::save_download(documents.path(), &release, &bytes),
        Err(ExtensionReleaseError::SaveFailed)
    );
    drop(locked);
    assert_eq!(fs::read(&saved).unwrap(), bytes);
    assert_eq!(
        storage::save_download(documents.path(), &release, &bytes),
        Ok(saved.clone())
    );
    assert_eq!(fs::read_dir(saved.parent().unwrap()).unwrap().count(), 1);
}

#[cfg(windows)]
#[test]
fn cleanup_reports_locked_previous_zip_and_preserves_new_download() {
    use super::{manifest::ExtensionRelease, storage};
    use sha2::{Digest, Sha256};
    use std::{fs, os::windows::fs::OpenOptionsExt};

    let mut bytes = b"PK\x03\x04".to_vec();
    bytes.extend_from_slice(&[0; 64]);
    let release: ExtensionRelease = serde_json::from_value(serde_json::json!({
        "schemaVersion":1,"version":"0.2.37","publishedAt":"2026-10-15T18:20:00.000Z",
        "notes":{"es":"Cambios","en":"Changes","pt":"Alterações"},
        "downloadUrl":"https://releases.vimo.click/extensions/v0.2.37/vimo-automate-0.2.37.zip",
        "sha256":format!("{:x}",Sha256::digest(&bytes)),"sizeBytes":bytes.len()
    }))
    .unwrap();
    let documents = tempfile::tempdir().unwrap();
    let saved = storage::save_download(documents.path(), &release, &bytes).unwrap();
    let older = saved.parent().unwrap().join("vimo-automate-0.2.36.zip");
    fs::write(&older, b"previous archive").unwrap();
    let locked = fs::OpenOptions::new()
        .read(true)
        .share_mode(0)
        .open(&older)
        .unwrap();
    assert!(storage::cleanup_previous_downloads(
        documents.path(),
        &release
    ));
    assert_eq!(fs::read(&saved).unwrap(), bytes);
    assert!(older.exists());
    drop(locked);
    assert_eq!(fs::read(&older).unwrap(), b"previous archive");
    assert!(!storage::cleanup_previous_downloads(
        documents.path(),
        &release
    ));
    assert!(!older.exists());
    assert_eq!(
        storage::find_download(documents.path(), &release),
        Ok(Some(saved))
    );
}
