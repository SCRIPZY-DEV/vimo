//! Dominio de claves API (ADR-0011): almacenamiento seguro por plataforma,
//! metadata no sensible y validación contra proveedores. Primer módulo de
//! comandos `invoke` del repo.

pub mod commands;
pub mod error;
pub mod provider;
pub mod source;
pub mod store;
pub mod validation;
