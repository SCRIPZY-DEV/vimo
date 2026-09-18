# ADR-0038 — Logs de diagnóstico por ejecución, subidos a Supabase

- **Estado:** Aceptada
- **Fecha:** 2026-09-17
- **Área:** app / pipeline / soporte

## Problema

Tras el lanzamiento, algunos usuarios reportan errores al generar videos o al
actualizar. Diagnosticarlos exige pedirles videos o capturas: los eventos del
sidecar son efímeros (la UI los consume y se pierden) y el único log persistente
es `vimo.log`, local, de 2 MB y con rotación `KeepOne`. Un sidecar que se cae sin
emitir `job-failed` no deja rastro en ningún lado.

Restricciones:

- Soporte busca por **correo + nombre de proyecto**.
- El log debe entenderse sin contexto, lo lea una persona o una IA.
- Hasta hoy ningún dato de uso sale de la máquina: el guion, el texto de las
  escenas y los prompts son contenido del usuario y **no** deben subirse.
- Las claves API (BYO) y las rutas del home jamás pueden llegar a la nube.
- Sin backend nuevo: la app solo tiene el SDK de Supabase con la sesión del usuario.

## Decisión

**Cada ejecución deja un registro redactado. Rust lo captura y lo guarda en un
spool en disco; el webview lo sube a la tabla `diagnostic_logs` con un `insert`
protegido por RLS.**

```
sidecar stdout/stderr ─► Rust ─► proyecta + redacta ─► <appLogDir>/diagnostics/<jobId>.json
                                                              │ evento Tauri «diagnostic-log-ready»
webview (módulo diagnostics) ─► list_pending ─► supabase insert ─► delete_diagnostic_log
```

Se registran **todas** las ejecuciones (éxito, fallo, cancelación, crash) de
los subcomandos del sidecar, más los fallos de instalación del actualizador.
Retención: 30 días.

Única excepción: los subcomandos de lectura o de ajuste chico que la UI dispara
todo el tiempo (`list-*`, `get-*`, `set-*`, `update-*`, `delete-*`, `*-list`,
`*-status`, `*-detail`, `*-delete`, `*-credits` y unos pocos con nombre propio,
ver `report.rs`) se registran **solo si fallan o crashean**. Subirlos cuando
terminan bien inundaría la tabla sin aportar diagnóstico.

### Por qué captura Rust

- Es el único que ve todo: eventos, stderr, stdout fuera de contrato y la
  terminación del proceso (código de salida y señal). Detecta los crashes.
- Conoce los valores reales de las claves API y el home: redacta por coincidencia
  exacta, no por heurística.
- Es la capa común: cubre todos los subcomandos sin tocar cada módulo.
- El spool da offline y reintentos: sin red o sin sesión, el archivo se sube en
  el próximo arranque.

Sube el webview porque la sesión de Supabase (JWT) vive ahí.

### Qué se guarda y qué no

| Pieza                | Regla                                                                                                                                                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Allowlist de claves  | De cada evento solo sobreviven las claves de `ALLOWED_EVENT_KEYS` (`type`, `stageId`, `level`, `code`, `message`, `detail`, `percent`, `phase`, `sceneId`, `modelId`, `provider`, conteos…), y solo si son escalares o listas de números. Rust no redeclara tipos |
| Descartado           | `scene`, `scenes`, `imagePath`, `result`, cualquier objeto anidado, y los eventos `scene-image-progress` / `scene-image-started`                                                                                                                                  |
| Muestreo de progreso | De `progress` y `*-progress`, una entrada cada 10 % por tipo de evento y etapa (cada 30 s si no trae porcentaje)                                                                                                                                                  |
| Redacción de strings | Clave API exacta → `[REDACTED_KEY]`; `Bearer …` / `key=…` → redactado; carpeta de proyectos → `<projects>`; home → `~`; otra carpeta de usuario → `<user>`; tope de 2000 caracteres                                                                               |
| Tope de entradas     | 2000; si se excede quedan las primeras 500 y las últimas 1500, con `events_truncated`                                                                                                                                                                             |
| Eventos sintéticos   | `sidecar-stderr`, `sidecar-stdout-invalid` (longitud + 200 caracteres redactados), `process-exited { exitCode, signal }`                                                                                                                                          |
| Estado final         | `completed`, `failed`, `cancelled`, `paused` o `crashed` (el proceso terminó sin `job-completed` ni `job-failed`)                                                                                                                                                 |
| Spool                | Máximo 100 archivos o 7 días; lo más viejo se descarta                                                                                                                                                                                                            |
| `context`            | Solo opciones no sensibles del proyecto (proveedor y calidad de imagen, formato, proveedor TTS, modelo de prompts, conteos, `demo`, `completedStages`)                                                                                                            |

### Piezas

| Pieza                     | Ubicación                                | Para qué                                                              |
| ------------------------- | ---------------------------------------- | --------------------------------------------------------------------- |
| `DiagnosticRecorder`      | `src-tauri/src/diagnostics/recorder.rs`  | Acumula la línea de tiempo de un job y arma el registro final         |
| Redacción                 | `src-tauri/src/diagnostics/redaction.rs` | Allowlist, redacción de strings y topes                               |
| Spool                     | `src-tauri/src/diagnostics/spool.rs`     | Escritura atómica, listado, borrado y poda                            |
| Comandos                  | `src-tauri/src/diagnostics/commands.rs`  | `list_pending_diagnostic_logs`, `delete_diagnostic_log`               |
| Enganche del pipeline     | `src-tauri/src/pipeline/commands.rs`     | Cada rama del loop de eventos alimenta el recorder                    |
| Enganche del actualizador | `src-tauri/src/updates/commands.rs`      | `report_update_install_failure` escribe un registro `source = update` |
| `diagnosticsApi`          | `src/modules/diagnostics/api/index.ts`   | Lee el spool (invoke) y sube a Supabase                               |
| `DiagnosticsUploader`     | `src/modules/diagnostics/components/`    | Componente sin markup montado una vez en `App.tsx`                    |

Los comandos no aceptan rutas: `delete_diagnostic_log` recibe un id y lo valida
como UUID antes de tocar el disco.

### Esquema (se aplica en el proyecto Supabase; este repo no tiene migraciones)

```sql
create table public.diagnostic_logs (
  id               uuid primary key,                 -- = jobId: insert idempotente
  user_id          uuid not null default auth.uid()
                     references auth.users (id) on delete cascade,
  user_email       text not null,                    -- en minúsculas, validado contra el JWT
  source           text not null check (source in ('pipeline', 'update')),
  module           text,                             -- videos | voices | characters | music | styles | demo | settings
  subcommand       text,                             -- run-video-pipeline, generate-voice, ...
  project_id       text,                             -- slug de la carpeta
  project_name     text,                             -- metadata.name de project.json
  status           text not null check (status in
                     ('completed', 'failed', 'cancelled', 'paused', 'crashed')),
  error_code       text,                             -- code estable (image_timeout, ffmpeg_failed, ...)
  error_message    text,                             -- diagnóstico redactado
  failed_stage     text,                             -- voice | transcription | scene-cuts | scene-prompts | images | render
  started_at       timestamptz not null,
  finished_at      timestamptz not null,
  duration_ms      integer not null,
  app_version      text not null,
  os               text not null,                    -- macos | windows | linux
  os_version       text,
  arch             text,                             -- aarch64 | x86_64
  locale           text,
  context          jsonb not null default '{}',
  events           jsonb not null default '[]',
  events_truncated boolean not null default false,
  created_at       timestamptz not null default now(),
  constraint diagnostic_logs_events_size check (pg_column_size(events) < 524288)
);

create index diagnostic_logs_email_created_idx on public.diagnostic_logs (user_email, created_at desc);
create index diagnostic_logs_project_idx       on public.diagnostic_logs (project_id);
create index diagnostic_logs_error_idx         on public.diagnostic_logs (error_code) where error_code is not null;
create index diagnostic_logs_created_idx       on public.diagnostic_logs (created_at);

alter table public.diagnostic_logs enable row level security;

-- Solo insertar filas propias. Sin select/update/delete para el cliente:
-- soporte lee desde el dashboard o con service role.
create policy diagnostic_logs_insert_own on public.diagnostic_logs
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and user_email = lower(auth.jwt() ->> 'email')
  );

-- Retención de 30 días (requiere la extensión pg_cron).
select cron.schedule('diagnostic-logs-retention', '17 3 * * *',
  $$delete from public.diagnostic_logs where created_at < now() - interval '30 days'$$);
```

Insert-only alcanza porque la subida ocurre después del fin del job (o en el
siguiente arranque si hubo crash). `id = jobId` hace que un reintento duplicado
falle con `23505`, que el cliente trata como éxito y borra del spool.

### Runbook de soporte

```sql
select created_at, status, subcommand, error_code, failed_stage, error_message,
       app_version, os, os_version, arch
from diagnostic_logs
where user_email = lower('<correo>') and project_name ilike '%<nombre>%'
order by created_at desc;

-- La línea de tiempo de una ejecución, una entrada por fila:
select entry from diagnostic_logs, jsonb_array_elements(events) entry where id = '<id>';
```

Cada entrada de `events` tiene `t` (milisegundos desde el inicio del job) y las
claves de la allowlist:
`{ "t": 48210, "type": "scene-image-failed", "stage": "images", "sceneId": 12, "code": "image_timeout", "detail": "…" }`.

## Alternativas consideradas

- **Capturar en el webview (`handleEvent` de cada hook)** — descartada: no ve
  crashes ni stderr, habría que tocar cada módulo y no puede redactar las claves
  porque nunca las conoce.
- **Capturar en el sidecar (emitter)** — descartada: si el proceso muere, muere
  el log; y dos escritores sobre el mismo archivo para sumar la terminación.
- **Edge function en vimo.click** — pospuesta: da validación y rate-limit de
  servidor, pero exige código y despliegue en otro repo. La tabla no cambia si
  se migra después.
- **Una fila por evento** — descartada: soporte busca «la ejecución», no el
  evento; un jsonb por ejecución se lee de un tirón y pesa menos en índices.
- **Subir solo fallos o solo a pedido** — descartada: deja afuera «el video salió
  mal pero no dio error» y agrega un paso al usuario.

## Consecuencias

- ✅ Soporte localiza una ejecución con correo + proyecto, sin pedir videos.
- ✅ Los crashes del sidecar quedan registrados (`crashed` + `process-exited`).
- ✅ Un subcomando nuevo queda cubierto sin escribir nada.
- ⚠️ Es la primera vez que datos de uso salen de la máquina: hay que mencionarlo
  en la política de privacidad de la landing. Queda pendiente un interruptor
  «Enviar diagnósticos» en Ajustes.
- ⚠️ Sin rate-limit de servidor; lo acotan la sesión obligatoria, el `check` de
  512 KB y la retención.
- ⚠️ Una clave nueva en un evento **no** se sube hasta agregarla a la allowlist:
  falla hacia el lado seguro, pero hay que acordarse.
- ⚠️ Los `message` de proveedor incrustan hasta 300 caracteres de su respuesta;
  la redacción cubre claves y rutas, no contenido arbitrario.
- 🔒 **Enmienda a ADR-0006:** el cliente de Supabase deja de ser exclusivo de
  `auth/api`; también lo importa `diagnostics/api`. Sigue prohibido en hooks,
  componentes y vistas.

## Verificación de cumplimiento

- **Build:** `pnpm format && pnpm lint && pnpm build` + `cargo check`,
  `cargo clippy` y `cargo test --lib diagnostics` en `src-tauri/` en verde (los
  tests cubren redacción, allowlist, crash, muestreo y el filtro de subcomandos).
- **Greps ejecutables:**
  - `grep -rln "supabase/client" src/ --include="*.ts*"` → solo
    `src/modules/auth/api/index.ts` y `src/modules/diagnostics/api/index.ts`.
  - `grep -rn "diagnostic_logs" src/` → solo `src/modules/diagnostics/constants.ts`.
- **Manual (app instalada):** video exitoso → fila `completed`; clave de imagen
  inválida → `failed` con `error_code` y `failed_stage`; cancelar → `cancelled`;
  `kill -9` a `vimo-pipeline` → `crashed`; sin red → el archivo queda en el spool
  y se sube al reabrir.
- **Fugas:** buscar en las filas las claves reales, `/Users/`, `C:\Users\` y texto
  del guion → cero coincidencias.
- **RLS:** con otra cuenta autenticada, `select` sobre la tabla devuelve 0 filas.
- **Cómo se vería una regresión:** filas con `imagePrompt` o rutas absolutas en
  `events`; archivos acumulándose en `<appLogDir>/diagnostics/`.

## Referencias

- ADR-0006 (auth y cliente de Supabase), ADR-0010 (contrato NDJSON del sidecar),
  ADR-0027 (actualizador), ADR-0032 (futuro servidor de Vimo).
- `pipeline/runner/events.ts` (catálogo de eventos) y
  `src-tauri/src/pipeline/commands.rs` (loop de eventos).
