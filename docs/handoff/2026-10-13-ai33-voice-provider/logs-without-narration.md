# ai33: el guion del usuario no viaja a los logs de diagnóstico

- **Fecha:** 2026-10-13
- **Contexto:** integración de ai33 como proveedor de voz
  ([ADR-0053](../../adr/ADR-0053-ai33-proveedor-de-voz-y-cambio-de-voz-tras-un-fallo.md)),
  rama `feat/add-ai33`.
- **Regla que se rompía:** [ADR-0038](../../adr/ADR-0038-logs-de-diagnostico-por-ejecucion-en-supabase.md).
  El log de diagnóstico nunca lleva guion, prompts ni rutas.
- **Estado:** corregido en `pipeline/providers/tts/ai33.ts` y cubierto por pruebas.
  El mismo patrón sigue sin revisar en DubVoice y ElevenLabs directo (ver
  [Pendiente](#pendiente)).

## Qué se encontró

Los fallos de ai33 llegan al log de diagnóstico por dos caminos:

- El evento `provider-failure` lleva `failure.message` en `detail`, cortado a 300
  caracteres (`pipeline/utils/provider-failure.ts`). Se emite en cada fallo
  de un carril de voz.
- El fallo final del job lleva el mensaje armado con los fallos de todos los
  carriles, cortado a 2000 caracteres (`src-tauri/src/diagnostics/redaction.rs`).

La primera versión de `ai33.ts` metía en ese mensaje contenido de ai33 sin filtrar,
en dos lugares:

1. **Tarea que termina en `error`.** El mensaje era
   `ai33 task failed: ${JSON.stringify(data)}`, con la respuesta entera de
   `GET /v1/task/{id}`. Según la documentación de ai33, esa respuesta trae `text`:
   los primeros 1000 caracteres del texto narrado. Es decir, parte del guion iba al
   log. Además, como `detail` se corta a 300 caracteres, el texto podía tapar el
   `error_message`, que es la única pista útil.
2. **Cuerpos de error HTTP.** Cinco mensajes copiaban
   `bodyText.slice(0, 200)` del cuerpo de la respuesta. Si ai33 responde al envío
   con un error de validación que repite la entrada (`invalid text: <guion>`), el
   guion llega al log. No está verificado que ai33 haga eso; se cerró igual porque
   no hace falta saberlo para que sea seguro.

## Qué se hizo

| Pieza                                        | Cambio                                                                                                                                                                              |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `taskSummary(data)` en `ai33.ts`             | Resume la tarea para el log **sin `text`**: `id`, `status`, `error_message`, `credit_cost`, `progress` y `metadata`. Lo usan la tarea en `error` y la tarea `done` sin `audio_url`. |
| Mensaje de tarea fallida                     | `ai33 task failed: <error_message> <resumen>`: la pista va primero para que sobreviva el corte a 300.                                                                               |
| `errorHint(bodyText, userText)` en `ai33.ts` | Hasta 200 caracteres del cuerpo, cortados donde aparecen los primeros 20 caracteres del texto narrado; desde ahí queda `[narration omitted]`.                                       |
| `Ai33FetchOptions.userText`                  | El envío de síntesis pasa el texto de la parte; `ai33Fetch` lo usa en todos sus mensajes de error. Los listados (voces, tareas, saldo) no lo pasan: no envían guion.                |

## Verificación

`node --test scripts/test/check-ai33-voice.mjs`: 11/11. Dos casos cubren esto:

- **"a failed ai33 task stops the narration without paying DubVoice":** la
  tarea en `error` devuelve `text` con la narración. La prueba comprueba que el
  `detail` del evento lleva `Text-to-speech failed` y no la narración.
- **"an error body that echoes the narration never carries it to the log":** el
  envío recibe un 400 `invalid text: <narración>`. La prueba comprueba que el
  `detail` dice `invalid text: [narration omitted]` y que no contiene el comienzo del
  guion.

También pasan `eslint` y `tsc -p tsconfig.pipeline.json`.

## Límites conocidos

- `errorHint` reconoce el eco por los primeros 20 caracteres del texto **de la
  parte**. Un eco que empiece en otro punto del texto, o uno reescrito por el
  proveedor (escapado, normalizado), no se detecta. Se aceptó porque el caso
  verosímil es un error que repite la entrada desde el principio.
- Con textos de menos de 20 caracteres no se busca eco. Solo pasa en el probador de
  voces con textos muy cortos.

## Pendiente

El mismo patrón existe en otros proveedores de voz y **no se tocó**: está fuera del
alcance de ai33, y cambiarlo altera mensajes que hoy se usan para diagnosticar
DubVoice.

- `pipeline/providers/tts/dubvoice-catalog.ts:256`: la tarea `failed` vuelca
  `JSON.stringify(data)`. Hay que confirmar si la respuesta de DubVoice
  (`GET /api/v1/tts?task_id=`) incluye el texto. Hoy los tipos no lo declaran
  (`DubvoiceTtsTaskResponse`), pero el volcado lleva cualquier campo que llegue.
- `pipeline/providers/tts/dubvoice.ts:88` y `:120`: `bodyText.slice(0, 200)` en
  los errores de saldo y genéricos, también en los envíos de síntesis.
- `pipeline/providers/tts/elevenlabs-direct.ts:83`: el mismo recorte del cuerpo.

Para cerrarlos sirve el mismo par de piezas: un resumen de la tarea con campos
elegidos y un recorte del eco del texto. Conviene agregar una prueba por proveedor,
como las dos de arriba.
