# ADR-0028 — Bloqueo temporal de los modelos de prompts que se traban o fallan

- **Estado:** Aceptada
- **Fecha:** 2026-09-10
- **Área:** app | pipeline
- **Completa a:** [ADR-0020](ADR-0020-selector-modelo-simulador-costos-personaje-gema.md), [ADR-0022](ADR-0022-modelo-de-prompts-como-preferencia.md)

## Problema

En los videos de «Mi estilo» el modelo LLM que la persona elige escribe los prompts
de imagen (carril verbatim, ADR-0019/0020). Cuando ese modelo se cuelga o el
proveedor devuelve errores, nadie se entera a tiempo:

- El cliente verbatim tiene un techo de **10 minutos por llamada**
  (`VERBATIM_TIMEOUT_MS` en `pipeline/providers/llm/verbatim-client.ts`); un modelo
  mudo deja la barra de prompts quieta todo ese rato.
- Los fallos de lote se tragan en `lastError` y entran a la escalera de reintento y a
  la ronda de rescate: el job puede tardar mucho antes de rendirse, y cuando lo hace
  el único código visible es el del último fallo.
- El mismo modelo se vuelve a ofrecer en el video siguiente, sin memoria de que
  acaba de fallar.

Restricciones:

- Solo aplica al carril verbatim: con un estilo de Vimo los prompts los escribe la
  casa con tiers fijos (`pipeline/config/pipeline-config.ts`) y no hay modelo elegible.
- El bloqueo es **local y transitorio** (una hora): no es una preferencia ni un dato
  del proyecto.
- Cambiar de modelo no puede tirar lo ya hecho: voz, transcripción y cortes son
  cache-hit y los prompts ya escritos se conservan.

## Decisión

Vigilar la fase `scene-prompts` del carril verbatim desde la interfaz, bloquear el
modelo elegido durante una hora cuando no avanza dos minutos o cuando el sidecar
reporta un fallo del proveedor, y ofrecer relanzar el mismo proyecto con otro modelo
sin salir de la pantalla de progreso.

Cómo se materializa:

| Pieza                                                                                 | Qué hace                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prompt-model-trouble` (`pipeline/runner/events.ts`)                                  | Evento tipado que emite `verbatim-writer.ts` vía `onModelTrouble` cuando un lote del modelo **elegido** agotó `withVerbatimRetry` con un código de `PROVIDER_TROUBLE_CODES`, o cuando sus escenas tercas pasan al rescate (`llm_rescue_needed`).         |
| `set-prompt-model` (`pipeline/commands/videos/set-prompt-model.ts`)                   | Reescribe `options.promptModel` en `project.json` de un proyecto con `customStyle`. No toca `scenes.json`: los prompts válidos se conservan y el modelo nuevo escribe solo los que faltan al relanzar.                                                   |
| `src/modules/common/utilities/promptModelBlocks.ts` + `hooks/usePromptModelBlocks.ts` | Store fuera de React en `localStorage` (`vimo:promptModelBlocks:v1`) con vencimiento; un timer purga al vencer el más próximo y avisa, así las tarjetas se rehabilitan solas.                                                                            |
| `CreateTask` (`src/modules/videos/types/create.ts`)                                   | Gana `usesCustomStyle`, `promptModel` (resuelto), `promptsStageActivity`, `promptModelIssue` y `promptModelSwitch`.                                                                                                                                      |
| `useCreateTask.ts`                                                                    | `handleEvent` marca el avance de la fase, bloquea ante `prompt-model-trouble` o un `job-failed` del proveedor en `scene-prompts`; `reportPromptModelIssue`, `snoozePromptModelIssue` y `switchPromptModel` (cancelar → esperar cierre → set → relanzar). |
| `PromptStageWatchdog.tsx`, `PromptModelIssueDialog.tsx`                               | El tick que detecta los 2 min sin avance (`PROMPT_STAGE_STALL_MS`) y el diálogo «Seguir esperando / Cambiar de modelo».                                                                                                                                  |
| `resolvePromptModel.ts`, `PromptModelCard.tsx`, `PromptModelSelector.tsx`             | Un id bloqueado cae al primero libre; la tarjeta bloqueada queda inerte con «vuelve en N min».                                                                                                                                                           |
| `StyleSourceTabs.tsx`, `formBlockers` (`formPayload.ts`)                              | Con **todos** los modelos bloqueados la pestaña «Mi estilo» se apaga y el envío se frena: quedan solo los estilos de Vimo.                                                                                                                               |

### Flujo de datos

1. `stage-started scene-prompts` abre `promptsStageActivity`; cada `scene-prompt-ready`
   o avance real de `scene-prompts-progress` actualiza `lastProgressAt`.
2. El watchdog compara `lastProgressAt` con el reloj cada segundo. A los 2 min sin
   avance: `blockPromptModel(modelId, 'stalled')` y `promptModelIssue` abre el diálogo.
   «Seguir esperando» lo silencia otros 2 min; el modelo queda bloqueado igual.
3. `prompt-model-trouble` (o un `job-failed` con código del proveedor durante la fase)
   bloquea con `'error'` y abre el mismo diálogo. El job sigue: el redactor tiene su
   escalera y puede terminar.
4. «Cambiar de modelo»: `switchPromptModel` cancela el job por stdin, espera su cierre
   (`job-failed cancelled`, con la misma red de seguridad que cancelar), llama a
   `set-prompt-model` y relanza `run-video-pipeline` sobre la **misma** tarea.

## Alternativas consideradas

- **Bloquear en `settings.json`** — ADR-0022 reserva el store nativo para
  preferencias; un bloqueo con vencimiento es estado transitorio, como la tarea en
  vuelo (`vimo:create:task:v1`). Y el store de la tarea escribe el bloqueo fuera de
  React: `localStorage` es síncrono y no necesita la instancia de `LazyStore` de
  `settings`.
- **Que el sidecar aborte el job al detectar la traba** — el sidecar no sabe cuánto
  está dispuesta a esperar la persona; un lote lento no siempre es un modelo muerto.
  La decisión es de la persona, así que la alerta vive en la interfaz y el job sigue.
- **Umbral de 2 minutos totales en la fase** — falsos positivos en videos largos que
  avanzan. Se mide **sin avance**: un video de 200 escenas que escribe no dispara
  nada; uno de 5 que no escribe, sí.
- **Cancelar y volver a la biblioteca** — obliga a cambiar el modelo en Ajustes y a
  reanudar a mano; relanzar en el acto conserva lo hecho y no abandona la pantalla.
- **Contar `llm_network` como fallo del modelo** — es la red de la persona, no el
  modelo; bloquearlo castigaría al modelo equivocado. `llm_output_truncated` tampoco:
  es determinista y la escalera lo cura con lotes más chicos.

## Consecuencias

- ✅ Un modelo trabado o con errores se ve a los 2 minutos, no a los 10; y no se
  vuelve a ofrecer hasta pasada una hora.
- ✅ Cambiar de modelo conserva voz, cortes y los prompts ya escritos.
  **Corregido el 2026-09-21:** esto era falso para el carril verbatim, que escribía
  `scenes.json` una sola vez al terminar la fase; el halt de acá abajo lo cancelaba antes y
  tiraba todos los prompts ya pagados, así que «Reintentar» y «Cambiar de modelo» los
  volvían a comprar enteros. Ahora se persisten lote a lote — ver
  [causa, implementación y QA](../fixes/2026-09-21-fix-verbatim-prompt-persistence/verbatim-prompt-persistence.md).
  Lo único que no sobrevive es el lote cuya respuesta llega DESPUÉS de la cancelación: en
  el editor, cancelar tiene que dejar la escena como estaba.
- ⚠️ `PROVIDER_TROUBLE_CODES` vive duplicado (pipeline y `videos/constants.ts`),
  como los otros espejos del repo. Si cambia en un lado, cambia en el otro.
- ⚠️ El bloqueo es por navegador/instalación: otra máquina no se entera.
- 🔒 El carril de la casa (`prompt-writer.ts`) no se toca ni emite el evento: sin
  modelo elegible no hay nada que bloquear.
- 🔒 `set-prompt-model` exige `customStyle` y nunca borra prompts.

## Verificación de cumplimiento

- **Guards:** `pnpm build` (tipos del evento y del payload compartidos por
  `import type`); `pnpm check:locales` (las claves nuevas en los tres catálogos).
- **Manual:** bajar `PROMPT_STAGE_STALL_MS` a 10 s, crear un video de Mi estilo con
  5 escenas → diálogo a los 10 s y `localStorage['vimo:promptModelBlocks:v1']` con
  el modelo; «Cambiar de modelo» → `project.json` con el modelo nuevo, fases 1-3
  intactas, `promptModelUsed` termina con el nuevo. Editar `blockedUntil` a
  `Date.now()+5000` → la tarjeta se rehabilita sola a los 5 s.
- **Cómo se vería una regresión:** la barra de prompts quieta más de 2 minutos sin
  diálogo; o una tarjeta bloqueada que sigue elegible; o un cambio de modelo que
  reescribe prompts que ya estaban.

## Modos de falla

- **Clave de DeepInfra rechazada (401/403).** No es culpa del modelo: los dos
  clientes LLM (`deepinfra.ts`, `verbatim-client.ts`) la traducen al código
  `llm_auth` (`pipeline/providers/llm/auth-failure.ts`), que **no** está en
  `PROVIDER_TROUBLE_CODES` (no bloquea a nadie), no se reintenta y **corta el job**
  desde cualquiera de los dos carriles y desde la biblia visual, en vez de caer al
  prompt de relleno. La UI lo muestra como «revisá tu clave en Claves API». Antes
  de esto (incidente 2026-09-11) una clave rechazada generaba videos enteros con el
  fallback determinístico y, con el bloqueo recién agregado, castigaba a cada modelo
  por turno.
- **Error del proveedor con el modelo elegido (5xx, timeout, vacío) o rescate
  necesario (`llm_rescue_needed`).** El job **se detiene** (`haltForPromptModelTrouble`
  en `useCreateTask.ts`: cancela por stdin, espera el cierre, deja la tarea en error
  con el diálogo abierto) y nada avanza hasta que la persona elija «Reintentar con el
  mismo modelo» o «Cambiar de modelo». Si el job siguiera solo, la Capa 4 de imágenes
  rellenaría las escenas sin prompt con un texto genérico que ignora la gema — que es
  exactamente lo que se vio el 2026-09-11 (imágenes «arbitrarias»). Un `job-failed`
  con código del proveedor durante la fase tampoco entra al reintento automático:
  abre la misma decisión. La traba de 2 minutos sí deja «seguir esperando»: ahí el
  modelo puede estar escribiendo.

## Fuera de alcance

- La ronda de rescate del sidecar (`rescueModelFor`) no consulta los bloqueos de la
  interfaz: elige por familia. Si un rescate cae en un modelo bloqueado, el evento
  lo vuelve a bloquear y no pasa nada peor.
- El editor (`regenerate-scene-images`) reusa la fase sin watchdog: son lotes
  chicos y la persona está mirando.

## Referencias

- ADR-0019 (carril verbatim), ADR-0020 (selector de modelo), ADR-0022 (modelo como
  preferencia), ADR-0013 (eventos tipados).
