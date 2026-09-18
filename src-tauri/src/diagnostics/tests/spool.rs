use super::*;

use std::fs::File;

use serde_json::json;
use tempfile::TempDir;

use crate::diagnostics::recorder::RunStatus;

const DAY: Duration = Duration::from_secs(24 * 60 * 60);

fn record(id: &str) -> DiagnosticRecord {
    DiagnosticRecord {
        id: id.to_owned(),
        source: "desktop",
        subcommand: Some(String::from("run-video-pipeline")),
        project_id: None,
        project_name: None,
        status: RunStatus::Completed,
        error_code: None,
        error_message: None,
        failed_stage: None,
        started_at_ms: 0,
        finished_at_ms: 0,
        duration_ms: 0,
        app_version: String::from("0.0.0"),
        os: "macos",
        os_version: None,
        arch: "aarch64",
        context: json!({}),
        events: Vec::new(),
        events_truncated: false,
    }
}

fn uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn spool() -> TempDir {
    tempfile::tempdir().expect("directorio temporal")
}

// Fija el mtime para que el orden y la edad no dependan del reloj del test.
fn touch(path: &Path, modified: SystemTime) {
    File::options()
        .write(true)
        .open(path)
        .and_then(|file| file.set_modified(modified))
        .expect("mtime");
}

// Deja un registro con un mtime dado sin pasar por `write_record_to`, que poda
// en cada escritura y alteraría el escenario que arma el test.
fn write_at(directory: &Path, id: &str, modified: SystemTime) -> PathBuf {
    let path = record_path(directory, id);
    fs::write(&path, serde_json::to_vec(&record(id)).unwrap()).expect("escritura");
    touch(&path, modified);
    path
}

fn json_files(directory: &Path) -> usize {
    record_files(directory).len()
}

#[test]
fn write_leaves_a_json_and_no_temporary_file() {
    let spool = spool();
    let id = uuid();

    write_record_to(spool.path(), &record(&id)).unwrap();

    let entries: Vec<PathBuf> = fs::read_dir(spool.path())
        .unwrap()
        .flatten()
        .map(|entry| entry.path())
        .collect();
    assert_eq!(entries, vec![record_path(spool.path(), &id)]);

    let stored: Value = serde_json::from_slice(&fs::read(&entries[0]).unwrap()).unwrap();
    assert_eq!(stored["id"], json!(id));
}

#[test]
fn write_creates_the_directory_when_missing() {
    let spool = spool();
    let nested = spool.path().join("nested").join("diagnostics");

    write_record_to(&nested, &record(&uuid())).unwrap();

    assert_eq!(json_files(&nested), 1);
}

#[test]
fn records_are_listed_oldest_first() {
    let spool = spool();
    let now = SystemTime::now();
    let newest = uuid();
    let oldest = uuid();
    let middle = uuid();
    write_at(spool.path(), &newest, now);
    write_at(spool.path(), &oldest, now - 2 * DAY);
    write_at(spool.path(), &middle, now - DAY);

    let ids: Vec<String> = list_records_in(spool.path())
        .iter()
        .map(|record| record["id"].as_str().unwrap().to_owned())
        .collect();

    assert_eq!(ids, vec![oldest, middle, newest]);
}

#[test]
fn listing_is_capped_by_the_batch_limit() {
    let spool = spool();
    let now = SystemTime::now();
    for index in 0..(PENDING_BATCH_LIMIT + 5) {
        write_at(spool.path(), &uuid(), now - Duration::from_secs(index as u64));
    }

    assert_eq!(list_records_in(spool.path()).len(), PENDING_BATCH_LIMIT);
    // Listar no borra: los que no entraron en el lote siguen ahí.
    assert_eq!(json_files(spool.path()), PENDING_BATCH_LIMIT + 5);
}

#[test]
fn unreadable_record_is_dropped_from_the_queue() {
    let spool = spool();
    let now = SystemTime::now();
    let broken = record_path(spool.path(), &uuid());
    fs::write(&broken, b"{ esto no es json").unwrap();
    touch(&broken, now - DAY);
    let valid = uuid();
    write_at(spool.path(), &valid, now);

    let records = list_records_in(spool.path());

    assert_eq!(records.len(), 1);
    assert_eq!(records[0]["id"], json!(valid));
    assert!(!broken.exists());
}

#[test]
fn missing_directory_lists_nothing() {
    let spool = spool();
    let missing = spool.path().join("no-existe");

    assert!(list_records_in(&missing).is_empty());
}

#[test]
fn prune_keeps_only_the_newest_within_the_limit() {
    let spool = spool();
    let now = SystemTime::now();
    let mut oldest = Vec::new();
    for index in 0..(SPOOL_FILES_LIMIT + 5) {
        // index 0 es el más nuevo; los últimos 5 son los más viejos.
        let path = write_at(spool.path(), &uuid(), now - Duration::from_secs(index as u64));
        if index >= SPOOL_FILES_LIMIT {
            oldest.push(path);
        }
    }

    prune(spool.path(), now);

    assert_eq!(json_files(spool.path()), SPOOL_FILES_LIMIT);
    assert!(oldest.iter().all(|path| !path.exists()));
}

#[test]
fn prune_removes_expired_records() {
    let spool = spool();
    let now = SystemTime::now();
    let expired = write_at(spool.path(), &uuid(), now - SPOOL_MAX_AGE - DAY);
    let fresh = write_at(spool.path(), &uuid(), now - SPOOL_MAX_AGE + DAY);

    prune(spool.path(), now);

    assert!(!expired.exists());
    assert!(fresh.exists());
}

#[test]
fn prune_ignores_temporary_files() {
    let spool = spool();
    let now = SystemTime::now();
    let temporary = spool.path().join("a-medias.tmp");
    fs::write(&temporary, b"{}").unwrap();
    touch(&temporary, now - SPOOL_MAX_AGE - DAY);

    prune(spool.path(), now);

    assert!(temporary.exists());
}

#[test]
fn delete_removes_the_record() {
    let spool = spool();
    let id = uuid();
    write_record_to(spool.path(), &record(&id)).unwrap();

    delete_record_in(spool.path(), &id).unwrap();

    assert_eq!(json_files(spool.path()), 0);
}

#[test]
fn deleting_a_missing_record_is_not_an_error() {
    let spool = spool();

    assert!(delete_record_in(spool.path(), &uuid()).is_ok());
}

#[test]
fn delete_rejects_ids_that_are_not_uuids() {
    let spool = spool();
    let other = spool.path().join("otro.json");
    fs::write(&other, b"{}").unwrap();

    assert!(matches!(
        delete_record_in(spool.path(), "../otro"),
        Err(DiagnosticsError::InvalidId)
    ));
    assert!(matches!(
        delete_record_in(spool.path(), "otro"),
        Err(DiagnosticsError::InvalidId)
    ));
    assert!(other.exists());
}
