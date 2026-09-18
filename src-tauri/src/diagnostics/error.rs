use serde::Serialize;

/// Errores del spool de diagnóstico. Igual que PipelineError: viajan como
/// `{ "code": "..." }`. Ninguno se le muestra al usuario: el uploader
/// reintenta en la próxima pasada.
#[derive(Debug, thiserror::Error)]
pub enum DiagnosticsError {
    #[error("diagnostics spool directory unavailable")]
    SpoolUnavailable,
    #[error("diagnostics spool write failed")]
    SpoolWrite,
    #[error("diagnostic log id is not a uuid")]
    InvalidId,
}

impl DiagnosticsError {
    pub fn code(&self) -> &'static str {
        match self {
            DiagnosticsError::SpoolUnavailable => "spool_unavailable",
            DiagnosticsError::SpoolWrite => "spool_write",
            DiagnosticsError::InvalidId => "invalid_id",
        }
    }
}

impl Serialize for DiagnosticsError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("DiagnosticsError", 1)?;
        state.serialize_field("code", self.code())?;
        state.end()
    }
}
