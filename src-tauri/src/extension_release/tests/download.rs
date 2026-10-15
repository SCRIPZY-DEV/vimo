use std::io::Read;
use std::net::TcpListener;
use std::thread;

use super::*;

fn archive() -> Vec<u8> {
    // Cabecera ZIP y bytes sintéticos: el hash prueba la integridad, no se extrae.
    let mut bytes = b"PK\x03\x04".to_vec();
    bytes.extend_from_slice(&[0; 64]);
    bytes
}

fn release(bytes: &[u8]) -> ExtensionRelease {
    serde_json::from_value(serde_json::json!({
        "schemaVersion": 1,
        "version": "0.2.36",
        "publishedAt": "2026-10-15T18:20:00.000Z",
        "notes": {"es": "Cambios", "en": "Changes", "pt": "Alterações"},
        "downloadUrl": "https://releases.vimo.click/extensions/v0.2.36/vimo-automate-0.2.36.zip",
        "sha256": format!("{:x}", Sha256::digest(bytes)),
        "sizeBytes": bytes.len()
    }))
    .unwrap()
}

fn fetch_response(response: Vec<u8>, limit: usize) -> Result<Vec<u8>, ExtensionReleaseError> {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        let mut request = [0; 4096];
        let _ = stream.read(&mut request);
        let _ = stream.write_all(&response);
    });
    let result = tauri::async_runtime::block_on(async {
        // HTTP solo en el fixture local. El cliente de producción exige HTTPS.
        let client = Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap();
        fetch_bytes(
            &client,
            &format!("http://{address}/release"),
            limit,
            5,
            ExtensionReleaseError::Unavailable,
            ExtensionReleaseError::InvalidManifest,
        )
        .await
    });
    server.join().unwrap();
    result
}

#[test]
fn downloads_complete_body_and_bounds_declared_and_chunked_bodies() {
    assert_eq!(
        fetch_response(
            b"HTTP/1.1 200 OK\r\nContent-Length: 4\r\nConnection: close\r\n\r\nbody".to_vec(),
            4
        ),
        Ok(b"body".to_vec())
    );
    assert_eq!(
        fetch_response(
            b"HTTP/1.1 200 OK\r\nContent-Length: 10\r\nConnection: close\r\n\r\n0123456789"
                .to_vec(),
            4
        ),
        Err(ExtensionReleaseError::InvalidManifest)
    );
    assert_eq!(
        fetch_response(b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n3\r\nabc\r\n3\r\ndef\r\n0\r\n\r\n".to_vec(), 4),
        Err(ExtensionReleaseError::InvalidManifest)
    );
}

#[test]
fn refuses_redirect_and_http_error_without_following_location() {
    for response in [
        b"HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:1/private\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".as_slice(),
        b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".as_slice(),
    ] {
        assert_eq!(fetch_response(response.to_vec(), 1024), Err(ExtensionReleaseError::Unavailable));
    }
}

#[test]
fn classifies_body_disconnect_after_successful_headers_as_network_failure() {
    assert_eq!(
        fetch_response(
            b"HTTP/1.1 200 OK\r\nContent-Length: 100\r\nConnection: close\r\n\r\npartial".to_vec(),
            1024
        ),
        Err(ExtensionReleaseError::Network)
    );
}

#[test]
fn production_client_refuses_plain_http() {
    tauri::async_runtime::block_on(async {
        let client = release_client().unwrap();
        let error = client
            .get("http://127.0.0.1:1/release")
            .send()
            .await
            .unwrap_err();
        assert!(error.is_builder());
    });
}

#[test]
fn rejects_tampering_truncation_and_non_zip_even_with_matching_hash() {
    let bytes = archive();
    let manifest = release(&bytes);
    assert_eq!(verify_archive(&manifest, &bytes), Ok(()));
    let mut altered = bytes.clone();
    altered[10] = 1;
    assert_eq!(
        verify_archive(&manifest, &altered),
        Err(ExtensionReleaseError::IntegrityFailed)
    );
    assert_eq!(
        verify_archive(&manifest, &bytes[..bytes.len() - 1]),
        Err(ExtensionReleaseError::IntegrityFailed)
    );
    let html = b"<html>this is an error document</html>";
    assert_eq!(
        verify_archive(&release(html), html),
        Err(ExtensionReleaseError::IntegrityFailed)
    );
}

#[test]
fn writes_verified_archive_and_preserves_previous_file_on_integrity_failure() {
    let directory = tempfile::tempdir().unwrap();
    let destination = directory.path().join("chosen.zip");
    let bytes = archive();
    let release = release(&bytes);
    std::fs::write(&destination, b"previous").unwrap();
    assert_eq!(
        save_archive(&release, b"invalid", &destination),
        Err(ExtensionReleaseError::IntegrityFailed)
    );
    assert_eq!(std::fs::read(&destination).unwrap(), b"previous");
    save_archive(&release, &bytes, &destination).unwrap();
    assert_eq!(std::fs::read(&destination).unwrap(), bytes);
    assert_eq!(std::fs::read_dir(directory.path()).unwrap().count(), 1);
}

#[test]
fn failed_save_cleans_temporary_and_never_renames_another_extension() {
    let directory = tempfile::tempdir().unwrap();
    let bytes = archive();
    let release = release(&bytes);
    let occupied = directory.path().join("directory.zip");
    std::fs::create_dir(&occupied).unwrap();
    assert_eq!(
        save_archive(&release, &bytes, &occupied),
        Err(ExtensionReleaseError::SaveFailed)
    );
    assert!(occupied.is_dir());
    assert_eq!(std::fs::read_dir(directory.path()).unwrap().count(), 1);
    let text_path = directory.path().join("chosen.txt");
    std::fs::write(&text_path, b"keep").unwrap();
    assert_eq!(
        save_archive(&release, &bytes, &text_path),
        Err(ExtensionReleaseError::SaveFailed)
    );
    assert_eq!(std::fs::read(&text_path).unwrap(), b"keep");
    assert!(!directory.path().join("chosen.zip").exists());
}
