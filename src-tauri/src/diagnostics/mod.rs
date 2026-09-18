//! Logs de diagnóstico por ejecución (ADR-0038): Rust arma un registro
//! redactado de cada job mientras reenvía sus eventos, lo deja en un spool en
//! disco y el webview lo sube a Supabase cuando hay sesión y red.

pub mod commands;
pub mod error;
pub mod recorder;
pub mod redaction;
pub mod report;
pub mod spool;
