use std::sync::{Arc, Barrier};
use std::thread;

use sha2::{Digest, Sha256};

use super::*;

fn archive() -> Vec<u8> {
    let mut bytes = b"PK\x03\x04".to_vec();
    bytes.extend_from_slice(&[0; 64]);
    bytes
}

fn release(bytes: &[u8]) -> ExtensionRelease {
    serde_json::from_value(serde_json::json!({
        "schemaVersion": 1,
        "version": "0.2.37",
        "publishedAt": "2026-10-15T18:20:00.000Z",
        "notes": {"es": "Cambios", "en": "Changes", "pt": "Alterações"},
        "downloadUrl": "https://releases.vimo.click/extensions/v0.2.37/vimo-automate-0.2.37.zip",
        "sha256": format!("{:x}", Sha256::digest(bytes)),
        "sizeBytes": bytes.len()
    }))
    .unwrap()
}

fn entries(directory: &Path) -> usize {
    fs::read_dir(directory).unwrap().count()
}

#[test]
fn finds_only_real_verified_download_and_does_not_create_directories() {
    let documents = tempfile::tempdir().unwrap();
    let bytes = archive();
    let release = release(&bytes);
    assert_eq!(find_download(documents.path(), &release), Ok(None));
    assert!(!documents.path().join("Vimo").exists());
    let saved = save_download(documents.path(), &release, &bytes).unwrap();
    let directory = documents.path().join("Vimo").join("Extensiones");
    assert_eq!(saved, directory.join("vimo-automate-0.2.37.zip"));
    assert_eq!(fs::read(&saved).unwrap(), bytes);
    assert_eq!(
        find_download(documents.path(), &release),
        Ok(Some(saved.clone()))
    );
    assert_eq!(
        save_download(documents.path(), &release, &bytes),
        Ok(saved.clone())
    );
    assert_eq!(entries(&directory), 1);
    fs::remove_file(&saved).unwrap();
    assert_eq!(find_download(documents.path(), &release), Ok(None));
}

#[test]
fn changed_bytes_disable_reuse_and_keep_existing_file_when_redownloading() {
    let documents = tempfile::tempdir().unwrap();
    let bytes = archive();
    let release = release(&bytes);
    let first = save_download(documents.path(), &release, &bytes).unwrap();
    let mut altered = bytes.clone();
    altered[10] = 1;
    fs::write(&first, &altered).unwrap();
    assert_eq!(find_download(documents.path(), &release), Ok(None));
    let next = save_download(documents.path(), &release, &bytes).unwrap();
    assert_eq!(next.file_name().unwrap(), "vimo-automate-0.2.37 (1).zip");
    assert_eq!(fs::read(&first).unwrap(), altered);
    assert_eq!(fs::read(&next).unwrap(), bytes);
    assert_eq!(find_download(documents.path(), &release), Ok(Some(next)));
    assert_eq!(entries(first.parent().unwrap()), 2);
}

#[test]
fn searches_all_shared_candidates_when_an_earlier_download_was_deleted() {
    let documents = tempfile::tempdir().unwrap();
    let bytes = archive();
    let release = release(&bytes);
    let directory = download_directory(documents.path()).unwrap();
    fs::create_dir_all(&directory).unwrap();
    let last = candidate_path(&directory, &release, MAX_DOWNLOAD_CANDIDATES - 1);
    fs::write(&last, &bytes).unwrap();
    assert_eq!(
        find_download(documents.path(), &release),
        Ok(Some(last.clone()))
    );
    assert_eq!(save_download(documents.path(), &release, &bytes), Ok(last));
    assert_eq!(entries(&directory), 1);
}

#[test]
fn occupied_directories_and_files_are_not_overwritten() {
    let documents = tempfile::tempdir().unwrap();
    let bytes = archive();
    let release = release(&bytes);
    let directory = download_directory(documents.path()).unwrap();
    fs::create_dir_all(&directory).unwrap();
    let first = candidate_path(&directory, &release, 0);
    let second = candidate_path(&directory, &release, 1);
    fs::create_dir(&first).unwrap();
    fs::write(&second, b"unrelated file").unwrap();
    let saved = save_download(documents.path(), &release, &bytes).unwrap();
    assert_eq!(saved, candidate_path(&directory, &release, 2));
    assert!(first.is_dir());
    assert_eq!(fs::read(second).unwrap(), b"unrelated file");
    assert_eq!(entries(&directory), 3);
}

#[test]
fn bounded_collisions_fail_cleanly_without_modifying_any_occupied_candidate() {
    let documents = tempfile::tempdir().unwrap();
    let bytes = archive();
    let release = release(&bytes);
    let directory = download_directory(documents.path()).unwrap();
    fs::create_dir_all(&directory).unwrap();
    for index in 0..MAX_DOWNLOAD_CANDIDATES {
        fs::write(candidate_path(&directory, &release, index), b"keep").unwrap();
    }
    assert_eq!(find_download(documents.path(), &release), Ok(None));
    assert_eq!(
        save_download(documents.path(), &release, &bytes),
        Err(ExtensionReleaseError::SaveFailed)
    );
    assert_eq!(entries(&directory), MAX_DOWNLOAD_CANDIDATES);
    for index in 0..MAX_DOWNLOAD_CANDIDATES {
        assert_eq!(
            fs::read(candidate_path(&directory, &release, index)).unwrap(),
            b"keep"
        );
    }
}

#[test]
fn invalid_bytes_and_relative_documents_never_create_a_download() {
    let documents = tempfile::tempdir().unwrap();
    let bytes = archive();
    let release = release(&bytes);
    assert_eq!(
        save_download(documents.path(), &release, b"wrong"),
        Err(ExtensionReleaseError::IntegrityFailed)
    );
    assert!(!documents.path().join("Vimo").exists());
    assert_eq!(
        find_download(Path::new("Documents"), &release),
        Err(ExtensionReleaseError::DocumentsUnavailable)
    );
    assert_eq!(
        save_download(Path::new("Documents"), &release, &bytes),
        Err(ExtensionReleaseError::DocumentsUnavailable)
    );
}

#[test]
fn blocked_download_directory_is_an_error_in_find_and_save() {
    let documents = tempfile::tempdir().unwrap();
    let bytes = archive();
    let release = release(&bytes);
    fs::write(documents.path().join("Vimo"), b"keep").unwrap();
    assert_eq!(
        find_download(documents.path(), &release),
        Err(ExtensionReleaseError::SaveFailed)
    );
    assert_eq!(
        save_download(documents.path(), &release, &bytes),
        Err(ExtensionReleaseError::SaveFailed)
    );
    assert_eq!(fs::read(documents.path().join("Vimo")).unwrap(), b"keep");
}

#[test]
fn simultaneous_saves_reuse_one_verified_file_without_clobbering() {
    let documents = tempfile::tempdir().unwrap();
    let bytes = archive();
    let release = release(&bytes);
    let barrier = Arc::new(Barrier::new(8));
    let workers: Vec<_> = (0..8)
        .map(|_| {
            let path = documents.path().to_path_buf();
            let bytes = bytes.clone();
            let release = release.clone();
            let barrier = barrier.clone();
            thread::spawn(move || {
                barrier.wait();
                save_download(&path, &release, &bytes).unwrap()
            })
        })
        .collect();
    let saved: Vec<_> = workers
        .into_iter()
        .map(|worker| worker.join().unwrap())
        .collect();
    assert!(saved.iter().all(|path| path == &saved[0]));
    assert_eq!(fs::read(&saved[0]).unwrap(), bytes);
    assert_eq!(entries(saved[0].parent().unwrap()), 1);
}

#[cfg(unix)]
#[test]
fn ignores_zip_symlinks_and_allows_redirected_documents_directory() {
    use std::os::unix::fs::symlink;
    let root = tempfile::tempdir().unwrap();
    let real_documents = root.path().join("Documentos redirigidos ñ");
    fs::create_dir(&real_documents).unwrap();
    let documents = root.path().join("Documents");
    symlink(&real_documents, &documents).unwrap();
    let bytes = archive();
    let release = release(&bytes);
    let directory = download_directory(&documents).unwrap();
    fs::create_dir_all(&directory).unwrap();
    let target = root.path().join("another.zip");
    fs::write(&target, &bytes).unwrap();
    let linked = candidate_path(&directory, &release, 0);
    symlink(&target, &linked).unwrap();
    assert_eq!(find_download(&documents, &release), Ok(None));
    let saved = save_download(&documents, &release, &bytes).unwrap();
    assert_eq!(saved, candidate_path(&directory, &release, 1));
    assert!(fs::symlink_metadata(&linked)
        .unwrap()
        .file_type()
        .is_symlink());
    assert_eq!(fs::read(&target).unwrap(), bytes);
    assert_eq!(find_download(&documents, &release), Ok(Some(saved)));
}

#[cfg(unix)]
#[test]
fn nofollow_open_rejects_a_zip_link_and_does_not_block_on_fifo() {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;
    use std::os::unix::fs::symlink;
    let directory = tempfile::tempdir().unwrap();
    let target = directory.path().join("target.zip");
    fs::write(&target, archive()).unwrap();
    let linked = directory.path().join("linked.zip");
    symlink(&target, &linked).unwrap();
    assert!(open_without_following_link(&linked).is_err());
    let fifo = directory.path().join("fifo.zip");
    let path = CString::new(fifo.as_os_str().as_bytes()).unwrap();
    assert_eq!(unsafe { libc::mkfifo(path.as_ptr(), 0o600) }, 0);
    let opened = open_without_following_link(&fifo).unwrap();
    assert!(!opened.metadata().unwrap().is_file());
}

#[test]
fn opening_download_directory_requires_a_present_verified_archive() {
    let documents = tempfile::tempdir().unwrap();
    let bytes = archive();
    let release = release(&bytes);
    assert_eq!(
        verified_download_directory(documents.path(), &release),
        Err(ExtensionReleaseError::SaveFailed)
    );
    assert!(!documents.path().join("Vimo").exists());

    let first = save_download(documents.path(), &release, &bytes).unwrap();
    let directory = first.parent().unwrap().to_path_buf();
    assert_eq!(
        verified_download_directory(documents.path(), &release),
        Ok(directory.clone())
    );
    let mut altered = bytes.clone();
    altered[10] = 1;
    fs::write(&first, &altered).unwrap();
    assert_eq!(
        verified_download_directory(documents.path(), &release),
        Err(ExtensionReleaseError::SaveFailed)
    );

    let second = save_download(documents.path(), &release, &bytes).unwrap();
    assert_ne!(second, first);
    assert_eq!(
        verified_download_directory(documents.path(), &release),
        Ok(directory)
    );
    fs::remove_file(second).unwrap();
    assert_eq!(
        verified_download_directory(documents.path(), &release),
        Err(ExtensionReleaseError::SaveFailed)
    );
    assert_eq!(fs::read(first).unwrap(), altered);
}
