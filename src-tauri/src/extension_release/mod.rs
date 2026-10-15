pub mod commands;
mod download;
mod error;
mod manifest;
mod storage;

const RELEASE_MANIFEST_URL: &str = "https://releases.vimo.click/extensions/latest.json";
const RELEASE_DOWNLOAD_ORIGIN: &str = "https://releases.vimo.click";
const MAX_MANIFEST_BYTES: usize = 64 * 1024;
const MAX_ARCHIVE_BYTES: usize = 25 * 1024 * 1024;
const MAX_NOTES_BYTES: usize = 8000;
const MANIFEST_TIMEOUT_SECONDS: u64 = 20;
const DOWNLOAD_TIMEOUT_SECONDS: u64 = 120;
const CONNECT_TIMEOUT_SECONDS: u64 = 10;
const READ_TIMEOUT_SECONDS: u64 = 20;

#[cfg(test)]
#[path = "tests/platform.rs"]
mod platform_tests;
