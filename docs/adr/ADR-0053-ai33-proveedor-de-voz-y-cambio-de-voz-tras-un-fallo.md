# ADR-0053 — ai33 como proveedor de voz, y cambio de voz tras un fallo

- **Estado:** Propuesta (implementada; falta verificar contra la API real con una clave)
- **Fecha:** 2026-10-13
- **Área:** providers / pipeline / app

## Problema

DubVoice, el agregador de voces que usa la narración (ADR-0024), falla seguido:
mantenimiento, 5xx del gateway, tareas que terminan en `failed`. Cada falla corta la
fase de voz del video y el usuario solo podía reintentar con la misma voz. ai33
(OpenSpeaker, `https://api.ai33.pro`) sirve los mismos motores (ElevenLabs, Minimax,
Vbee, Fish Audio, Edge) más voces clonadas y Kokoro, y en la práctica falla menos.

Restricciones:

- El id de motor está persistido (`project.json`, historial, favoritos): lo ya
  guardado con DubVoice tiene que seguir funcionando igual.
- La API v3 de ai33 es **una sola**: `POST /v3/text-to-speech` con FormData, y el
  motor real viaja como **prefijo del `voice_id`** (`elevenlabs_<id>`, `minimax_<id>`,
  …). Solo honra `speed` (0.5–1.5): no recibe modelo, idioma ni los demás ajustes.
- Un envío que se corta antes de devolver el `task_id` dejaba el recibo sin resolver
  (`voice_request_unresolved`): el proyecto quedaba trabado aunque se reintentara.
- Claves BYO (ADR-0011): la clave de ai33 es del usuario y vive en el keychain.

## Decisión

**ai33 es un tercer proveedor de voces, elegible en Ajustes como DubVoice o
ElevenLabs. No hay respaldo automático entre ai33 y DubVoice: si la narración falla,
el usuario elige entre «Reintentar» y «Cambiar voz», con un aviso previo para revisar
el historial del proveedor.**

### Proveedor ai33

- `pipeline/types/voices.ts`: `VoiceProviderId` y `VoiceVendorId` ganan `'ai33'`;
  tipo `Ai33Catalog` (los catálogos de la Voice Library) y `ListVoicesFilters.catalog`.
- `pipeline/providers/tts/ai33.ts`, un solo motor:
  - **Síntesis por tarea:** `POST /v3/text-to-speech` → `task_id` en el recibo →
    `GET /v1/task/{id}` → descarga de `metadata.audio_url`. Retomable por `task_id`.
    Partes de 25 000 chars (ADR-0025).
  - **Reintentos:** 429 y 503 `server_busy` se reintentan con `Retry-After`, backoff
    y jitter (la doc dice que no crean tarea). 401/403, saldo y el resto de 5xx se
    clasifican a los códigos `voice_*` de siempre.
  - **Catálogo:** `GET /v3/voices?provider=<catálogo>` paginado en el server; los ids
    quedan prefijados; el idioma viaja por nombre ("Spanish", `language-names.ts`).
  - **Saldo:** `GET /v1/credits`.
  - **Log de diagnóstico (ADR-0038):** los mensajes de error nunca llevan el texto
    narrado. Ver `docs/handoff/2026-10-13-ai33-voice-provider/logs-without-narration.md`.
- Rust (`src-tauri/src/api_keys/`): `Provider::Ai33`; la validación de la clave lee
  `/v1/credits` con `xi-api-key` y devuelve el saldo (patrón Kie/PoYo).
- App: ai33 en Claves API y en el selector de proveedor de Ajustes (en automático
  gana si tiene clave). Pestañas por catálogo (`ai33-elevenlabs`, `ai33-minimax`,
  `ai33-vbee`, `ai33-fishaudio`, `ai33-edge` solo en el picker, `ai33-clone`);
  ajustes de voz solo velocidad (`isSpeedOnlyEngine`).

### Envío cortado: reconciliar en vez de trabar

- `TtsProvider.findSubmittedTask` (`pipeline/providers/tts/provider.ts`) busca la
  tarea de un envío cuya respuesta se perdió. ai33 marca cada POST con
  `file_name = vimo-<huella del pedido>` y la busca en `GET /v1/tasks` (si el listado
  no expone la marca, por texto y hora, y solo con una coincidencia única).
- `chunked-synthesis.ts` y `request-checkpoint.ts`: tras un envío cortado (red,
  timeout, 5xx) se espera 3 s y se busca. Si aparece, el recibo adopta su id y se
  sigue consultando (no se paga dos veces); si se confirma que no existe, la parte
  falla con `voice_submission_failed` y el recibo queda libre para reintentar; si no
  se puede saber, el recibo queda sin resolver como antes. Al retomar un proyecto se
  hace la misma búsqueda antes de rechazar el recibo.

### Cambiar voz tras un fallo

- `pipeline/commands/videos/set-project-voice.ts` (nuevo): guarda proveedor, voz y
  ajustes por defecto del motor en `options` y descarta lo que la voz anterior dejó a
  medias (`discardNarrationProgress`: partes, manifest, recibos pendientes y
  temporales). Se rechaza si la etapa de voz ya se completó: esa narración se cambia
  desde el editor (`replace-narration`).
- `useCreateTask.switchVoice` (Crear y progreso de Biblioteca) y
  `switchVoiceForProject` (reproductor de Biblioteca): llaman al comando y relanzan
  `run-video-pipeline`, que relee las opciones.
- `GenerationErrorCard` y `TaskErrorCard` muestran «Cambiar voz» junto a
  «Reintentar» cuando la fase que cayó es la de voz y la narración es sintetizada.
- `VoiceSwitchDialog`: primero un aviso para revisar el historial en el panel del
  proveedor que falló, con botón para abrirlo (`VOICE_HISTORY_URLS`). Si el fallo
  pudo dejar una generación aceptada (`voice_request_pending`,
  `voice_request_unresolved` o un fallo sin código tras reiniciar la app), dice
  explícitamente que pudo haberse cobrado y que «Reintentar» la retoma sin pagar
  otra. Al continuar, el mismo selector de voz de Crear.

## Alternativas consideradas

- **Respaldo automático ai33 → DubVoice con la voz traducida** — implementado y
  retirado el mismo día: el dueño lo encontró difícil de explicar (en qué casos salta,
  por qué solo en un sentido, voces clonadas sin equivalente) y prefirió que el
  usuario decida. Además dependía de que los ids de voz coincidan entre proveedores,
  sin verificar. Podría volver si el cambio manual resulta insuficiente.
- **Respaldo en los dos sentidos** — descartado por la misma razón.
- **Un motor de Vimo por catálogo de ai33** (`ai33-minimax`, …) — descartado: el id
  ya trae el motor como prefijo, la API es una sola y todos aceptan los mismos
  ajustes.
- **Volver a enviar a ciegas un envío cortado** — descartado: si la tarea se creó, se
  paga dos veces.
- **Webhook `receive_url`** — descartado: la app es de escritorio, no tiene URL
  pública.

## Consecuencias

- ✅ El usuario elige proveedor (ai33, DubVoice o ElevenLabs) y, si la voz falla,
  puede seguir con otra voz u otro proveedor sin rehacer el proyecto.
- ✅ Un corte de red durante el envío ya no traba el proyecto con ai33.
- ✅ Lo guardado con DubVoice o ElevenLabs directo no cambia; el respaldo previo
  ElevenLabs vía DubVoice ↔ ElevenLabs directo (ADR-0024) se conserva.
- ⚠️ Una falla de voz requiere una decisión del usuario: el video no termina solo.
- ⚠️ Al cambiar de voz se descarta una generación que pudo cobrarse; el aviso lo
  dice y ofrece revisar el historial antes.
- ⚠️ Por ai33 solo viaja la velocidad: una voz de ElevenLabs o Minimax puede sonar un
  poco distinta que con sus ajustes finos por DubVoice.
- ⚠️ Partes de la API no están documentadas (forma del saldo, items de la Voice
  Library, paginación, si el listado de tareas expone `file_name`): se leen con
  alternativas defensivas hasta verificarlas en vivo.
- 🔒 `set-project-voice` solo actúa antes de completar la etapa de voz.

## Verificación de cumplimiento

- **Tests:** `node --test scripts/test/check-ai33-voice.mjs` (local) —
  - síntesis por tarea con voz prefijada, velocidad acotada y `xi-api-key`;
  - 429 y 503 `server_busy` reintentan sin crear otra tarea;
  - tarea en error y clave rechazada cortan la narración sin pedir nada a DubVoice;
  - un envío cortado se encuentra por su marca y se paga una vez;
  - un envío cortado sin tarea falla con `voice_submission_failed` y el reintento
    vuelve a enviar;
  - un envío que no se puede averiguar queda sin resolver y el reintento adopta la
    tarea sin volver a pagar;
  - el log no lleva el texto narrado;
  - `set-project-voice` guarda la voz y borra recibos y partes; rechaza proveedores
    desconocidos y narraciones ya completas;
  - catálogo por motor con ids prefijados.
- `check-voice-resume.mjs` y `check-provider-failure-events.mjs` siguen verdes.
- `pnpm test:tauri`: lectura del saldo de ai33 en `tests/validation.rs`.
- **Guards:** `pnpm build` (los `Record<VoiceVendorId | VoiceProviderId, …>` exigen
  la entrada de ai33), `pnpm check:locales`.
- **Pendiente:** verificar con una clave real la forma de `/v1/credits`, de
  `/v3/voices` y de `/v1/tasks`, el costo en créditos por carácter (hoy
  `VOICE_COST_FACTORS.ai33 = 1`) y la URL exacta del historial de cada panel.
- **Cómo se vería una regresión:** un proyecto trabado en `voice_request_unresolved`
  tras un corte de red con ai33; o una falla de voz sin el botón «Cambiar voz».

## Fuera de alcance

- «Cambiar voz» en la pausa por saldo insuficiente de voz (`InsufficientCreditsCard`,
  `NoCreditsResumePanel`): hoy esa pausa solo ofrece cargar saldo y reanudar.

## Referencias

- ADR-0024 (dos proveedores de voces), ADR-0025 (troceo), ADR-0031 (saldo y pausa),
  ADR-0032 (proveedores en servidor: si pasa a Aceptada, ai33 se mueve allá),
  ADR-0038 (logs de diagnóstico).
- Documentación de la API: `https://ai33.pro/app/api-document`.
