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

| Pieza                | Regla                                                                                                                                                                                                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Allowlist de claves  | De cada evento solo sobreviven las claves de `ALLOWED_EVENT_KEYS` (`type`, `stageId`, `level`, `code`, `message`, `detail`, `percent`, `phase`, `sceneId`, `modelId`, `provider`, `httpStatus`, `attempt`, `maxAttempts`, `recovered`, conteos…), y solo si son escalares o listas de números. Rust no redeclara tipos |
| Descartado           | `scene`, `scenes`, `imagePath`, `result`, cualquier objeto anidado, y los eventos `scene-image-progress` / `scene-image-started`                                                                                                                                                                                       |
| Muestreo de progreso | De `progress` y `*-progress`, una entrada cada 10 % por tipo de evento y etapa (cada 30 s si no trae porcentaje)                                                                                                                                                                                                       |
| Redacción de strings | Clave API exacta → `[REDACTED_KEY]`; `Bearer …` / `key=…` → redactado; carpeta de proyectos → `<projects>`; home → `~`; otra carpeta de usuario → `<user>`; tope de 2000 caracteres                                                                                                                                    |
| Tope de entradas     | 2000; si se excede quedan las primeras 500 y las últimas 1500, con `events_truncated`                                                                                                                                                                                                                                  |
| Eventos sintéticos   | `sidecar-stderr`, `sidecar-stdout-invalid` (longitud + 200 caracteres redactados), `process-exited { exitCode, signal }`                                                                                                                                                                                               |
| Estado final         | `completed`, `failed`, `cancelled`, `paused` o `crashed` (el proceso terminó sin `job-completed` ni `job-failed`; lleva `error_code = process_crashed` con el código de salida y la señal en `error_message`)                                                                                                          |
| Spool                | Máximo 100 archivos o 7 días; lo más viejo se descarta                                                                                                                                                                                                                                                                 |
| `context`            | Solo opciones no sensibles del proyecto (proveedor y calidad de imagen, formato, proveedor TTS, modelo de prompts, conteos, `demo`, `completedStages`) más `subject { kind, id }`: qué identifica al job (ver «Identidad de la fila»)                                                                                  |

### Piezas

| Pieza                     | Ubicación                                | Para qué                                                              |
| ------------------------- | ---------------------------------------- | --------------------------------------------------------------------- |
| `DiagnosticRecorder`      | `src-tauri/src/diagnostics/recorder.rs`  | Acumula la línea de tiempo de un job y arma el registro final         |
| Redacción                 | `src-tauri/src/diagnostics/redaction.rs` | Allowlist, redacción de strings y topes                               |
| Identidad                 | `src-tauri/src/diagnostics/subject.rs`   | Proyecto o entidad (estilo, personaje, voz…) que identifica al job    |
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
  module           text,                             -- videos | voices | characters | avatars | music | styles | demo | settings
  subcommand       text,                             -- run-video-pipeline, generate-voice, ...
  project_id       text,                             -- slug de la carpeta
  project_name     text,                             -- metadata.name de project.json
  status           text not null check (status in
                     ('completed', 'failed', 'cancelled', 'paused', 'crashed')),
  error_code       text,                             -- code estable (image_timeout, ffmpeg_failed, ...)
  error_message    text,                             -- diagnóstico redactado
  error_provider   text,                             -- proveedor externo que falló (fal, evolink, deepinfra, dubvoice, …)
  error_http_status integer,                        -- status HTTP de ese fallo, si lo hubo
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
  seen             boolean not null default false,   -- revisada por soporte (enmienda 2026-09-23)
  seen_at          timestamptz,                      -- cuándo se marcó
  seen_by          text,                             -- correo del admin que marcó
  constraint diagnostic_logs_events_size check (pg_column_size(events) < 524288),
  constraint diagnostic_logs_seen_consistente check (
    (seen and seen_at is not null and seen_by is not null)
    or (not seen and seen_at is null and seen_by is null)
  )
);

create index diagnostic_logs_email_created_idx on public.diagnostic_logs (user_email, created_at desc);
create index diagnostic_logs_project_idx       on public.diagnostic_logs (project_id);
create index diagnostic_logs_error_idx         on public.diagnostic_logs (error_code) where error_code is not null;
create index diagnostic_logs_provider_idx      on public.diagnostic_logs (error_provider) where error_provider is not null;
create index diagnostic_logs_created_idx       on public.diagnostic_logs (created_at);

alter table public.diagnostic_logs enable row level security;

-- El cliente solo inserta filas propias, y nunca ya marcadas como vistas. Sin
-- select/update/delete para el cliente: soporte lee y marca «visto» desde el
-- panel admin de vimo.click (service role, enmienda 2026-09-23).
create policy diagnostic_logs_insert_own on public.diagnostic_logs
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and user_email = lower(auth.jwt() ->> 'email')
    and seen = false
  );

-- Retención de 30 días (requiere la extensión pg_cron).
select cron.schedule('diagnostic-logs-retention', '17 3 * * *',
  $$delete from public.diagnostic_logs where created_at < now() - interval '30 days'$$);
```

Insert-only alcanza porque la subida ocurre después del fin del job (o en el
siguiente arranque si hubo crash). `id = jobId` hace que un reintento duplicado
falle con `23505`, que el cliente trata como éxito y borra del spool.

### Identidad de la fila: `project_id` y `project_name`

Soporte busca por correo + nombre, así que **toda fila lleva un `project_name`
legible**, tenga o no proyecto. `subject.rs` resuelve la identidad del job desde el
subcomando y el payload (nunca contenido: ni `text`, ni `prompt`, ni `script`), y
`context.subject` guarda `{ kind, id }` para consultar por tipo sin depender del texto:

| Job                                                                      | `project_id`               | `project_name`                                                           |
| ------------------------------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------ |
| Payload con `projectId` (o `projectIds`, se toma el primero)             | el id                      | `name` de `project.json`                                                 |
| `create-video-project` que falla, se cancela o crashea                   | `NULL` (todavía no existe) | `payload.name`                                                           |
| `style-*`, `generate-style-samples`                                      | `NULL`                     | `Estilo: <nombre>` (del payload o de `_styles/<id>/style.json`)          |
| `character-*`, `design-style-character`, `generate-character-preview`, … | `NULL`                     | `Personaje: <nombre>` (del payload o de `characters/<id>/metadata.json`) |
| `avatar-*`, `avatars-list`                                               | `NULL`                     | `Avatar: <nombre>` (del payload o de `avatars/<id>/metadata.json`)       |
| `generate-voice`, `probe-tts`, `add-library-voice`                       | `NULL`                     | `Voz: <voiceName \| name \| provider>`                                   |
| `generate-music`, `suggest-music-prompt`, `choose-music` sin proyecto    | `NULL`                     | `Música` (el prompt es contenido)                                        |
| `demo-*`                                                                 | `NULL`                     | `Demo`                                                                   |

Los prefijos son fijos y en español (`Estilo`, `Personaje`, `Avatar`, `Voz`, `Música`,
`Demo`): son un valor de datos para soporte, no texto de la UI, y permiten filtrar
(`project_name like 'Estilo:%'`) sin mezclarse con los proyectos reales. Sin nombre
resuelto queda solo el prefijo. La música que se genera desde un proyecto manda
`projectId` en el payload (el handler lo ignora) y cae en la primera fila de la tabla.
Un avatar que ya está en la biblioteca (payload con `id`) se nombra siempre desde su
`metadata.json`: en `avatar-generate-look` el `name` del payload es el del look nuevo.
Sin `id`, el `name` del payload es el del avatar: `avatar-create-photo` lo necesita y
`avatar-add` lo manda solo para esta fila (el handler lo ignora).

### Errores de proveedor

`PipelineFailure(code, message, { provider?, httpStatus? })`: los proveedores declaran
quién rechazó y con qué status. El `job-failed` los reenvía y quedan en las columnas
`error_provider` / `error_http_status`, además del `message` redactado.

Los fallos que el pipeline **recupera** (reintento de Fal/Evolink por 429 o 5xx,
backoff y degradación de tier del LLM, cascada de carriles TTS) emiten el evento
`provider-failure { provider, code, httpStatus?, attempt?, maxAttempts?, recovered,
stageId?, sceneId?, detail? }` (`pipeline/utils/provider-failure.ts`). Entra a `events`
por la allowlist y permite ver que un proveedor falló aunque la fila sea `completed`.
Regla: **todo reintento o fallback de proveedor emite `provider-failure`**; el fallo
terminal sigue viajando solo en `job-failed`.

### Runbook de soporte

```sql
select created_at, status, subcommand, error_code, failed_stage, error_message,
       app_version, os, os_version, arch
from diagnostic_logs
where user_email = lower('<correo>') and project_name ilike '%<nombre>%'
order by created_at desc;

-- La línea de tiempo de una ejecución, una entrada por fila:
select entry from diagnostic_logs, jsonb_array_elements(events) entry where id = '<id>';

-- Fallos de proveedor de la última semana, terminales y recuperados:
select created_at, subcommand, project_name, status, error_code, error_provider, error_http_status
from diagnostic_logs
where created_at > now() - interval '7 days'
  and (error_provider is not null or events @> '[{"type":"provider-failure"}]')
order by created_at desc;

-- Reintentos recuperados, por proveedor y código:
select entry->>'provider' as provider, entry->>'code' as code, count(*)
from diagnostic_logs, jsonb_array_elements(events) entry
where entry->>'type' = 'provider-failure' and (entry->>'recovered')::boolean
group by 1, 2 order by 3 desc;

-- Filas sin identidad (debería tender a cero):
select subcommand, count(*) from diagnostic_logs
where project_name is null group by 1 order by 2 desc;

-- Fallos todavía sin revisar por soporte, por usuario (el panel admin los marca):
select user_email, count(*) from diagnostic_logs
where status in ('failed', 'crashed', 'cancelled') and not seen
group by 1 order by 2 desc;

-- Marcar visto a mano (el check exige las tres columnas):
update diagnostic_logs set seen = true, seen_at = now(), seen_by = '<correo>'
where id = '<id>';
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
- ⚠️ La marca «visto» (`seen`, `seen_at`, `seen_by`) vive 30 días con la fila: no es
  historial de auditoría. Si hiciera falta, iría a otra tabla.
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
- **RLS:** con otra cuenta autenticada, `select` sobre la tabla devuelve 0 filas y
  un `update … set seen = true` no toca ninguna.
- **Cómo se vería una regresión:** filas con `imagePrompt` o rutas absolutas en
  `events`; archivos acumulándose en `<appLogDir>/diagnostics/`.

## Referencias

- ADR-0006 (auth y cliente de Supabase), ADR-0010 (contrato NDJSON del sidecar),
  ADR-0027 (actualizador), ADR-0032 (futuro servidor de Vimo).
- `pipeline/runner/events.ts` (catálogo de eventos) y
  `src-tauri/src/pipeline/commands.rs` (loop de eventos).

## Enmienda 2026-09-21 — identidad en toda fila y errores de proveedor

- `project_name` deja de depender solo de `payload.projectId`: ver «Identidad de la
  fila». Antes quedaban en `NULL` la creación fallida de un proyecto, la música
  generada desde un proyecto y todos los jobs de estilos, personajes y voces.
- Columnas nuevas `error_provider` y `error_http_status`, y el evento
  `provider-failure` para los fallos recuperados. Migración a aplicar **antes** del
  release (una app nueva contra la tabla vieja falla el insert y deja el registro en
  el spool hasta 7 días; una app vieja contra la tabla nueva manda `NULL`):

  ```sql
  alter table public.diagnostic_logs
    add column error_provider    text,
    add column error_http_status integer;
  create index diagnostic_logs_provider_idx
    on public.diagnostic_logs (error_provider) where error_provider is not null;
  ```

- Un crash ya no queda con `error_code` vacío: `process_crashed`.
- Los `log` warn/error que el emitter espeja a stderr entran una sola vez en `events`
  (se descarta la copia `sidecar-stderr` con prefijo `[warn] ` / `[error] `).

## Enmienda 2026-09-23 — marca de revisión de soporte (`seen`)

El panel de Diagnósticos de vimo.click necesitaba distinguir los fallos ya revisados
de los nuevos: con 30 días de retención, la lista de un usuario activo mezcla lo
recién llegado con lo ya triado. Tres columnas nuevas, un check y la policy de insert
más estricta. Compatible en ambos sentidos: la app no las nombra, y la landing degrada
con un aviso si la migración falta. Se puede aplicar antes o después del deploy de la
landing; antes evita el aviso.

```sql
alter table public.diagnostic_logs
  add column if not exists seen    boolean     not null default false,
  add column if not exists seen_at timestamptz,
  add column if not exists seen_by text;              -- correo del admin que marcó

-- seen_at / seen_by van juntos con seen = true (marcar a mano exige las tres).
alter table public.diagnostic_logs
  add constraint diagnostic_logs_seen_consistente check (
    (seen and seen_at is not null and seen_by is not null)
    or (not seen and seen_at is null and seen_by is null)
  );

-- El cliente nunca manda `seen`; ahora tampoco podría (el default cubre el insert).
alter policy diagnostic_logs_insert_own on public.diagnostic_logs
  with check (
    user_id = auth.uid()
    and user_email = lower(auth.jwt() ->> 'email')
    and seen = false
  );

-- PostgREST cachea el esquema: si tras el ALTER sigue sin ver `seen`, forzar.
notify pgrst, 'reload schema';

-- Opcional, solo si el filtro «Solo no vistos» del panel se nota lento:
-- create index if not exists diagnostic_logs_sin_revisar_idx
--   on public.diagnostic_logs (user_email, created_at desc) where seen = false;
```

Sin índice por defecto: el resumen por usuario filtra solo por `created_at`, y el
listado de un usuario con `seen = false` ya usa `diagnostic_logs_email_created_idx`.

- La tabla **deja de ser estrictamente insert-only por el lado admin**: la Pages
  Function `PATCH /api/admin/diagnosticos` de vimo-landing actualiza `seen` /
  `seen_at` / `seen_by` con service role (`seen_at` lo sella la Function: PostgREST
  no puede llamar a `now()` en un PATCH). El cliente de escritorio sigue siendo
  insert-only y no lee ni actualiza nada.
- **La app no cambia**: no manda ni lee estas columnas; una app vieja contra la tabla
  nueva funciona igual. No hace falta release.
- Solo llevan checkbox las ejecuciones `failed`, `crashed` y `cancelled`
  (`STATUS_REVISABLES` en `src/lib/diagnosticLogs.ts` de vimo-landing); el resumen por
  usuario expone `sin_revisar` y el listado acepta `?seen=false`.
- La marca es **efímera**: se borra con la fila a los 30 días. No es auditoría.
- Rollback: `alter policy … with check (user_id = auth.uid() and user_email =
lower(auth.jwt() ->> 'email'))`, `drop constraint diagnostic_logs_seen_consistente`,
  `drop column seen_by, seen_at, seen` y `notify pgrst, 'reload schema'`.
- Handoff: `docs/handoff/2026-09-23-diagnostic-logs-seen/implementation.md`.

## Nota posterior 2026-09-30 — `gem_rebuild_logs`, una excepción de texto en otra tabla

La Entrega 1 de las gemas por secciones
([ADR-0048](ADR-0048-gemas-por-secciones-y-agente-reconstructor.md)) suma al servidor de
vimo.click el agente reconstructor (`POST /api/estilos/reconstruir`). Cada reconstrucción
intentada, con éxito o con error, deja una fila en una tabla nueva de Supabase,
`gem_rebuild_logs`. Esa tabla **no respeta la restricción de esta ADR** de no subir
contenido del usuario («el guion, el texto de las escenas y los prompts […] no deben
subirse»): es una excepción deliberada, no un olvido.

- **Sí guarda texto.** `input_text` es la gema completa que mandó el usuario y `output_json` lo
  que devolvió el modelo (en una fila `error`, su último contenido crudo, hasta 50 000
  caracteres). Fue decisión del dueño, para poder diagnosticar el agente: por qué una gema salió
  mal separada en secciones o por qué el modelo no pasó el esquema. Sin el texto, un
  `modelo-fallo` no se podría explicar.
- **Es una tabla aparte.** `diagnostic_logs` no cambia: sigue sin contenido del usuario y la app
  sigue subiéndola con su `insert` protegido por RLS. La app no escribe en `gem_rebuild_logs`: la
  escribe la Function de vimo-landing, por un pedido ya autenticado y con el cuerpo validado.
- **Solo el service role la toca.** RLS activo y sin políticas, como `demo_accesos`: la app no
  inserta, no lee ni actualiza nada. No hay panel; los registros se consultan en Supabase.
- **Retención de 60 días** con pg_cron (`gem-rebuild-logs-retention`; eran 30, como
  `diagnostic_logs`, hasta que el dueño la llevó a 60 el 2026-10-01): el texto vive lo que vive la
  fila.
- **El log de la Function no repite el contenido.** Nunca escribe `input_text` ni el
  `output_json` crudo. Su `error_detail`, acotado a 500 caracteres en la línea de log y a 2000
  en la fila, no es neutro: según la causa puede citar un fragmento del cuerpo de error del
  proveedor o los valores que escribió el modelo.

El SQL (columnas, índice y retención) está en el spec
(`docs/handoff/2026-09-30-catalog-on-custom-style-lane/design.md`, §6.5) y en
`SETUP_RECONSTRUCTOR_GEMAS.md` de vimo-landing, y lo aplica el dueño. La ADR-0048 documenta el
registro (L1), el cupo y los modos de falla.
