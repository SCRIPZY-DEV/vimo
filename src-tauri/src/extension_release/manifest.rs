use serde::{Deserialize, Serialize};

use super::error::ExtensionReleaseError;
use super::{MAX_ARCHIVE_BYTES, MAX_NOTES_BYTES, RELEASE_DOWNLOAD_ORIGIN};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExtensionRelease {
    pub schema_version: u8,
    pub version: String,
    pub published_at: String,
    pub notes: ReleaseNotes,
    pub download_url: String,
    pub sha256: String,
    pub size_bytes: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ReleaseNotes {
    pub es: String,
    pub en: String,
    pub pt: String,
}

impl ExtensionRelease {
    pub fn archive_name(&self) -> String {
        format!("vimo-automate-{}.zip", self.version)
    }

    pub fn validate(&self) -> Result<(), ExtensionReleaseError> {
        if self.schema_version != 1
            || !valid_extension_version(&self.version)
            || !valid_publication_date(&self.published_at)
            || self.size_bytes < 22
            || self.size_bytes > MAX_ARCHIVE_BYTES as u64
            || self.sha256.len() != 64
            || !self.sha256.bytes().all(|byte| byte.is_ascii_hexdigit())
        {
            return Err(ExtensionReleaseError::InvalidManifest);
        }

        // Comparación exacta: tampoco admite credenciales, puertos, query,
        // fragmentos, escapes ni rutas normalizadas que salgan del prefijo.
        let expected_url = format!(
            "{RELEASE_DOWNLOAD_ORIGIN}/extensions/v{}/{}",
            self.version,
            self.archive_name()
        );
        if self.download_url != expected_url {
            return Err(ExtensionReleaseError::InvalidManifest);
        }

        for notes in [&self.notes.es, &self.notes.en, &self.notes.pt] {
            if notes.trim().is_empty()
                || notes.len() > MAX_NOTES_BYTES
                || notes.chars().any(|character| {
                    character.is_control() && character != '\n' && character != '\t'
                })
            {
                return Err(ExtensionReleaseError::InvalidManifest);
            }
        }

        Ok(())
    }
}

/// Mismo contrato que manifest.version de Chromium: 1–4 enteros de 0 a
/// 65535, sin ceros a la izquierda, y al menos uno mayor que cero.
fn valid_extension_version(version: &str) -> bool {
    if version.len() > 23 {
        return false;
    }
    let components: Vec<_> = version.split('.').collect();
    if components.is_empty() || components.len() > 4 {
        return false;
    }
    let mut nonzero = false;
    for component in components {
        if component.is_empty()
            || (component.len() > 1 && component.starts_with('0'))
            || !component.bytes().all(|byte| byte.is_ascii_digit())
        {
            return false;
        }
        let Ok(number) = component.parse::<u16>() else {
            return false;
        };
        nonzero |= number > 0;
    }
    nonzero
}

/// UTC ISO con segundos y milisegundos opcionales, igual que el generador
/// del manifiesto. Evita aceptar fechas imposibles que la UI no pueda mostrar.
fn valid_publication_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if !matches!(bytes.len(), 20 | 24)
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes[10] != b'T'
        || bytes[13] != b':'
        || bytes[16] != b':'
        || bytes[bytes.len() - 1] != b'Z'
    {
        return false;
    }
    if bytes.len() == 24 && (bytes[19] != b'.' || !bytes[20..23].iter().all(u8::is_ascii_digit)) {
        return false;
    }
    let mut numbers = [0_u32; 6];
    for (index, (start, end)) in [(0, 4), (5, 7), (8, 10), (11, 13), (14, 16), (17, 19)]
        .into_iter()
        .enumerate()
    {
        if !bytes[start..end].iter().all(u8::is_ascii_digit) {
            return false;
        }
        numbers[index] = bytes[start..end]
            .iter()
            .fold(0, |number, byte| number * 10 + u32::from(byte - b'0'));
    }
    let [year, month, day, hour, minute, second] = numbers;
    if year == 0 || !(1..=12).contains(&month) || hour > 23 || minute > 59 || second > 59 {
        return false;
    }
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days = match month {
        2 if leap => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    };
    (1..=days).contains(&day)
}

#[cfg(test)]
#[path = "tests/manifest.rs"]
mod tests;
