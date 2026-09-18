# Logs de diagnóstico — estado de la implementación

- **Fecha:** 2026-09-17
- **Decisión:** [ADR-0038](../../adr/ADR-0038-logs-de-diagnostico-por-ejecucion-en-supabase.md)
- **Estado:** código completo y verificado en build; **QA manual pendiente**
  (requiere la tabla creada en Supabase y la app instalada).

## Qué se hizo

| Capa     | Archivos                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------- |
| Rust     | `src-tauri/src/diagnostics/` (`redaction`, `recorder`, `spool`, `report`, `commands`, `error`)    |
| Enganche | `src-tauri/src/pipeline/commands.rs`, `src-tauri/src/updates/commands.rs`, `src-tauri/src/lib.rs` |
| Webview  | `src/modules/diagnostics/` (api, hook, componente, tipos, constantes, utilidades) y `src/App.tsx` |
| Deps     | `os_info` (versión del SO) en `src-tauri/Cargo.toml`                                              |
| Docs     | ADR-0038, enmienda a ADR-0006, sección «Logs de diagnóstico» en ARCHITECTURE                      |

Diferencias con el plan original:

- Los timestamps viajan en el spool como milisegundos epoch y el webview los
  convierte a ISO: evita sumar una dependencia de fechas en Rust.
- `os_info` en vez de `tauri-plugin-os`: solo se necesita la versión del SO desde
  Rust, sin registrar un plugin ni abrir un permiso al webview.
- Los subcomandos de lectura o ajuste chico (`list-*`, `*-status`, `*-credits`,
  `update-*`…) se registran **solo si fallan**: la UI los dispara todo el tiempo.
- La columna `module` la deriva el webview del nombre del subcomando
  (`SUBCOMMAND_MODULE_KEYWORDS`), porque Rust no conoce los módulos de la UI.
- El spool también se vacía al iniciar sesión (`SIGNED_IN`), no solo al arrancar.

## Verificación hecha

- `pnpm format`, `pnpm lint`, `pnpm build`: en verde.
- `cargo check` y `cargo clippy` en `src-tauri/`: sin advertencias.
- `cargo test --lib diagnostics` (`pnpm test:tauri`): 29 tests en verde (redacción de
  claves y rutas, allowlist, crash, cancelado/pausa, muestreo de progreso, truncado
  de la línea de tiempo, filtro de subcomandos, contexto sin contenido, id de
  proyecto sin path-traversal; spool: escritura atómica sin `.tmp`, orden viejo a
  nuevo, lote de 20, registro ilegible descartado, poda por cantidad y por edad,
  borrado idempotente e ids que no son UUID rechazados). Viven en
  `src-tauri/src/diagnostics/tests/`, uno por archivo (convención en
  `CLAUDE.md` y `docs/ARCHITECTURE.md`).
- `grep -rln "supabase/client" src/` → solo `auth/api` y `diagnostics/api`.

**No verificado:** el recorrido completo (job real → spool → fila en Supabase). No
hay framework de tests de integración y la tabla todavía no existe.

## Pasos para dejarlo andando

1. Aplicar el SQL de la ADR-0038 en el proyecto Supabase (tabla, índices, RLS y el
   `cron.schedule` de retención; `pg_cron` debe estar habilitado).
2. Generar un build instalable (OAuth no funciona en dev) e iniciar sesión.

## QA manual pendiente

Con proyectos en `~/Documents/06-test`:

1. Video exitoso → fila `completed`, con las etapas en `events` y sus tiempos.
2. Clave de Fal inválida → `failed`, `error_code = image_invalid_api_key`,
   `failed_stage = images`.
3. Cancelar a mitad → `cancelled`.
4. `kill -9` al proceso `vimo-pipeline` → `crashed`, con `process-exited` y la
   señal como última entrada.
5. Sin red durante el job → el archivo queda en
   `~/Library/Logs/click.vimo.portable/diagnostics/` y se sube al reabrir con red.
6. Generar una voz, un personaje y una canción → filas con su `module`.
7. Navegar por Library un rato → **no** aparecen filas de `list-video-projects` ni
   `video-project-status`.
8. Fugas: en las filas nuevas, buscar las claves reales de `.harness-keys.json`,
   `/Users/`, `C:\Users\` y frases del guion → cero coincidencias.
9. RLS: con otra cuenta autenticada, `select * from diagnostic_logs` devuelve 0
   filas; un `insert` con el `user_email` de otro falla.
10. Windows: repetir 1, 2 y 8 (las rutas con `\` son el caso menos probado).

## Pendientes fuera de este cambio

- Mencionar el envío de diagnósticos en la política de privacidad de la landing.
- Interruptor «Enviar diagnósticos» en Ajustes.
- Si aparece abuso: mover la ingesta a una edge function (la tabla no cambia).
- Migrar los tests de Rust a CI cuando exista pipeline de tests.
