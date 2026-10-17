# ADR-0010 — Pipeline por stages como sidecar Node y migración por módulos

- **Estado:** Aceptada
- **Fecha:** 2026-08-14
- **Área:** pipeline
- **Completa a:** [ADR-0007](ADR-0007-invoke-reemplaza-al-servidor-local.md)
- **Enmendada:** 2026-10-15, pedido del dueño: todo job termina en `job-completed` o `job-failed`; si el
  proceso del sidecar muere sin emitirlo, Rust manda el `job-failed` que falta (ver «Enmienda 2026-10-15» al
  final). El resto sigue vigente.

## Problema

La ADR-0007 eliminó el servidor local y dejó dos preguntas abiertas explícitas: **cómo
ejecuta Rust el pipeline TypeScript** y **cómo viaja el progreso** hacia la UI. Además,
al analizar el código origen (`02-vimo/cursor-video`) quedó claro que empaquetarlo tal
cual sería heredar sus problemas:

- El orquestador real (`src/orchestrator/pipelineProyecto.ts`, 2.142 líneas) es un
  monolito: la secuencia de fases, sus helpers y la emisión de eventos viven en un solo
  archivo. Existe además un `pipeline.ts` legacy de CLI que confunde.
- La configuración es un `ConfigManager` 100 % estático que lee `process.env`, y el
  servidor viejo la parametrizaba **mutando el env por proyecto** con save/restore — no
  es seguro ante concurrencia.
- Nombres en español, tipos junto a la lógica y comentarios de changelog — todo lo
  contrario a las convenciones de este repo (código en inglés, `types/` separados).
- Código muerto confirmado: whisper local, providers Llama/ollama, `checkpoint.ts`,
  keep-awake, subtítulos.
- El progreso viaja como `console.log` parseado con el marcador `[[VIMO_ERR]]`, y el
  puente mantiene tipos espejo a mano.

Restricciones que achicaron el campo:

- El trabajo de video no sale de la máquina del usuario (promesa del producto).
- El pipeline depende de Node a fondo (`fs`, `spawn` de FFmpeg, streams): no puede
  correr en la webview, y un comando de Tauri es Rust — `invoke()` no ejecuta `.ts`.
- Quedan 5 pantallas sin migrar (create, library, characters, voices, ai music) que
  **no** usan el pipeline completo pero sí piezas de él (providers de LLM, imagen,
  TTS, música).
- Prioridad acordada: hacerlo bien aunque tarde más — extraer lo esencial, no copiar.

## Decisión

**El pipeline se reescribe de forma guiada — el origen es referencia de solo lectura —
en `pipeline/` (raíz del repo, fuera de `src/`), organizado por stages con contrato
uniforme, configuración inyectada y prompts como datos; se ejecuta como sidecar Node
con subcomandos, y las pantallas pendientes se migran de menor a mayor dificultad,
dejando Create + stages para el final.**

Materialización:

```
pipeline/
├─ main.ts                  # entrada del sidecar: subcomandos, lee job JSON, NDJSON out
├─ runner/                  # runner genérico + PipelineContext + tipos del contrato
├─ stages/                  # voice, transcription, scene-cuts, scene-prompts, images, render
├─ providers/               # llm/, transcription/, image/, tts/, music/ (strategy)
├─ prompts/                 # prompts de sistema como plantillas versionadas
├─ config/                  # PipelineConfig, ApiKeys, BinaryPaths + defaults
├─ types/                   # dominio: Scene, VideoProject, TranscriptWord…
└─ utils/                   # atomic-fs, numbers-to-words, media-duration, styles
```

- **Contrato de entrada (`PipelineJob`):** JSON que arma Rust con `projectDir`,
  `config`, `apiKeys` (del store de ajustes) y `binaryPaths` (FFmpeg/yt-dlp como
  `externalBin`). **Nada en `pipeline/` lee `process.env`.**
- **Contrato de salida (`PipelineEvent`):** una línea NDJSON por evento en stdout.
  Rust las parsea y re-emite con `app.emit`; la UI escucha con `listen()`. Mueren
  `[[VIMO_ERR]]` y los tipos espejo: los tipos del contrato viven en `pipeline/` y la
  app los consume solo con `import type`.
- **Stages:** cada fase implementa `Stage { id, skip?, run(ctx) }`; un runner recorre
  el registro declarativo y emite `stage-started`/`stage-completed` por sí solo.
  Agregar una fase = un archivo nuevo + una línea en el registro.
- **Cancelación:** `invoke("cancel_pipeline")` → Rust avisa al hijo (stdin/kill) →
  `AbortController` interno, que las stages ya respetan.
- **La Fase 0 (setup) desaparece:** existía para descargar whisper/FFmpeg; ahora los
  binarios viajan con Tauri y sus rutas llegan por el job.

### Forma

```
UI ── invoke("start_pipeline") ──> Rust ── spawn ──> sidecar vimo-pipeline
UI <── listen("pipeline://…")  ─── Rust <── NDJSON ─── (runner → stages → providers)
```

Mapa de extracción (origen `02-vimo/cursor-video/src/`, todo renombrado a inglés):

| Destino                   | Origen esencial                                                          |
| ------------------------- | ------------------------------------------------------------------------ |
| `stages/voice.ts`         | `generarVozMaestra` + BGM/overlay + música (Fase 1)                      |
| `stages/transcription.ts` | `transcribirAudio` → solo Deepgram (Fase 2)                              |
| `stages/scene-cuts.ts`    | `escenasPorTiempo`, `reconstruirNarracion` (Fase 3)                      |
| `stages/scene-prompts.ts` | `dirigirEscenas`, `garantizarPrompts`, biblia (Fase 4)                   |
| `stages/images.ts`        | `generarImagenes`, `recuperarEscenasSinImagen` (Fase 5)                  |
| `stages/render.ts`        | `ensamblarVideo`, `renderizarClipsPorEscena` (Fase 6)                    |
| subcomandos sueltos       | `renderizarSolo`, `exportarClipsParaEditar`, prompt/preview de personaje |

Los helpers internos del monolito se redistribuyen a la stage que los usa; lo
compartido de verdad (rutas del proyecto) va al `PipelineContext`.

### Orden de migración por módulos

Las pantallas comparten con el pipeline los **providers**, no las stages. Por eso el
sidecar nace primero, mínimo (providers + subcomandos), y gana capacidades módulo a
módulo; las stages llegan al final ya con los providers probados.

| #   | Paso                                                                                                  | Dificultad | Qué estrena                                                        |
| --- | ----------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------ |
| 1   | Fundación: `pipeline/` (contratos + types/utils + providers) + sidecar mínimo + comando Rust genérico | —          | La infraestructura de todo lo demás                                |
| 2   | AI Music                                                                                              | 2/5        | Primer job real (sugerir-prompt vía LLM), polling                  |
| 3   | Voices                                                                                                | 3/5        | Eventos de progreso, historial en disco, rate-limit                |
| 4   | Characters                                                                                            | 3/5        | Providers de imagen; jobs prompt/preview que Create reutiliza      |
| 5   | Library (solo lectura)                                                                                | 3/5        | Acceso a carpetas de proyecto, `convertFileSrc`; acciones disabled |
| 6   | Create video + stages                                                                                 | 5/5        | Runner completo, progreso en vivo, cancelación                     |
| 7   | Library (acciones)                                                                                    | 4/5        | Regenerar/exportar/re-render sobre las stages ya portadas          |

Cada módulo se migra completo (vistas React + su `api/` + comandos), cumpliendo la
cadena componente → hook → `api/` → invoke de este repo.

Decisiones diferidas a la implementación (se resuelven al llegar al paso que las
toca): si el fallback Groq del LLM se conserva, si yt-dlp sigue siendo la vía para
BGM/overlay, y si el evento de pausa `esperando-confirmacion-escenas` sobrevive en el
flujo nuevo de Create.

## Alternativas consideradas

- **Empaquetar el bundle actual tal cual y llamarlo desde Rust** — descartada: arrastra
  la config estática por env (insegura ante concurrencia), el monolito, el español y el
  código muerto. Era la opción rápida; se eligió pagar la reescritura una sola vez.
- **Reescribir el pipeline en Rust** — descartada _por ahora_: ~6.000 líneas de TS con
  lógica sutil (reintentos, cache, merge de regeneración selectiva). El contrato de
  stages deja la puerta abierta: una stage puede volverse nativa sin tocar las demás.
  Se reconsideraría si el runtime Node embebido diera problemas reales de peso o arranque.
- **Llamar a las APIs externas directo desde el frontend** (plugin HTTP de Tauri para
  TTS/música/LLM) — descartada: duplicaría providers, reintentos y rate-limiting en la
  webview, y partiría las capacidades de IA en dos lugares. Los providers viven una
  sola vez, en el sidecar.
- **Migrar Create primero** — descartada: bloquea todo detrás de lo más difícil. Los
  módulos chicos le pagan infraestructura al siguiente y estrenan el sidecar con jobs
  de bajo riesgo.

## Consecuencias

- ✅ Agregar una fase o editar un prompt de sistema deja de ser cirugía sobre un
  monolito: un archivo en `stages/` o `prompts/`.
- ✅ Config inyectada por job: se pueden correr jobs sin pisarse (el env mutable muere).
- ✅ Un único catálogo de eventos tipado compartido por `import type`: mueren
  `[[VIMO_ERR]]` y los tipos espejo del puente viejo.
- ✅ Hasta el paso 5 inclusive nada depende de Tauri: `pipeline/` es un paquete TS puro
  ejecutable por CLI contra proyectos generados por el Vimo original — validación por
  comparación de artefactos sin UI.
- ⚠️ Vuelve un segundo runtime empaquetado (Node), que la ADR-0007 había celebrado
  eliminar. Diferencia aceptada a sabiendas: es un **proceso por job, sin servidor HTTP,
  sin puerto ni ciclo de vida propio** — Rust lo lanza y lo mata.
- ⚠️ La reescritura guiada tarda más que copiar; es el costo elegido.
- 🔒 Nada en `pipeline/` lee `process.env` ni loguea por `console.log` (todo evento pasa
  por el emitter del runner).
- 🔒 Ningún código de `src/` llama a proveedores de IA por HTTP ni importa runtime de
  `pipeline/` — solo `import type` del contrato y comandos vía `api/`.

## Verificación de cumplimiento

- **Tests:** no hay framework aún (ver CLAUDE.md). La verificación de fidelidad del
  port es el harness del sidecar: `vimo-pipeline run --project <dir> --until <stage>`
  corrido contra una carpeta de proyecto generada por el Vimo original, comparando
  artefactos (`escenas.json`, audio, imágenes) stage por stage. Local, manual.
- **Guards (greps ejecutables):**
  - `grep -rn "process.env" pipeline/` → vacío.
  - `grep -rn "console.log" pipeline/` → vacío (fuera del emitter del runner).
  - `grep -rn "VIMO_ERR" pipeline/ src/` → vacío.
  - `grep -rn "whisper\|llama\|ollama" pipeline/` → vacío.
  - `import` de `pipeline/` en `src/` sin `type` → regresión.
- **Cómo se vería una regresión:** una stage nueva emitiendo `stage-started` a mano en
  vez de dejarlo al runner; un provider leyendo una API key del env; un hook de React
  llamando `fetch` a DeepInfra/Evolink; un tipo de evento redeclarado en `src/`.

## Fuera de alcance

- **Whisper local** (la transcripción queda solo con Deepgram), **providers
  Llama/ollama**, `checkpoint.ts`, keep-awake (si hace falta, será plugin/Rust),
  subtítulos y el `pipeline.ts` CLI legacy: no se portan; no es un olvido.
- **Cifrado del pipeline (`pipeline.enc`)**: muerto junto con los entitlements
  (ADR-0007); el sidecar compilado no distribuye TS legible.
- **Backend web del transporte dual** (ADR-0007): sigue solo documentado.

## Referencias

- ADR-0001 (separación interfaz/pipeline), ADR-0007 (invoke reemplaza al servidor;
  esta ADR responde sus dos preguntas abiertas), ADR-0009 (contrato de carpeta raíz
  de proyectos que consumen Library y las stages).
- Origen del port: `02-vimo/cursor-video/src/` (features y core vivos) y
  `02-vimo/cursor-video/app/servidor-local/rutas/` (referencia de endpoints por
  pantalla: `voces.ts` 1.487, `musica.ts` 590, `personajes.ts` 348, `proyectos.ts`
  3.373 líneas).

## Nota posterior 2026-10-02 — `src/` importa valores de `pipeline/` desde la animación

Desde el PR #91 (animación de escenas), unos 20 archivos de `src/` importan **valores** de
`pipeline/`: los bloques de escena, el planificador y constantes de video. Por ejemplo,
`src/modules/videos/utilities/animationClips.ts`. Es la regresión que describe esta ADR («`import`
de `pipeline/` en `src/` sin `type`»).

El build de producción los resuelve por los `paths` del tsconfig y empaqueta ese código en la app.
El servidor de dev no los resolvía, y `pnpm tauri dev` no cargaba la app. `vite.config.ts` suma el
alias `@pipeline` para que dev resuelva igual que el build
(`fixes/2026-10-02_dev-server-pipeline-imports.md`). El alias no agrega imports nuevos.

Pendiente de decisión del dueño:

- aceptar la excepción para el código **puro** compartido, sin E/S ni proveedores;
- o moverlo a un módulo compartido y volver a `import type`.

Mientras tanto, el guard de cumplimiento de arriba no se cumple.

## Enmienda 2026-10-15 — todo job termina con un evento terminal

Pedido del dueño del 2026-10-15. El contrato de salida de esta ADR da por hecho que el sidecar cierra cada job
con `job-completed` o `job-failed`, pero no decía qué pasa si su proceso muere antes de emitirlo: un crash, falta
de memoria, un kill del sistema o un binario roto. Rust, al recibir `CommandEvent::Terminated`, sacaba el job de
`RunningJobs` y guardaba el log de diagnóstico sin mandar nada por el `Channel`: `runPipelineJob` y todo
consumidor de `startPipelineJob` (Crear, la biblioteca, la puerta de la demo) esperaban para siempre, y la puerta
de la demo tuvo que sumar un vigilante de 5 minutos
([ADR-0061](ADR-0061-demo-v4-catalogo-animacion-avatar-y-pack-por-partes.md)). Lo mismo pasaba con el kill de
respaldo de la cancelación, cuando stdin ya no acepta el aviso.

- **Rust pone el cierre que falta.** El loop de eventos de `start_pipeline_job`
  (`src-tauri/src/pipeline/commands.rs`) anota si el sidecar ya emitió su evento terminal. Si el proceso termina
  sin haberlo emitido —o el stream de eventos se corta sin `Terminated`, cuando el plugin no pudo esperar al
  proceso—, Rust manda por el canal un `job-failed` con la forma de los del sidecar (`JobFailedEvent`):
  `{ type, code, message, jobId }`. Lo manda **antes** de soltar el job de `RunningJobs` y de guardar el log, como
  llega el evento terminal del sidecar antes de que su proceso salga. La decisión es una función pura,
  `closing_event`.
- **El código.** `sidecar_exited`, con el código de salida o la señal en `message` (diagnóstico, nunca texto de
  la UI: `sidecar exited without a terminal event (signal 9)`). Si se había pedido la cancelación, `cancelled`:
  `cancel_pipeline_job` marca `cancel_requested` (un `Arc<AtomicBool>` de `RunningJob` que el loop del job
  comparte) antes de escribir el aviso por stdin, así que cuenta tanto para el kill de respaldo como para un
  proceso que murió mientras abortaba. Se eligió esa marca explícita y no «la entrada ya no estaba en
  `RunningJobs`»: `kill_if_lingering` también la saca, y cualquier camino nuevo que la sacara pasaría a contar
  como cancelación sin que nadie lo decidiera.
- **Nunca dos eventos terminales.** Si el sidecar ya emitió el suyo, Rust no manda otro, aunque el proceso salga
  después con un código de error o lo mate `kill_if_lingering`. Rust sigue sin filtrar lo que el sidecar emite.
- **Lo que no cambia.** El log de diagnóstico (ADR-0038) no ve el evento sintético: un proceso que murió sin
  evento sigue registrado como `crashed`, con `process_crashed`, el código de salida y la señal, que es lo que
  soporte filtra. `kill_if_lingering` y la cancelación cooperativa siguen igual: Rust no mata para cancelar si
  stdin acepta el aviso. Si el stream se corta sin `Terminated`, soltar la entrada le cierra stdin al proceso y,
  si sigue vivo, aborta solo (`pipeline/main.ts`); no se lo mata.
- **La UI.** `sidecar_exited` tiene texto propio en Crear y en el editor (`create.errors.sidecarExited`, que
  `LIBRARY_ERROR_MESSAGE_KEYS` hereda) y en la puerta de la demo (`createDemo.errors.sidecarExited`); los módulos
  sin mapa (voces, música, personajes, avatares) muestran su error genérico. No entra en
  `RETRYABLE_ERROR_CODES`: un crash por falta de memoria o por un binario roto suele repetirse, y un reintento
  automático podría volver a pagar lo que el proveedor tenía en curso; la persona reanuda con el botón de
  siempre. En la puerta de la demo es un fallo que queda hasta «Reintentar» (no se olvida al salir, como los de
  la red), y el vigilante de 5 minutos queda como segunda red para un proceso colgado, que no avanza ni termina.
- **Verificación.** `pnpm test:tauri`: los tests de `closing_event` en `src-tauri/src/pipeline/tests/commands.rs`
  (la forma del evento, `sidecar_exited` contra `cancelled`, el código de salida o la señal en el mensaje, el
  stream sin `Terminated` y que nunca hay un segundo evento terminal); cada regla se vio fallar con un mutante.
  `node --test scripts/test/check-demo-gate.mjs`: `sidecar_exited` es un fallo que queda, sin espera ni
  relanzamiento, con su aviso. Informe:
  [el job sin evento final](../fixes/2026-10-15-fix-sidecar-terminated-event/sidecar-terminated-event.md).
- **Cómo se vería una regresión:** un job cuyo proceso muere deja la pantalla «generando» para siempre, o la
  puerta de la demo pasa a «La demo se sigue descargando…» cinco minutos después de un crash en vez de mostrar
  el fallo; una cancelación que terminó en el kill de respaldo aparece como error; o la UI recibe dos eventos
  terminales del mismo job.
