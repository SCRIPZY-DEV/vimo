# Logs de diagnóstico: identidad en toda fila y errores de proveedor — estado

- **Fecha:** 2026-09-21
- **Decisión:** [ADR-0038](../../adr/ADR-0038-logs-de-diagnostico-por-ejecucion-en-supabase.md),
  enmienda del 2026-09-21.
- **Estado:** código completo y verificado en build, tests de Rust y guards del
  sidecar; **falta aplicar el ALTER TABLE en Supabase y el QA manual** con la app
  instalada.

## Qué se encontró

El logger funcionaba: cada job dejaba su fila con `status`, `error_code` y
`error_message`. Dos huecos:

1. `project_id` / `project_name` solo salían de `payload.projectId`. Quedaban en
   `NULL` la creación de proyecto que falla, la música generada desde un proyecto,
   `delete-video-projects` (usa `projectIds`) y todo lo que no es un proyecto
   (`style-save`, `generate-style-samples`, personajes, voces).
2. Los errores de proveedor se subían solo como fallo terminal y en texto libre:
   sin proveedor ni status HTTP estructurados, y los reintentos que el pipeline
   absorbía (Fal 429/5xx, backoff de DeepInfra, cascada TTS) no dejaban código.
   Además un crash quedaba con `error_code = NULL` y los `log` warn/error entraban
   dos veces (evento + espejo en stderr).

## Qué se hizo

| Capa     | Archivos                                                                                                                                                                                                                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rust     | `src-tauri/src/diagnostics/subject.rs` (nuevo: familia, id y nombre del job; etiquetas `Estilo:` / `Personaje:` / `Voz:` / `Música` / `Demo`; lectura de `project.json`, `_styles/<id>/style.json`, `characters/<id>/metadata.json`), `recorder.rs` (subject, `error_provider`, `error_http_status`, `process_crashed`, stderr espejado), `report.rs` (`describe_subject`), `redaction.rs` (allowlist) |
| Sidecar  | `pipeline/runner/failure.ts` (`PipelineFailure(code, message, { provider, httpStatus })`, `failureDetails`), `runner/events.ts` (`ProviderFailureEvent`, `job-failed` con proveedor y status), `utils/provider-failure.ts` (nuevo), `main.ts`, `types/images.ts`, `types/music.ts` (`projectId?`), proveedores de imagen/LLM/TTS/transcripción/música/ytdlp, lanes de imágenes, `stages/voice/narration.ts`, `providers/llm/generate.ts` (options) |
| Webview  | `src/modules/diagnostics/types/diagnosticLog.ts`, `utilities/toDiagnosticLogRow.ts`, `src/modules/videos/hooks/useProjectAudio.ts` (manda `projectId`)                                                                                                                                                                                                                              |
| Guards   | `scripts/test/check-provider-failure-events.mjs` (nuevo)                                                                                                                                                                                                                                                                                                                       |
| Docs     | ADR-0038 (esquema, etiquetas, evento, runbook, enmienda), ARCHITECTURE §4 «Logs de diagnóstico», README de `scripts/test/`                                                                                                                                                                                                                                                       |

Decisiones que no estaban en el plan original:

- El validador de ids es un superconjunto (`[A-Za-z0-9_-]`) porque los personajes
  admiten mayúsculas y guion bajo; sigue sin aceptar `.`, `/` ni `\`.
- `recovered` en los lanes de imagen: `true` si el carril reintenta; `false` si
  desiste de la escena antes del tope (política de contenido, error no
  reintentable) o si el fallo corta la fase (cuenta / saldo).
- En la cascada TTS el `provider` del evento es el id del carril
  (`elevenlabs`, `elevenlabs-direct`); el `provider` del `PipelineFailure` es el
  vendor del archivo (`dubvoice`, `elevenlabs`).
- `pipeline/providers/llm/interactive.ts` y `providers/image/download.ts` siguen
  lanzando `PipelineFailure` sin proveedor: no tienen un proveedor externo a mano.
- `pendingVoiceProvider` (`request-checkpoint.ts`) no conoce el carril y queda sin
  detalles.

## Verificación hecha

- `pnpm format`, `pnpm lint`, `pnpm build`: en verde.
- `cargo clippy` sin advertencias; `pnpm test:tauri`: 44 tests en verde (13 nuevos en
  `diagnostics/tests/{subject,recorder,report,redaction}.rs`).
- `node --test scripts/test/check-provider-failure-events.mjs`: 4/4 (Fal 503
  recuperado con `provider-failure { fal, 503, recovered: true }` y la escena lista;
  Fal 401 terminal con `provider: 'fal'`, `httpStatus: 401`; cascada TTS con
  `provider-failure` del carril rechazado y el fallback completando; backoff del LLM
  reportado con intento y proveedor).
- Guards existentes sin regresión: `check-image-account-failures` 15/15,
  `check-voice-resume` 12/12, `check-preview-regressions` 32/32, `check-locales`.

**No verificado:** el recorrido completo job → spool → fila en Supabase con las
columnas nuevas (requiere la migración y un build instalado).

## Pasos para dejarlo andando

1. Aplicar en Supabase, **antes** del release:

   ```sql
   alter table public.diagnostic_logs
     add column error_provider    text,
     add column error_http_status integer;
   create index diagnostic_logs_provider_idx
     on public.diagnostic_logs (error_provider) where error_provider is not null;
   ```

   Una app nueva contra la tabla vieja falla el insert y deja el registro en el
   spool (7 días); una app vieja contra la tabla nueva manda `NULL`.

2. Build instalable e iniciar sesión.

## QA manual pendiente

1. Guardar un estilo → fila `style-save` con `project_name = 'Estilo: <nombre>'` y
   `context.subject = { kind: 'style', id }`.
2. Generar muestras del estilo → `generate-style-samples` con la misma etiqueta.
3. Crear un personaje → `Personaje: <nombre>`; generar una voz → `Voz: <voz>`.
4. Crear un proyecto con la clave de DeepInfra inválida → `failed`, `project_name`
   con el nombre tipeado, `error_provider = 'deepinfra'`, `error_http_status = 401`.
5. Generar música desde Library → `generate-music` con `project_id` y `project_name`.
6. Video completo con Fal → si hubo 429/5xx en el camino, `events` trae
   `provider-failure` con `recovered: true` y la fila sigue `completed`.
7. `kill -9` a `vimo-pipeline` → `crashed` con `error_code = 'process_crashed'`.
8. Consultas del runbook de la ADR: «filas sin identidad» tiende a cero.
9. Fugas: en las filas nuevas buscar guion, prompts de música, `text` de voces,
   `/Users/` y claves reales → cero coincidencias.
