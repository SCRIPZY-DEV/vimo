use super::*;
use serde_json::{json, Value};
use std::fs;
use tempfile::TempDir;

fn save(directory: &Path, value: &Value) {
    fs::write(
        directory.join(COORDINATOR_FILE),
        serde_json::to_vec(value).unwrap(),
    )
    .unwrap();
}

fn existing_config(directory: &Path) -> Value {
    let store = directory.join("previous-flow");
    fs::create_dir(&store).unwrap();
    fs::write(store.join("state.json"), b"preserved ledger").unwrap();
    json!({"version":1,"dataDir":store,"bridgePort":43137})
}

#[test]
fn absent_configuration_keeps_default_without_creating_files() {
    let root = TempDir::new().unwrap();
    let location = resolve_location(root.path()).unwrap();
    assert_eq!(location.data_dir, root.path().join("flow"));
    assert_eq!(location.bridge_port, None);
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 0);
}

#[test]
fn explicit_existing_coordinator_preserves_both_stores() {
    let root = TempDir::new().unwrap();
    let config = existing_config(root.path());
    let original = root.path().join("flow");
    fs::create_dir(&original).unwrap();
    fs::write(original.join("state.json"), b"habitual ledger").unwrap();
    save(root.path(), &config);
    let selected = PathBuf::from(config["dataDir"].as_str().unwrap());
    let before = fs::read(selected.join("state.json")).unwrap();
    let location = resolve_location(root.path()).unwrap();
    assert_eq!(location.data_dir, selected.canonicalize().unwrap());
    assert_eq!(location.bridge_port, Some(43137));
    assert_eq!(fs::read(selected.join("state.json")).unwrap(), before);
    assert_eq!(
        fs::read(original.join("state.json")).unwrap(),
        b"habitual ledger"
    );
}

#[test]
fn invalid_configuration_never_falls_back_or_creates_store() {
    let root = TempDir::new().unwrap();
    let valid = existing_config(root.path());
    let invalid = [
        json!(null),
        json!([]),
        json!({}),
        {
            let mut value = valid.clone();
            value["version"] = json!(2);
            value
        },
        {
            let mut value = valid.clone();
            value["bridgePort"] = json!(0);
            value
        },
        {
            let mut value = valid.clone();
            value["bridgePort"] = json!(1023);
            value
        },
        {
            let mut value = valid.clone();
            value["bridgePort"] = json!(65536);
            value
        },
        {
            let mut value = valid.clone();
            value["bridgePort"] = json!(43137.5);
            value
        },
        {
            let mut value = valid.clone();
            value["bridgePort"] = json!("43137");
            value
        },
        {
            let mut value = valid.clone();
            value["dataDir"] = json!("relative");
            value
        },
        {
            let mut value = valid.clone();
            value["dataDir"] = json!(["/tmp"]);
            value
        },
        {
            let mut value = valid.clone();
            value["dataDir"] = json!(root.path().join("missing"));
            value
        },
        {
            let mut value = valid.clone();
            value["dataDir"] = json!(root.path());
            value
        },
        {
            let mut value = valid.clone();
            value["extra"] = json!(true);
            value
        },
    ];
    for value in invalid {
        save(root.path(), &value);
        assert_eq!(
            resolve_location(root.path()).err().as_deref(),
            Some(INVALID_CONFIG)
        );
        assert!(!root.path().join("flow").exists());
    }
}

#[test]
fn damaged_and_oversize_files_are_rejected_without_writes() {
    let root = TempDir::new().unwrap();
    for bytes in [b"{".to_vec(), vec![b' '; MAX_CONFIG_BYTES as usize + 1]] {
        fs::write(root.path().join(COORDINATOR_FILE), &bytes).unwrap();
        assert_eq!(
            resolve_location(root.path()).err().as_deref(),
            Some(INVALID_CONFIG)
        );
        assert_eq!(fs::read(root.path().join(COORDINATOR_FILE)).unwrap(), bytes);
        assert!(!root.path().join("flow").exists());
    }
}

#[test]
fn missing_selected_store_does_not_silently_switch_owner() {
    let root = TempDir::new().unwrap();
    let config = existing_config(root.path());
    save(root.path(), &config);
    let selected = PathBuf::from(config["dataDir"].as_str().unwrap());
    fs::rename(
        selected.join("state.json"),
        selected.join("state.backup.json"),
    )
    .unwrap();
    assert_eq!(
        resolve_location(root.path()).err().as_deref(),
        Some(INVALID_CONFIG)
    );
    assert!(!root.path().join("flow").exists());
}

#[test]
fn a_directory_is_not_missing_configuration() {
    let root = TempDir::new().unwrap();
    fs::create_dir(root.path().join(COORDINATOR_FILE)).unwrap();
    assert_eq!(
        resolve_location(root.path()).err().as_deref(),
        Some(INVALID_CONFIG)
    );
    assert!(!root.path().join("flow").exists());
}

#[cfg(unix)]
#[test]
fn a_dangling_symlink_must_not_select_a_different_owner() {
    let root = TempDir::new().unwrap();
    std::os::unix::fs::symlink(
        root.path().join("missing-config"),
        root.path().join(COORDINATOR_FILE),
    )
    .unwrap();
    assert_eq!(
        resolve_location(root.path()).err().as_deref(),
        Some(INVALID_CONFIG)
    );
    assert!(!root.path().join("flow").exists());
}
