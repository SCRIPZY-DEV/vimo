use super::*;

#[test]
fn creates_the_missing_projects_root_with_its_parents() {
    let home = tempfile::tempdir().unwrap();
    let root = home.path().join("Documents").join("Vimo");

    create_projects_root(&root).unwrap();

    assert!(root.is_dir());
}

#[test]
fn keeps_an_existing_projects_root_untouched() {
    let root = tempfile::tempdir().unwrap();
    let style = root.path().join("_styles").join("st-a");
    std::fs::create_dir_all(&style).unwrap();

    create_projects_root(root.path()).unwrap();

    assert!(style.is_dir());
}

#[test]
fn never_creates_a_relative_projects_root() {
    let relative = Path::new("vimo-relative-root-never-created");

    create_projects_root(relative).unwrap();

    assert!(!relative.exists());
}
