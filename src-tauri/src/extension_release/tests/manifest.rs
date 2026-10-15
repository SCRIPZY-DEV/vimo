use super::*;

fn release() -> ExtensionRelease {
    serde_json::from_value(serde_json::json!({
        "schemaVersion": 1,
        "version": "0.2.36",
        "publishedAt": "2026-10-15T18:20:00.000Z",
        "notes": { "es": "Mejoras de Flow", "en": "Flow improvements", "pt": "Melhorias do Flow" },
        "downloadUrl": "https://releases.vimo.click/extensions/v0.2.36/vimo-automate-0.2.36.zip",
        "sha256": "a".repeat(64),
        "sizeBytes": 1024
    }))
    .unwrap()
}

#[test]
fn accepts_complete_release_and_preserves_camel_case_contract() {
    let release = release();
    assert_eq!(release.validate(), Ok(()));
    let serialized = serde_json::to_value(&release).unwrap();
    assert_eq!(serialized["schemaVersion"], 1);
    assert_eq!(serialized["sizeBytes"], 1024);
    assert!(serialized.get("size_bytes").is_none());
    assert_eq!(release.archive_name(), "vimo-automate-0.2.36.zip");
}

#[test]
fn accepts_chromium_versions_and_rejects_ambiguous_or_unsafe_versions() {
    for version in ["1", "1.0", "0.2.36", "65535.65535.65535.65535"] {
        assert!(valid_extension_version(version), "{version}");
    }
    for version in [
        "",
        "0",
        "0.0.0.0",
        "1.2.3.4.5",
        "01.2.3",
        "1.02.3",
        "65536",
        "-1",
        "+1",
        "1.0-beta",
        "v1.2.3",
        "1..2",
        "1.2/3",
        "1.2.3?",
        "1.2.3\n",
        "１.2.3",
    ] {
        assert!(!valid_extension_version(version), "{version}");
    }
}

#[test]
fn validates_utc_dates_including_leap_days_and_milliseconds() {
    for date in [
        "2026-10-15T18:20:00Z",
        "2024-02-29T23:59:59.999Z",
        "2000-02-29T00:00:00Z",
    ] {
        assert!(valid_publication_date(date), "{date}");
    }
    for date in [
        "",
        "2026-02-29T00:00:00Z",
        "1900-02-29T00:00:00Z",
        "2026-04-31T00:00:00Z",
        "2026-00-15T00:00:00Z",
        "2026-13-15T00:00:00Z",
        "2026-10-00T00:00:00Z",
        "2026-10-15T24:00:00Z",
        "2026-10-15T12:60:00Z",
        "2026-10-15T12:00:60Z",
        "2026-10-15T12:00:00+00:00",
        "2026-10-15T12:00:00.abcZ",
        "0000-01-01T00:00:00Z",
        "😀26-10-15T12:00:00Z",
        "2026-10-15T12:00:00.0000Z",
    ] {
        assert!(!valid_publication_date(date), "{date}");
    }
}

#[test]
fn rejects_every_download_url_outside_the_exact_immutable_release_path() {
    for url in [
        "http://releases.vimo.click/extensions/v0.2.36/vimo-automate-0.2.36.zip",
        "https://releases.vimo.click.evil.test/extensions/v0.2.36/vimo-automate-0.2.36.zip",
        "https://releases.vimo.click@evil.test/extensions/v0.2.36/vimo-automate-0.2.36.zip",
        "https://user:pass@releases.vimo.click/extensions/v0.2.36/vimo-automate-0.2.36.zip",
        "https://releases.vimo.click:443/extensions/v0.2.36/vimo-automate-0.2.36.zip",
        "https://releases.vimo.click/extensions/v0.2.35/vimo-automate-0.2.35.zip",
        "https://releases.vimo.click/extensions/v0.2.36/../v0.2.36/vimo-automate-0.2.36.zip",
        "https://releases.vimo.click/extensions/v0.2.36/vimo-automate-0.2.36.zip?token=secret",
        "https://releases.vimo.click/extensions/v0.2.36/vimo-automate-0.2.36.zip#fragment",
        "file:///tmp/extension.zip",
    ] {
        let mut release = release();
        release.download_url = url.into();
        assert_eq!(
            release.validate(),
            Err(ExtensionReleaseError::InvalidManifest),
            "{url}"
        );
    }
}

#[test]
fn bounds_archive_size_hash_and_schema() {
    for size in [0, 21, MAX_ARCHIVE_BYTES as u64 + 1, u64::MAX] {
        let mut release = release();
        release.size_bytes = size;
        assert_eq!(
            release.validate(),
            Err(ExtensionReleaseError::InvalidManifest)
        );
    }
    for hash in [
        "a".repeat(63),
        "a".repeat(65),
        "g".repeat(64),
        "é".repeat(32),
    ] {
        let mut release = release();
        release.sha256 = hash;
        assert_eq!(
            release.validate(),
            Err(ExtensionReleaseError::InvalidManifest)
        );
    }
    let mut release = release();
    release.schema_version = 2;
    assert_eq!(
        release.validate(),
        Err(ExtensionReleaseError::InvalidManifest)
    );
}

#[test]
fn requires_safe_bounded_notes_for_all_languages() {
    for notes in [
        String::new(),
        " \n\t".into(),
        "x".repeat(MAX_NOTES_BYTES + 1),
        "text\0more".into(),
    ] {
        for language in ["es", "en", "pt"] {
            let mut release = release();
            match language {
                "es" => release.notes.es = notes.clone(),
                "en" => release.notes.en = notes.clone(),
                _ => release.notes.pt = notes.clone(),
            }
            assert_eq!(
                release.validate(),
                Err(ExtensionReleaseError::InvalidManifest)
            );
        }
    }
}

#[test]
fn rejects_unknown_missing_and_wrongly_typed_fields() {
    let value = serde_json::to_value(release()).unwrap();
    for field in [
        "schemaVersion",
        "version",
        "publishedAt",
        "notes",
        "downloadUrl",
        "sha256",
        "sizeBytes",
    ] {
        let mut missing = value.clone();
        missing.as_object_mut().unwrap().remove(field);
        assert!(
            serde_json::from_value::<ExtensionRelease>(missing).is_err(),
            "{field}"
        );
        let mut wrongly_typed = value.clone();
        wrongly_typed[field] = serde_json::json!([value[field]]);
        assert!(
            serde_json::from_value::<ExtensionRelease>(wrongly_typed).is_err(),
            "{field}"
        );
    }
    let mut extra = value;
    extra["localPath"] = serde_json::json!("/tmp/extension.zip");
    assert!(serde_json::from_value::<ExtensionRelease>(extra).is_err());
}
