# ADR-0025 — Troceo universal de TTS por motor y tope total de 90 000 caracteres

- **Estado:** Aceptada
- **Fecha:** 2026-09-09
- **Área:** providers / pipeline / app

## Problema

Los guiones de Crear subieron a 90 000 caracteres (`NARRATION_CHAR_LIMIT`,
2026-09-07), pero la síntesis de voz seguía pensada para 4500 por llamada:

- El probador de voz (`pipeline/commands/voices/generate-voice.ts`) rechazaba más de
  4500 con `voice_text_too_long`.
- El carril «ElevenLabs vía DubVoice» **no troceaba** (`chunksLongText: false`): en
  Crear mandaba los 90 000 en un solo POST. DubVoice admite 100 000 por job, pero era un
  job enorme, lento, y si fallaba a mitad no había nada que reusar.
- ElevenLabs directo troceaba en 4500 aunque su API acepta 10 000 (Multilingual v2),
  5 000 (Eleven v3) y 40 000 (Flash/Turbo v2.5) por request
  ([elevenlabs.io/docs/overview/models](https://elevenlabs.io/docs/overview/models)).
- Minimax troceaba solo en narración; Edge no troceaba en ningún lado. El tope por
  llamada era además un `number` fijo por motor, sin lugar para el modelo.

Restricciones:

- DubVoice cobra 1 crédito por carácter y limita a 5 jobs paralelos y 20 submits por
  minuto; su `context_chaining` (continuidad entre partes) cobra +50 %.
- El dueño pidió (2026-09-09) partes de ~25 000 en DubVoice, tope de 90 000 en los
  cuatro motores y un aviso en la UI desde 10 000 caracteres.

## Decisión

**Todo motor trocea el texto a su propio tope por llamada y concatena las partes; el
tope total es uno solo, 90 000, espejado UI↔sidecar.**

- `pipeline/providers/tts/text-limits.ts` — `TTS_TEXT_CHAR_LIMIT = 90_000`, la única
  fuente del tope total. Lo importan `create-video-project.ts` (guion) y
  `generate-voice.ts` (probador). La UI lo espeja como `NARRATION_CHAR_LIMIT` /
  `VOICE_TEXT_LIMIT` en `src/modules/voices/constants.ts`.
- `TtsProvider.chunkCharLimit(payload)` (`pipeline/providers/tts/provider.ts`)
  reemplaza a `requestCharLimit` + `chunksLongText`. El tope por trozo de cada motor
  (y, en ElevenLabs directo, de cada modelo) queda ~5 % por debajo del tope que publica
  el proveedor, porque el texto llega con los números ya expandidos a palabras:

### Topes por trozo

| Motor                                         | Vendor y endpoint                             | Tope publicado por llamada | Trozo en Vimo | Constante                                                |
| --------------------------------------------- | --------------------------------------------- | -------------------------: | ------------: | -------------------------------------------------------- |
| ElevenLabs vía DubVoice                       | DubVoice, `POST /api/v1/tts` (asíncrono)      |                    100 000 |        25 000 | `DUBVOICE_CATALOG_CHUNK_CHARS` (`dubvoice-catalog.ts`)   |
| Vbee vía DubVoice                             | ídem                                          |                    100 000 |        25 000 | ídem                                                     |
| Fish Audio vía DubVoice                       | ídem                                          |                    100 000 |        25 000 | ídem                                                     |
| Minimax vía DubVoice                          | DubVoice, `POST /api/minimax-tts` (síncrono)  |                      5 000 |         4 500 | `MINIMAX_CHUNK_CHARS` (`minimax.ts`)                     |
| Edge vía DubVoice                             | DubVoice, `POST /api/edge-tts` (síncrono)     |             no documentado |         4 500 | `EDGE_CHUNK_CHARS` (`edge.ts`)                           |
| ElevenLabs directo · `eleven_multilingual_v2` | ElevenLabs, `POST /v1/text-to-speech/{voice}` |                     10 000 |         9 500 | `ELEVENLABS_DIRECT_CHUNK_CHARS` (`elevenlabs-direct.ts`) |
| ElevenLabs directo · `eleven_v3`              | ídem                                          |                      5 000 |         4 500 | ídem                                                     |
| ElevenLabs directo · `eleven_turbo_v2_5`      | ídem                                          |                     40 000 |        38 000 | ídem                                                     |
| ElevenLabs directo · `eleven_flash_v2_5`      | ídem                                          |                     40 000 |        38 000 | ídem                                                     |
| ElevenLabs directo · modelo desconocido       | ídem                                          |                          — |         4 500 | `ELEVENLABS_DIRECT_DEFAULT_CHUNK_CHARS`                  |

Los 25 000 de DubVoice no son el tope técnico (admite 100 000 por job) sino el
tamaño que pidió el dueño (2026-09-09): acota lo que se pierde si un job falla y
permite reusar las partes ya pagadas al reintentar. Cambiar un trozo es tocar solo
su constante; el tope TOTAL (90 000) no se mueve de `text-limits.ts`.

- `pipeline/providers/tts/chunked-synthesis.ts` — `synthesizeInParts()`: el troceo por
  oraciones, el guard anti-doble-gasto, el manifest de hashes con reuso de partes ya
  pagadas, la concatenación re-encodeada con ffmpeg (ADR-0013) y el progreso
  agregado con «parte N de M». Lo usan la stage de narración
  (`pipeline/stages/voice/narration.ts`) y el command `generate-voice`.
- Partes **secuenciales**: respetan los límites de DubVoice y mantienen ordenado el
  manifest de reuso.
- Continuidad entre partes solo en ElevenLabs directo, con `previous_text` /
  `next_text` (300 caracteres del trozo vecino; gratis). `SynthesizeInput` gana
  `previousText` / `nextText`; los demás motores los ignoran.
- Progreso: `VoiceProgressEvent` y `VoiceProgressDetail` ganan `partIndex` /
  `partTotal`; `percent` pasa a ser el agregado de las partes. La UI apaga su curva
  sintética cuando hay partes (`voiceProgressPercent.ts`) y muestra «Parte N de M».
- Aviso «puede tardar» desde `LONG_TEXT_WARNING_THRESHOLD = 10_000`
  (`src/modules/common/constants.ts`) con `LongTextNotice` en Voces y Crear.

## Alternativas consideradas

- **Un solo tamaño de trozo para ambos carriles ElevenLabs** (como hasta ahora, 4500)
  — mantenía el reuso de partes al caer al fallback, pero obligaba a DubVoice a 20
  llamadas por guion largo y desaprovechaba los 40 000 de Flash. Descartada.
- **`context_chaining` de DubVoice** para la continuidad — cobra +50 % de créditos en
  todo el guion. Descartado; ElevenLabs directo tiene el equivalente gratis.
- **Partes en paralelo (hasta 3 en DubVoice)** — acortaría el tiempo total, pero
  complica el reuso ordenado y roza el límite de submits por minuto. Descartada por
  ahora; reconsiderar si el tiempo de un guion de 90 000 resulta inaceptable.
- **Mandar los 90 000 en un solo job a DubVoice** (lo que pasaba de hecho) — sin reuso
  ante un fallo, timeout de polling en el límite. Descartado.

## Consecuencias

- ✅ Probador y Crear aceptan 90 000 caracteres con los seis motores.
- ✅ Menos llamadas en ElevenLabs directo (Flash: 3 partes para 90 000) y partes
  acotadas en DubVoice (4 partes) con reuso entre reintentos.
- ⚠️ Si un carril falla y entra el fallback, las partes ya pagadas **no** se reusan:
  cada carril trocea a otro tamaño y los hashes no coinciden (supersede el punto de
  ADR-0024 sobre reuso entre carriles).
- ⚠️ En el probador el reuso nunca aplica (cada corrida tiene id nuevo de historial).
- ⚠️ El heurístico de progreso para motores sin avance real (25 ms/char, cap 95 %)
  se reinicia por parte: una parte de 4500 en Minimax tarda menos que lo que la barra
  sugiere.
- 🔒 Ningún motor declara `requestCharLimit` ni `chunksLongText`: el tope por llamada
  es siempre `chunkCharLimit(payload)`, y el total siempre `TTS_TEXT_CHAR_LIMIT`.
- 🔒 Ningún command ni stage trocea ni concatena por su cuenta: todo pasa por
  `synthesizeInParts`.

## Verificación de cumplimiento

- **Tests:** no hay framework de tests en el repo (ver CLAUDE.md).
- **Guards:** `pnpm build` (`tsc -b`) exige `chunkCharLimit` en cada `TtsProvider`;
  `pnpm check:locales` exige las mismas claves en `es/en/pt`.
  `grep -rn "requestCharLimit\|chunksLongText" pipeline src` debe devolver vacío;
  `grep -rn "libmp3lame" pipeline` debe devolver solo `chunked-synthesis.ts` y
  `commands/videos/audio-file.ts`.
- **Manual (harness, `pnpm pipeline:harness generate-voice` con ~30 000 chars):**
  ElevenLabs vía DubVoice → log «split into 2 parts», un solo `audio.mp3` sin
  `.part_*` ni `.parts.json`; ElevenLabs directo con `eleven_multilingual_v2` → 4
  partes con `previous_text`/`next_text` en el body, con `eleven_flash_v2_5` → 1;
  Minimax y Edge → 7 partes; cancelar a mitad → `cancelled` y la carpeta de historial
  no queda; 90 001 chars → `voice_text_too_long`.
- **Manual (app):** probador con 12 000 chars → aviso, contador `12000 / 90000`, barra
  «Parte 1 de N»; Crear con TTS → mismo aviso bajo el guion (no con audio propio) y
  hint «Parte N de M» en Generando voz; reintentar una narración que falló a mitad →
  sin nuevos submits para las partes ya pagadas.
- **Cómo se vería una regresión:** `voice_text_too_long` con menos de 90 000 chars;
  un POST a DubVoice con más de 25 000 chars; un `.part_0.mp3` huérfano junto a un
  `audio.mp3` completo.

## Referencias

- ADR-0010 (contrato de eventos, `binaryPaths`), ADR-0013 (troceo + concat
  re-encodeada del render), ADR-0024 (dos proveedores de voces; esta ADR supersede su
  punto sobre reuso de partes entre carriles).
- Doc de DubVoice (`POST /api/v1/tts`, límites) y
  [elevenlabs.io/docs/overview/models](https://elevenlabs.io/docs/overview/models).
