use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};

use serde::Deserialize;

const COORDINATOR_FILE: &str = "flow-coordinator.json";
const MAX_CONFIG_BYTES: u64 = 8192;
const INVALID_CONFIG: &str = "flow_coordinator_config_invalid";

pub(super) struct FlowLocation {
    pub data_dir: PathBuf,
    pub bridge_port: Option<u16>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SavedCoordinator {
    version: u8,
    data_dir: PathBuf,
    bridge_port: u16,
}

// Configuración local explícita: adopta el MISMO coordinador con sus vínculos.
// Nunca descubre almacenes, fusiona historiales ni crea uno vacío si hay un error.
// El lock del sidecar sigue exigiendo un único propietario del directorio.
pub(super) fn resolve_location(app_data_dir: &Path) -> Result<FlowLocation, String> {
    let config_path = app_data_dir.join(COORDINATOR_FILE);
    let metadata = match fs::symlink_metadata(&config_path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(FlowLocation {
                data_dir: app_data_dir.join("flow"),
                bridge_port: None,
            });
        }
        Err(_) => return Err(INVALID_CONFIG.into()),
    };
    if !metadata.is_file() {
        return Err(INVALID_CONFIG.into());
    }
    let file = File::open(config_path).map_err(|_| INVALID_CONFIG)?;
    let mut bytes = Vec::new();
    file.take(MAX_CONFIG_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| INVALID_CONFIG)?;
    if bytes.len() as u64 > MAX_CONFIG_BYTES {
        return Err(INVALID_CONFIG.into());
    }
    let config: SavedCoordinator = serde_json::from_slice(&bytes).map_err(|_| INVALID_CONFIG)?;
    if config.version != 1
        || config.bridge_port < 1024
        || !config.data_dir.is_absolute()
        || config.data_dir.as_os_str().len() > 4096
        || !config.data_dir.is_dir()
        || !config.data_dir.join("state.json").is_file()
    {
        return Err(INVALID_CONFIG.into());
    }
    Ok(FlowLocation {
        data_dir: config.data_dir.canonicalize().map_err(|_| INVALID_CONFIG)?,
        bridge_port: Some(config.bridge_port),
    })
}

#[cfg(test)]
#[path = "tests/location.rs"]
mod tests;
