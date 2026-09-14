use serde::Serialize;

/// Errores del dominio pipeline. Igual que ApiKeyError: viajan como
/// `{ "code": "..." }` y la UI traduce el código a i18n; acá nunca hay
/// textos user-facing. Los errores DENTRO de un job no llegan por acá sino
/// como evento `job-failed` del sidecar.
#[derive(Debug, thiserror::Error)]
pub enum PipelineError {
    #[error("sidecar entry not found")]
    SidecarMissing,
    #[error("sidecar failed to spawn")]
    SidecarSpawn,
    #[error("sidecar stdin write failed")]
    SidecarWrite,
    #[error("job not found")]
    JobNotFound,
    #[error("project already has a running pipeline")]
    ProjectBusy,
}

impl PipelineError {
    pub fn code(&self) -> &'static str {
        match self {
            PipelineError::SidecarMissing => "sidecar_missing",
            PipelineError::SidecarSpawn => "sidecar_spawn",
            PipelineError::SidecarWrite => "sidecar_write",
            PipelineError::JobNotFound => "job_not_found",
            PipelineError::ProjectBusy => "project_busy",
        }
    }
}

// Tauri exige que el error de un comando sea serializable; el frontend recibe
// el objeto `{ code }` como cuerpo del rechazo del invoke().
impl Serialize for PipelineError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("PipelineError", 1)?;
        state.serialize_field("code", self.code())?;
        state.end()
    }
}
