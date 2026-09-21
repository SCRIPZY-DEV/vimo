# ADR-0031 — Saldo por proveedor: pre-check antes de gastar y pausa retomable al agotarse

- **Estado:** Aceptada
- **Fecha:** 2026-09-11
- **Área:** app | pipeline | providers
- **Completa a:** [ADR-0011](ADR-0011-claves-de-api-byo-en-keychain.md), [ADR-0013](ADR-0013-runner-de-stages-y-fases-de-create.md), [ADR-0014](ADR-0014-modulo-library-edicion-sobre-stages.md)
- **Puente hacia:** [ADR-0032](ADR-0032-proveedores-en-servidor-y-creditos-de-vimo.md)

## Problema

Vimo funciona con claves propias de la persona (BYO-keys, ADR-0011): los «créditos»
son el saldo de su cuenta en cada proveedor (Evolink, Fal, DubVoice, ElevenLabs,
DeepInfra, Deepgram). La app leía saldos (`get-image-credits`, `get-voice-credits`,
`get-music-credits`) y los mostraba en badges, pero nada más:

- **Ningún proveedor clasificaba «saldo agotado».** Un 402 de Fal caía en el loop de
  5 intentos y terminaba en `image_provider_error`; Evolink re-encargaba tareas con
  `quota_exceeded` (estaba en `RETRYABLE_TASK_ERRORS`); DeepInfra, Deepgram y
  DubVoice lo reportaban como `*_provider_error` / `transcription_failed`. Solo
  ElevenLabs tenía `voice_quota_exceeded`.
- **Nada impedía arrancar un pipeline largo sin saldo suficiente**: la persona se
  enteraba a mitad de la fase de imágenes, con la voz y la transcripción ya cobradas.
- **Un job que moría por saldo quedaba en `state: 'error'`**: `LibraryProgress` lo
  mandaba al player y el reintento automático (30/90/180 s) insistía contra el mismo
  rechazo.

Restricciones:

- Sin backend propio: el saldo lo tiene el proveedor y la app solo puede leerlo y
  estimar. Un proveedor sin endpoint de saldo (DeepInfra, Deepgram) solo se detecta
  al fallar.
- El proyecto en disco es el estado (ADR-0013): todo lo generado antes del rechazo
  tiene que ser cache-hit al reanudar, sin volver a cobrar.
- Un saldo ilegible (sin clave, clave sin permiso de admin en Fal, red caída) no puede
  bloquear: el badge ya dice «Sin configurar» y el proveedor dirá.

## Decisión

Detectar «saldo agotado» de forma uniforme en cada proveedor con una familia de
códigos estables, **estimar y bloquear antes de gastar** cuando el saldo leído no
alcanza, y **pausar de inmediato** al primer rechazo dejando el proyecto retomable
con motivo.

### Forma

| Pieza                                                                                                          | Qué hace                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pipeline/utils/insufficient-credits.ts`                                                                       | La familia `*_insufficient_credits` (+ `voice_quota_exceeded`), `isInsufficientCreditsResponse(status, body)` (402, o patrón en el cuerpo con status ≠ 429) e `isInsufficientTaskError` (códigos de tarea de Evolink).                                                                           |
| Providers (`fal.ts`, `evolink.ts`, `dubvoice.ts`, `deepinfra.ts`, `verbatim-client.ts`, `deepgram.ts`, música) | Leen el **cuerpo antes de clasificar por status**: un 403 con detalle de balance es saldo, no clave inválida. `quota_exceeded`/`resource_exhausted` salen de `RETRYABLE_TASK_ERRORS`. `withVerbatimRetry`, `prompt-writer` y `visual-bible` tratan el saldo como terminal, igual que `llm_auth`. |
| `pipeline/stages/images/images.ts`                                                                             | Un `AbortController` propio por corrida de carriles: al primer rechazo por saldo aborta los carriles en vuelo (no piden más imágenes) y relanza; lo bajado queda en disco.                                                                                                                       |
| `pipeline/stages/voice/narration.ts`                                                                           | Si ningún carril pudo y uno rechazó por saldo, el job cae con ESE código y no con `voice_all_lanes_failed`.                                                                                                                                                                                      |
| `VideoProjectMetadata.pauseReason` (`pipeline/types/video-project.ts`)                                         | `'cancelled' \| 'insufficient-credits'`. `run-video-pipeline.ts` deja `state: 'paused'` + `pauseReason: 'insufficient-credits'` + `errorCode` del dominio. `paused` y no `error`: es la única rama que ya era retomable en toda la cadena.                                                       |
| `src/modules/common/{types/credits.ts, utilities/creditsBalance.ts, utilities/compareCostLines.ts}`            | `CreditsShortfallLine` (agnóstica del proveedor), `balanceFor`/`sufficiencyOf` y el cruce estimación ↔ saldo: bloquea SOLO con saldo leído e insuficiente en una línea obligatoria.                                                                                                              |
| `src/modules/common/components/InsufficientCreditsAlert.tsx`                                                   | El aviso: necesitás X · tenés Y · **Recargar saldo** (`apiKeysApi.openBillingPage`, `billingUrl` en el catálogo de `api-keys`) · Refrescar.                                                                                                                                                      |
| `src/modules/videos/{utilities/estimateCreateCost.ts, estimateResumeCost.ts, hooks/useCostCheck.ts}`           | Estimación de Crear (voz por caracteres × `VOICE_COST_FACTORS`, imágenes por escenas × precio de la calidad, BGM informativo) y de reanudar (solo fases no completadas y escenas sin imagen), con `COST_ESTIMATE_SAFETY_FACTOR = 1.1`. `verify()` re-lee el saldo justo antes de arrancar.       |
| `useCreateTask.ts`, `InsufficientCreditsCard.tsx`, `NoCreditsResumePanel.tsx`, badge `noCredits`               | `job-failed` con código de la familia no entra al auto-retry ni al diálogo del modelo: `creditsIssue` en la tarea, tarjeta con saldo/recarga/reanudar (habilitado cuando alcanza). Biblioteca: badge «Sin créditos» → Progress → panel con lo pendiente.                                         |
| Voces, Música, editor de Library, muestras de estilo, preview de personajes                                    | Mismo patrón, liviano: costo del texto vs saldo del vendor; `MUSIC_MIN_CREDITS`; una imagen de la calidad elegida; N muestras en calidad base; saldo en cero para el preview (centavos, sin estimar).                                                                                            |

### Flujo de datos

1. Crear: el formulario cruza `estimateCreateCost(form)` con los saldos cacheados
   (`useCreateCostCheck`); con `blocking` el envío se frena como un paso faltante y
   aparece la alerta. Al enviar, `verify()` re-lee y frena si cambió.
2. Sidecar: el provider lanza `PipelineFailure('<dominio>_insufficient_credits')`;
   `images` aborta el resto; `run-video-pipeline` persiste `paused` +
   `insufficient-credits` + `errorCode` y el job cierra con `job-failed`.
3. UI: `handleEvent` guarda `creditsIssue` (sobrevive al reinicio: el disco quedó igual).
   La tarjeta lee el saldo de la cuenta que rechazó, estima lo pendiente desde
   `video-project-status` y habilita «Reanudar» cuando el saldo re-leído alcanza.
4. Biblioteca: `projectBadge` deriva `noCredits` de `pauseReason`; `LibraryProgress`
   monta `NoCreditsResumePanel` y reanuda con `startPipelineForProject` (cache-hit).

## Alternativas consideradas

- **`state: 'error'` + errorCode** — es lo que pasaba: manda al player, dispara el
  auto-retry y no distingue «recargá» de «algo se rompió». Descartada.
- **Créditos propios de Vimo ahora** — exige backend, descuento y recarga desde cero.
  Es la dirección (ADR-0032), no el paso de hoy; por eso la UI de saldo nació agnóstica
  del proveedor.
- **Estimar en el sidecar** — un proceso por consulta para una cuenta que ya está en
  la UI (precios en `videos/constants.ts`, factores en `voices/constants.ts`). Descartada.
- **Bloquear también con saldo ilegible** — habría frenado a todo el que usa Fal con
  clave no-admin. Se avisa en el badge y se deja arrancar.

## Consecuencias

- ✅ Un rechazo por saldo se ve como tal, no se reintenta en vano y no vuelve a cobrar
  lo hecho; la persona recarga y reanuda desde el último paso.
- ✅ Crear no arranca un job condenado cuando el saldo leído no alcanza.
- ⚠️ La estimación es aproximada (margen 1.1; escenas por guion antes del corte; BGM
  «~50–200» informativo). DeepInfra y Deepgram no exponen saldo: solo se detecta al fallar.
- ⚠️ El patrón del cuerpo (`INSUFFICIENT_CREDITS_BODY_PATTERN`) depende de los textos
  de cada proveedor; un cambio de wording degrada a `*_provider_error` (nunca a
  «clave inválida», porque el saldo se evalúa antes).
- 🔒 Un provider nuevo debe clasificar el saldo con el helper antes de 401/403 y nunca
  reintentar ese código; un módulo que gasta debe frenar con `compareCostLines` o una
  `CreditsShortfallLine` y ofrecer `openBillingPage`.

### Adenda 2026-09-19 — la sonda de cuenta y los fallos de cuenta terminales

El riesgo anotado arriba se cumplió peor de lo previsto. El saldo se evalúa antes que
el 401/403, pero con un TEXTO que el patrón no reconoce el rechazo sí caía en «clave
inválida» (`image_invalid_api_key`), y los carriles de imagen marcaban ese código
escena por escena y seguían. Corrían las 4 pasadas de recuperación y el job moría en
`images_incomplete`: celdas rojas y ningún aviso de recargar. Reporte real con
Evolink: clave válida, sin saldo.

- **La sonda de cuenta** (`pipeline/stages/images/account-probe.ts`) no depende del
  texto. Ante un 401/403, o ante un 4xx de Evolink en el primer intento de crear, le
  pregunta el saldo al proveedor una vez por corrida: `getEvolinkCredits` o
  `getFalCredits`, con la promesa compartida entre todas las escenas. Saldo leído en
  cero → `image_insufficient_credits`, que sigue el camino de siempre (pausa
  retomable y tarjeta de recarga). `EvolinkCredits.balanceReported` evita leer como
  cero una respuesta que no trae el campo.
- **Un 401/403 es de la cuenta, nunca de una escena:** corta la fase. Si la sonda
  también rechaza la clave, o es un 401 y el saldo no se pudo leer, el fallo es
  `image_invalid_api_key`. En el resto de los casos es el código nuevo
  `image_account_rejected` (`create.errors.imageAccountRejected`). Con Fal la sonda
  nunca concluye «clave inválida», porque su billing exige una key ADMIN.
- **Detección ampliada:** el patrón suma redacciones de gateway y los códigos de
  tarea `insufficient_quota`, `insufficient_user_quota` y
  `pre_consume_token_quota_failed`. Evolink lee el cuerpo también en el poll con
  401/403, en un 2xx sin id de tarea y en la subida de la referencia, y clasifica
  sobre 4.000 caracteres del cuerpo en vez de 300.

El cuerpo real de Evolink sin saldo sigue sin medirse. Las redacciones del patrón son
supuestos razonables; la red que no depende de ellas es la sonda.
Ver [causa, implementación y QA](../fixes/2026-09-19-fix-image-account-failures/image-account-failures.md).

## Verificación de cumplimiento

- **Guards:** `pnpm build` (tipos del contrato compartidos por `import type`:
  `pauseReason`, `ProviderCreditsStatus.unlimited`); `pnpm check:locales` (claves
  `common.credits.*`, `create.errors.*InsufficientCredits`, `library.list.badge.noCredits`
  y las de cada módulo en los tres catálogos); `pnpm lint`.
- **Manual:** con una cuenta vacía, `run-video-pipeline` deja en `project.json`
  `state: 'paused'`, `pauseReason: 'insufficient-credits'` y `errorCode`; en el log no
  hay pedidos de imagen tras el primer rechazo; Biblioteca muestra «Sin créditos» y
  «Reanudar» queda deshabilitado hasta que el saldo re-leído alcance.
- **Cómo se vería una regresión:** un 402 que vuelve a mostrarse como
  `imageProviderError` con cuenta regresiva de reintento; un proyecto con saldo
  agotado listado como «Error» y abierto en el player; Crear arrancando con saldo
  leído en cero. Y desde la adenda 2026-09-19: una generación que termina en
  `images_incomplete` con todas las celdas en rojo y el log lleno de
  `scene N image failed: image_invalid_api_key`; más de un pedido a `/v1/credits` por
  corrida; o pedidos de imagen que siguen saliendo después del primer 401/403.
- **Regresión automática:** `node --test scripts/test/check-image-account-failures.mjs`.

## Fuera de alcance

- Conversión de unidades entre proveedores y un saldo único: lo resuelve ADR-0032.
- Estimar el costo del LLM en dólares (el simulador de `promptCost.ts` sigue siendo
  informativo): DeepInfra no expone saldo contra el cual comparar.
