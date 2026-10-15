use super::*;

#[test]
fn serializes_downloads_and_releases_guard_after_completion_or_cancel() {
    let downloads = ExtensionDownloads::default();
    let guard = downloads.start().unwrap();
    assert!(matches!(
        downloads.start(),
        Err(ExtensionReleaseError::Busy)
    ));
    drop(guard);
    assert!(downloads.start().is_ok());
}

#[test]
fn releases_download_guard_when_a_fallible_operation_returns_early() {
    fn failing_operation(downloads: &ExtensionDownloads) -> Result<(), ExtensionReleaseError> {
        let _guard = downloads.start()?;
        Err(ExtensionReleaseError::Network)
    }
    let downloads = ExtensionDownloads::default();
    assert_eq!(
        failing_operation(&downloads),
        Err(ExtensionReleaseError::Network)
    );
    assert!(downloads.start().is_ok());
}

#[test]
fn command_errors_are_stable_codes_without_private_details() {
    for (error, code) in [
        (ExtensionReleaseError::Network, "network"),
        (ExtensionReleaseError::Unavailable, "unavailable"),
        (ExtensionReleaseError::InvalidManifest, "invalid_manifest"),
        (ExtensionReleaseError::DownloadFailed, "download_failed"),
        (ExtensionReleaseError::IntegrityFailed, "integrity_failed"),
        (ExtensionReleaseError::SaveFailed, "save_failed"),
        (ExtensionReleaseError::Busy, "busy"),
    ] {
        assert_eq!(
            serde_json::to_value(error).unwrap(),
            serde_json::json!({ "code": code })
        );
    }
}
