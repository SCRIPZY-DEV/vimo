# Avatar presentador con HeyGen (sub-proyecto 2 del editor con IA)

- **Fecha:** 2026-10-09
- **Rama:** `feat/edicion-avatar-ia` (sobre `dev` @ `2950ebb3`, después del sub-proyecto 1)
- **Estado:** diseño acordado en chat con el dueño el 2026-10-08 (camino A, «el camino A me gusta»;
  «de resto me gusta el plan completo» con cuatro ajustes, incorporados acá) y aprobado el 2026-10-09
  («perfecto me suena todo»). **Entrega 1 implementada en la rama el 2026-10-09** (plan en
  `plan-e1.md` (interno); cinco tareas con revisión por tarea, revisión final y una ola de arreglos;
  ledger, reportes y hoja de hechos en `execution/` (interno)); el dueño la probó en
  `0.9.3-editor.2` y pidió ajustes (2026-10-09 18:51 y 19:10). **Entrega 1b implementada en la rama
  el 2026-10-09/10** (plan en `plan-e1b.md` (interno): saldo de HeyGen, biblioteca por avatar con
  sus looks y look principal, stock en dos niveles como HeyGen, «Crear escenario» por prompt,
  diálogo de foto rediseñado; siete paquetes con revisión cada uno y una ola final de arreglos;
  evidencia en `execution-e1b/` (interno)); la sonda 3 de §17 (saldo) quedó respondida.
  Pendiente: QA del dueño en la app de prueba de la entrega 1b. Entregas 2 y 3 sin plan todavía.
- **ADR:** [ADR-0057](../../adr/ADR-0057-escenas-de-avatar-con-heygen-sobre-la-narracion.md).
- **Relacionadas:** ADR-0013 (confirmación de escenas), ADR-0014 (edición sobre stages), ADR-0033
  (personajes con foto), ADR-0041/0042/0047 (clips animados como bloque), ADR-0046 (recuperación de
  animaciones), ADR-0056 (editor a pantalla completa).
- **Investigación previa:** [library-research.md §7](../2026-10-07-ai-editor/library-research.md)
  (HeyGen: API, costos, términos) y la especificación OpenAPI de HeyGen verificada el 2026-10-08
  (`POST /v3/videos` tipo `avatar` acepta `audio_asset_id`, `background` de imagen, `fit`,
  `aspect_ratio`, `resolution`, `engine`, `output_format`).

Este documento es el contrato del plan de implementación. Si el plan necesita algo que lo contradice,
se cambia primero este documento, con el dueño.

---

## 1. Qué se quiere lograr

Un video de Vimo puede tener un **avatar presentador**: una persona generada por HeyGen que aparece
varias veces a lo largo del video hablando con **nuestra narración**, a pantalla completa y sobre un
**fondo fijo relacionado con el tema** («si hablamos de comida, que salga en una cocina»), como esos
videos donde alguien habla a cámara y las imágenes ilustran lo que dice. El usuario decide **cuántas
veces** aparece y **cuántos segundos** dura cada aparición; Vimo elige los momentos, genera cada
aparición y la pone en el video, en el visor y en el timeline.

Las palabras del dueño que gobiernan el diseño:

- **Continuidad.** «Las partes que va a reemplazar el clip del avatar son partes que son continuas,
  que deberían de seguir con la misma voz y hablar del mismo tema. Lo único que cambia es que no se
  muestra una imagen, sino el clip del avatar.» → la narración es el reloj y HeyGen solo pone la cara;
  cada aparición empieza y termina en frontera de frase.
- **Sin escenas debajo.** «Lo ideal es que no haya escenas por debajo del video del avatar, sería
  innecesario, para eso está el clip del avatar.» → la aparición **es una escena** del video (una
  «escena de avatar»), no un clip encima de otras escenas. No se pagan imágenes que nadie va a ver.
- **El usuario decide.** «Debe decidir fragmentos de cuántos segundos quiere que salga el clip del
  avatar en varias partes del video… según la cantidad de veces que quiere el usuario que salga durante
  todo el video y en cada aparición cuántos segundos.» → dos números en Crear: apariciones y segundos
  por aparición. Como HeyGen cobra por minuto, el costo se estima exacto.
- **Fondo fijo por aparición**, en el estilo visual del proyecto, sin personajes, con espacio para el
  avatar.
- **Moderación.** «Se debe indicar que no se pueden clonar famosos o personas conocidas.»
- **Diseño del bloque** como el clip de VidRush: esquinas redondeadas, borde blanco al seleccionar,
  asas tipo píldora en los extremos, ficha del tipo a la izquierda; el avatar en **morado**, el clip
  animado conserva el celeste y recibe el mismo diseño.

Fuera de este sub-proyecto: mover y recortar el avatar en círculo, los movimientos dinámicos y las
transiciones (sub-proyecto 3, con el video de referencia del dueño); el gemelo digital desde video y
los avatares desde texto; el agente.

## 2. Qué no cambia

- El pipeline sigue siendo voz → transcripción → cortes → prompts → imágenes → animación → render.
  Se agrega **una** fase, `avatar`, entre imágenes y animación (§8). Nada cambia para un proyecto sin
  avatar: los archivos, los cortes y el render son byte-idénticos.
- Las escenas siguen siendo contiguas de 0 al final del audio, con una imagen por escena y los
  mismos campos. Una escena de avatar es una escena más, con un campo aditivo `avatar` (§3).
- Los clips animados de Kie (ADR-0042) no se tocan: ni su planificador, ni su carril, ni sus
  recibos. Solo aprenden a **no animar** una escena de avatar (§7.4).
- El audio del video final es la narración de siempre más la música: el audio que devuelve HeyGen se
  descarta en la normalización (§7.3). El filtro de color, los subtítulos y el overlay se aplican
  también sobre el avatar, como sobre cualquier escena.
- Las claves siguen en el llavero por usuario (ADR-0011/0023). HeyGen se usa con la clave de cada
  usuario y Vimo como intermediario; el acuerdo con HeyGen queda para cuando el producto crezca
  (decisión del dueño del 2026-10-07).
- El editor conserva el modelo de pistas del sub-proyecto 1: el avatar vive en la **pista de
  escenas**, no hay cuarta pista.

## 3. Modelo: la escena de avatar

### 3.1 En `scenes.json`

`Scene` (`pipeline/types/scenes.ts`) gana un campo aditivo. Ausente = escena normal, como hasta hoy.

```ts
// pipeline/types/avatar.ts (browser-safe, como animation.ts)
export const AVATAR_ENGINES = ['avatar_iv', 'avatar_iii', 'avatar_v'] as const
export type AvatarEngine = (typeof AVATAR_ENGINES)[number]
export const AVATAR_LOOK_TYPES = [
  'studio_avatar',
  'digital_twin',
  'photo_avatar',
] as const
export type AvatarLookType = (typeof AVATAR_LOOK_TYPES)[number]

// Solo tres estados persistidos y ninguno transitorio (misma lección que
// SceneAnimationStatus): un job que muere no deja un «generando» en disco.
export type SceneAvatarStatus = 'planned' | 'ready' | 'failed'

export interface AvatarAttempt {
  // Huella del pedido: look + motor + formato + resolución + hash del audio
  // cortado + hash de la imagen de fondo + versión de la narración.
  hash: string
  state: 'creating' | 'pending' | 'succeeded' | 'failed' | 'ambiguous'
  engine: AvatarEngine
  lookId: string
  audioAssetId?: string
  backdropAssetId?: string
  videoId?: string
  videoUrl?: string
  failureCode?: string // el `failure_code` de HeyGen, tal cual
  errorCode?: string // nuestro avatar_* (§14)
  createdAt: string
}

export interface SceneAvatar {
  lookId: string
  lookName: string
  lookType: AvatarLookType
  engine: AvatarEngine
  origin: 'auto' | 'manual'
  status: SceneAvatarStatus
  // Nombre local validado del clip normalizado (nunca una ruta del webview).
  clipFile?: string
  normalizedSeconds?: number
  // Contra qué narración y qué tramo se renderizó: si cambian, el clip queda
  // desactualizado (derivado, §3.3).
  renderHash?: string
  narrationVersion?: number
  attempts?: AvatarAttempt[]
  // Estimación local: segundos × tarifa. HeyGen no devuelve el cobro.
  usdEstimated?: number
  errorCode?: string
}

// Lo que el corte siembra en una escena de avatar antes de generar nada.
export type SceneAvatarSeed = Pick<
  SceneAvatar,
  'lookId' | 'lookName' | 'lookType' | 'engine' | 'origin'
>
```

La escena de avatar **es** el tramo: `startSeconds`/`endSeconds` de la escena son los del avatar, su
`text` son las frases que dice, su imagen `scenes/scene_<id>.jpg` es el **fondo** (la generan las
fases de prompts e imágenes de siempre, §6) y su clip vive en `avatar/`.

### 3.2 Archivos del proyecto

```
<proyecto>/
  avatar/
    look.jpg                          vista previa del avatar elegido (copia de la biblioteca)
    scene_<id>.<hash8>.wav            el pedazo de narración que habla (se reusa por hash)
    scene_<id>.<hash8>.raw.mp4        lo que devolvió HeyGen
    scene_<id>.<hash8>.mp4            normalizado al cuadro del render (= clipFile)
```

`ProjectPaths` suma `avatarDir`; `pipeline/avatar/clip-path.ts` valida los nombres igual que
`pipeline/animation/clip-path.ts`. Los archivos viejos no se borran al regenerar (pago hecho,
recuperable); una limpieza de huérfanos queda fuera de alcance.

### 3.3 Vista para la UI y estados derivados

`SceneSummary` gana `avatar?: SceneAvatarView` (sin `attempts`, con `clipPath` absoluto y
`clipMtimeMs` como los clips) y `VideoProjectMetadata` gana `narrationVersion?: number` (ausente = 0;
lo incrementa `replace-narration`, §11.4). Estados que ve la UI:

| Estado visible     | Cuándo                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------ |
| planeado           | `status: 'planned'` sin clip (recién cortado, o a la espera de confirmar el costo)         |
| generando          | hay evento `avatar-scene-started` sin `ready`/`failed` en esta corrida (memoria, no disco) |
| listo              | `status: 'ready'` y el clip existe en disco                                                |
| fallido            | `status: 'failed'` (o `ready` sin archivo: se muestra como fallido, como los clips)        |
| **desactualizado** | `ready` pero `narrationVersion` ≠ el del proyecto, o `renderHash` no coincide con el tramo |

`stale` es siempre derivado al leer (`toSceneSummary`), nunca persistido.

### 3.4 Opciones del proyecto

```ts
// en VideoProjectOptions (pipeline/types/video-project.ts), validado en create-video-project
avatar?: {
  lookId: string
  lookName: string
  lookType: AvatarLookType
  engine: AvatarEngine
  appearances: number // 1..10
  secondsPerAppearance: number // 7..60
  startWithAvatar: boolean // la primera aparición abre el video
  placement: 'auto' | 'manual' // manual = sin cortes al crear; se agregan desde el editor (entrega 3)
}
```

**Motor fijo (decisión del dueño del 2026-10-09):** por ahora Vimo usa solo `avatar_iii`
(`AVATAR_DEFAULT_ENGINE` en `pipeline/types/avatar.ts`). Al agregar un avatar y al elegir su
principal, la biblioteca solo acepta un look listo que lo soporte (§12.2); un refresco conserva el
principal mientras HeyGen no confirme que desapareció y, si desaparece y no queda ninguno compatible,
puede dejar uno listo que no lo soporta. La interfaz muestra únicamente esa etiqueta, o «No compatible
con Vimo» si falta; la entrega 2 mira `supportedEngines` del principal, nunca deduce la compatibilidad
de `status: 'ready'`. El `engine` de estas opciones sale de esa constante mientras la decisión siga en
pie, no de un selector.

Constantes en `pipeline/types/avatar.ts` (espejadas en `src/modules/videos/constants.ts` solo donde
la UI las necesita):

| Constante                            | Valor        | Para qué                                                     |
| ------------------------------------ | ------------ | ------------------------------------------------------------ |
| `AVATAR_MIN_APPEARANCE_SECONDS`      | 7            | Mínimo por aparición (decisión del dueño del 2026-10-07)     |
| `AVATAR_MAX_APPEARANCE_SECONDS`      | 60           | Máximo por aparición                                         |
| `AVATAR_DEFAULT_APPEARANCE_SECONDS`  | 10           | Valor inicial del formulario                                 |
| `AVATAR_MIN_APPEARANCES`             | 1            |                                                              |
| `AVATAR_MAX_APPEARANCES`             | 10           |                                                              |
| `AVATAR_DEFAULT_APPEARANCES`         | 3            |                                                              |
| `AVATAR_MIN_GAP_SECONDS`             | 10           | Mínimo de imágenes entre dos apariciones                     |
| `SENTENCE_PAUSE_SECONDS`             | 0.35         | Pausa que cierra una frase sin puntuación                    |
| `MAX_SENTENCE_SECONDS`               | 15           | Una frase más larga se parte en su pausa mayor               |
| `AVATAR_RENDER_CONCURRENCY`          | 3            | Renders de HeyGen a la vez (su tope es 10)                   |
| `AVATAR_POLL_INITIAL_MS` / `_MAX_MS` | 5000 / 20000 | Espera creciente al consultar el estado                      |
| `AVATAR_RENDER_DEADLINE_MS`          | 30 min       | HeyGen dice 1–5 min; su centro de ayuda, hasta 10 por minuto |
| `AVATAR_PREVIEW_RESYNC_SECONDS`      | 0.12         | Reajuste del visor sobre un clip de avatar (labios)          |

Tarifas (USD por minuto, página de precios de HeyGen del 2026-09-16; `null` = el motor no aplica a
ese tipo y no se ofrece):

| Motor        | `digital_twin` | `studio_avatar` | `photo_avatar` |
| ------------ | -------------- | --------------- | -------------- |
| `avatar_iii` | 0,60           | 0,99            | 0,99           |
| `avatar_iv`  | 4,83           | 4,83            | 2,31           |
| `avatar_v`   | 7,20           | null            | null           |

Crear un avatar desde una foto: 1,32 USD (si un entrenamiento que termina `failed` se cobra o no es
la sonda 4 de §17; la interfaz no promete reembolso). Los renders fallidos no se cobran. La tabla vive en
`AVATAR_USD_PER_MINUTE` y es la única fuente del estimador; si HeyGen cambia precios, se cambia ahí.

## 4. Frases: la unidad de continuidad

`pipeline/narration/sentences.ts` (puro, browser-safe, lo usan el sidecar y el editor):

```ts
export interface NarrationSentence {
  index: number
  text: string
  startSeconds: number // contiguas: la pausa pertenece a la frase anterior
  endSeconds: number
  wordFrom: number // índices en words.json
  wordTo: number
}
export function detectSentences(
  words: TranscriptWord[],
  audioEndSeconds: number,
): NarrationSentence[]
```

1. **Con puntuación.** Si alguna palabra trae `sentenceEnd: true`, las fronteras son esas palabras.
   Para tenerlo, la transcripción pide `punctuate=true` a Deepgram (gratis) y marca `sentenceEnd`
   cuando `punctuated_word` termina en `. ? ! …`; el campo `word` sigue limpio, así que `words.json`
   solo gana un booleano opcional y ningún consumidor cambia (`TranscriptWord.sentenceEnd?: true`).
2. **Sin puntuación** (proyectos anteriores): una pausa ≥ `SENTENCE_PAUSE_SECONDS` entre dos
   palabras cierra la frase.
3. En los dos modos, una frase más larga que `MAX_SENTENCE_SECONDS` se parte en su pausa interna más
   larga, recursivamente, para que el planificador tenga grano.
4. La primera frase empieza en 0 y la última termina en el fin del audio; la frontera entre dos frases
   es el inicio de la primera palabra de la siguiente. Los tiempos se cuantizan a 25 fps al cortar.

## 5. El planificador de apariciones

`pipeline/avatar/planner.ts` (puro):

```ts
export interface AvatarPlanOptions {
  appearances: number
  secondsPerAppearance: number
  startWithAvatar: boolean
}
export interface AvatarSpan {
  startSeconds: number
  endSeconds: number
  sentenceFrom: number
  sentenceTo: number
}
export interface AvatarPlan {
  spans: AvatarSpan[]
  dropped: number // apariciones que no cupieron
}
export function planAvatarSpans(
  sentences: NarrationSentence[],
  options: AvatarPlanOptions,
): AvatarPlan
```

- **Ajuste a frases (`fit`).** Desde una frase de inicio, suma frases enteras mientras acercarse a
  `secondsPerAppearance` mejore: incluye la siguiente solo si |largo − objetivo| baja. Nunca menos de
  `AVATAR_MIN_APPEARANCE_SECONDS` (sigue sumando) ni más de `AVATAR_MAX_APPEARANCE_SECONDS`. Si el
  audio se acaba antes de llegar al mínimo, esa aparición no cabe.
- **Primera aparición.** Con `startWithAvatar`, `fit` desde la frase 0: el video abre con el avatar.
- **Las demás.** Se reparten parejo: la zona libre va desde el fin de la anterior más
  `AVATAR_MIN_GAP_SECONDS` hasta el fin del audio; para M apariciones restantes, el ancla k es el
  centro del tramo k de M tramos iguales; la aparición empieza en la frase cuyo inicio está más cerca
  de `ancla − objetivo/2`, nunca antes del fin de la anterior más el hueco mínimo; `fit` desde ahí.
- Determinista: mismas frases y opciones, mismo plan. Los que no caben se cuentan en `dropped` y se
  informan (evento `avatar-planned`), no fallan.

El costo real queda a unos segundos del estimado (frases enteras); la fase lo vuelve a comparar con
el saldo antes de pagar (§8).

## 6. Cortes con pines y fondos por aparición

### 6.1 Cortes

La fase `scene-cuts` planifica el avatar **antes** de cortar: lee `options.avatar` (con
`placement: 'auto'`), detecta frases, llama al planificador y corta el resto **alrededor** de esos
tramos:

```ts
// pipeline/stages/scene-cuts/pins.ts
export interface PinnedSpan extends AvatarSpan {
  avatar: SceneAvatarSeed
} // look, motor, origin: 'auto'
export function cutScenesAroundPins(
  words: TranscriptWord[],
  audioEndSeconds: number,
  pins: PinnedSpan[],
  cutFree: (startSeconds: number, endSeconds: number) => number[], // fronteras internas del tramo libre
): Scene[]
```

- Cada pin produce una escena con `avatar: { ...seed, status: 'planned' }`, texto por palabras (punto
  medio, como `cutScenesAtBoundaries`), ids `1..n` en orden de tiempo.
- Cada tramo libre lo corta el carril de siempre, acotado al tramo: en el carril de segundos,
  `sceneBoundariesBySeconds` sobre el largo del tramo; en el carril clásico por cantidad, la cantidad
  confirmada menos los pines se reparte entre los tramos libres proporcional a su duración (mínimo una
  por tramo); con prefijo animado de Kie, `planPrefixSceneWindows` se aplica a los tramos libres en
  orden con el presupuesto de minutos restante (el prefijo animado nunca pisa al avatar).
- Un tramo libre menor a `MIN_SECONDS_PER_SCENE` (3 s) se absorbe en la escena de avatar vecina (la
  que le sigue; si no hay, la anterior): mejor que el avatar hable tres segundos más a que haya una
  imagen de dos segundos.
- La caché del corte se conserva: si el corte previo es reutilizable, se mantienen las escenas
  previas con sus recibos (`scenes = reusable ? previous : fresh`, como hoy).

**Confirmación de escenas (ADR-0013).** `suggestedScenes` cuenta todas las escenas, avatar incluido.
El evento `awaiting-scene-confirmation` suma `avatarSpans: [{ startSeconds, endSeconds }]` y el
diálogo muestra una línea: «El avatar aparece 3 veces (0:00–0:11, 1:02–1:13, 2:10–2:19)». Cambiar la
cantidad o los segundos en el diálogo solo reparte las escenas libres; los pines no se mueven.

### 6.2 Fondos: el prompt y la imagen de la escena de avatar

El fondo es la **imagen de la escena**, escrita y generada por las fases de prompts e imágenes de
siempre, con una sola diferencia: el **pedido** de una escena de avatar es el de un decorado.

- En los dos carriles (casa con director y verbatim/catálogo), una escena con `avatar` no pasa por el
  director ni por el clasificador de presencia ni por el revisor narrativo: `charactersPresent` queda
  vacío y el redactor recibe `AVATAR_BACKDROP_REQUEST` (`pipeline/prompts/avatar-backdrop.ts`): «el
  lugar que sugiere este tramo de la narración, en el estilo del proyecto, plano general, **sin
  personas, personajes, animales, caras, texto ni logos**, con la zona central despejada para un
  presentador». Las frases fijas de la gema (`applyFixedPhrases`) se aplican igual.
- Si el redactor falla, el fondo cae al prompt determinístico de `fallback-prompt.ts` con una
  variante de decorado (mismo texto de reglas, sin personajes). Nunca queda una escena de avatar sin
  prompt.
- La fase de imágenes no cambia: genera `scene_<id>.jpg` con el proveedor, la calidad y el formato
  del proyecto. Cuesta lo que una imagen más. Las pasadas de recuperación por contenido rechazado
  aplican igual.
- Regenerar la imagen de una escena de avatar desde el editor regenera el fondo, y el clip pasa a
  desactualizado (el `renderHash` incluye el hash de la imagen): el panel ofrece regenerar el avatar
  con su costo.

## 7. HeyGen: proveedor y carril

### 7.1 Proveedor (`pipeline/providers/avatar/heygen.ts`)

Separado del contrato de video de Kie (`providers/video/types.ts` no sirve: no tiene audio ni avatar,
exige duración entera 4–12 y referencias de imagen). Base `https://api.heygen.com`, encabezado
`X-Api-Key`, JSON salvo la subida.

| Método                | Endpoint                                | Uso                                                    |
| --------------------- | --------------------------------------- | ------------------------------------------------------ |
| `me()`                | `GET /v3/users/me`                      | Validar la clave; saldo (`wallet`/`usage_based`, §17)  |
| `listGroups(filtros)` | `GET /v3/avatars`                       | Avatares (grupos de looks); paginado                   |
| `getGroup(id)`        | `GET /v3/avatars/{group_id}`            | Un avatar: nombre, portada, estado; 404 = no existe    |
| `listLooks(filtros)`  | `GET /v3/avatars/looks`                 | Stock y propios; paginado; `group_id`: de un avatar    |
| `getLook(id)`         | `GET /v3/avatars/looks/{look_id}`       | Un look que el listado del grupo no trajo              |
| `uploadAsset(path)`   | `POST /v3/assets` (multipart, ≤ 32 MB)  | Audio cortado, fondo, foto                             |
| `createVideo(body)`   | `POST /v3/videos` + `Idempotency-Key`   | Un render por aparición                                |
| `getVideo(id)`        | `GET /v3/videos/{video_id}`             | `pending/processing/completed/failed`, `video_url`     |
| `listVideos()`        | `GET /v3/videos`                        | Recuperar un pedido ambiguo por `title`                |
| `createPhotoAvatar()` | `POST /v3/avatars` `{ type: 'photo' }`  | Biblioteca (entrega 1)                                 |
| `createPromptLook()`  | `POST /v3/avatars` `{ type: 'prompt' }` | Un look nuevo desde un prompt (entrega 1b)             |
| `getBalance()`        | `GET /v3/users/me`                      | Saldo de la billetera para la vista Avatares; no lanza |

Cuerpo de `createVideo` (todo verificado contra la OpenAPI):
`type: 'avatar'`, `avatar_id`, `audio_asset_id`, `engine: { type }`,
`background: { type: 'image', asset_id }`, `aspect_ratio: '16:9' | '9:16'` (el formato del proyecto),
`resolution: '1080p'`, `output_format: 'mp4'`, `fit: 'contain'` en 16:9 (avatar entero con el fondo
visible a los lados; en 9:16 se omite y HeyGen llena el cuadro), `title: 'vimo:<projectId>:scene-<id>:<hash8>'`.
Sin webhooks (una app de escritorio no tiene URL pública): se consulta el estado.

Errores: HTTP 400/401/409/429 y el sobre `error.{code,message,param}`; `failure_code` cuando un video
termina `failed`. La tabla de mapeo está en §14.

### 7.2 Carril por escena (`pipeline/avatar/lane.ts`)

Pago una sola vez, como el carril de Kie (ADR-0042), pero con recibos propios en `scene.avatar`:

1. **Audio.** `ffmpeg -ss <inicio> -t <largo> -i narration.mp3 -ar 44100 -ac 1 -c:a pcm_s16le`
   → `avatar/scene_<id>.<hash8>.wav`; inicio y largo cuantizados a 25 fps. Se reusa si existe con el
   mismo hash (narración, tramo).
2. **Subidas.** Audio y fondo con `uploadAsset`; los `asset_id` se persisten en el intento. Un id de
   asset no vence: un reintento con el mismo hash no vuelve a subir.
3. **Pedido.** Se persiste `{ state: 'creating', hash, … }` **antes** del POST y
   `{ state: 'pending', videoId }` después. Sin respuesta → `ambiguous`: la próxima corrida busca el
   `title` en `listVideos()` y adopta el video si existe; si no, repite el POST con la **misma**
   `Idempotency-Key` (HeyGen deduplica 24 h). Un intento `creating`/`ambiguous` bloquea cualquier POST
   nuevo hasta resolverse.
4. **Espera.** `getVideo` cada `AVATAR_POLL_INITIAL_MS`, creciendo ×1,5 hasta `AVATAR_POLL_MAX_MS`;
   `AVATAR_RENDER_CONCURRENCY` a la vez; plazo `AVATAR_RENDER_DEADLINE_MS` → `avatar_timeout` (el
   recibo queda `pending`: se cosecha en la próxima corrida, no se vuelve a pagar).
5. **Descarga** con el `video_url` (vence: se persiste y se vuelve a pedir si venció) a
   `scene_<id>.<hash8>.raw.mp4`, reusando `saveClipToFile` (200 MB, magic bytes mp4).
6. **Normalización** a `scene_<id>.<hash8>.mp4`: escala y recorte al cuadro del render (1920×1080 o
   1080×1920), `fps=25`, **sin audio** (`-an`), x264 `crf 18`, y relleno con el último cuadro o
   recorte al tramo exacto. **Nunca se retima**: si HeyGen devolvió más de 0,5 s de diferencia con el
   audio, se avisa (`log warn`) y se recorta igual. `normalizedSeconds` = largo del tramo.
7. `status: 'ready'`, `renderHash`, `narrationVersion`, `usdEstimated`.

Qué pasa si falla: `failed` con `errorCode`; HeyGen no cobra los fallos; la escena renderiza estática
con su fondo (§10.1). Reintentar desde el editor reusa audio, assets y, si existe, el video ya pagado.

### 7.3 La narración manda

El clip de HeyGen entra al render **mudo** y la mezcla final sigue siendo narración + música
(`final-mix.ts`). Como HeyGen produce un video que dura lo que dura el audio que le mandamos, el ajuste
es por cuadro: los labios quedan en sincronía sin estirar nada.

### 7.4 Aislamiento de Kie

Los recibos de HeyGen nunca entran en `animations[]`, `animationPending[]` ni `animationHistory[]`:
todo lo que consume esos arrays (regeneración de pendientes, deshacer, migración de legados,
`hasAnimationWork`) sigue sin saber que existe el avatar. El planificador de Kie recibe los tramos de
las escenas de avatar como `coveredIntervals` (ya soporta «cubierto por otro proveedor»), en el sidecar
(`generate.ts`) y en la UI (`animationRangePlan`, `galleryAnimationPlan`): una escena de avatar no se
puede animar con Kie ni marcar para animar.

## 8. La fase `avatar` y los eventos

- `STAGE_IDS` gana `'avatar'` entre `images` y `animation`; `CREATE_VIDEO_STAGES` igual;
  `PIPELINE_STAGES` y `create.stages.avatar` en la UI.
- `skip()`: no hay escenas de avatar, o todas están `ready` con clip válido.
- `run()`: (1) saldo con `me()` contra la suma de `usdEstimated` de las escenas pendientes; si no
  alcanza, pausa con `pauseReason: 'insufficient-credits'` y `errorCode: 'avatar_insufficient_credits'`
  (el mismo patrón que voz e imágenes); (2) carril por escena pendiente, tres a la vez; (3) si alguna
  no quedó `ready`, la fase falla con `avatar_incomplete` y el código dominante, como imágenes: reanudar
  solo retoma lo que falta.
- Eventos nuevos (`pipeline/runner/events.ts`): `avatar-planned { sceneIds, dropped }`,
  `avatar-scene-started { sceneId }`, `avatar-scene-progress { sceneId, phase: 'audio' | 'upload' |
'render' | 'download' | 'normalize', elapsedSeconds }`, `avatar-scene-ready { scene }`,
  `avatar-scene-failed { sceneId, code }`, `avatar-provider-trouble { code, httpStatus }`. Las claves
  numéricas y de código ya están en `ALLOWED_EVENT_KEYS`; se agrega `dropped`.
- La pantalla de progreso muestra «Avatar 2/3» con el tiempo transcurrido de cada render: HeyGen tarda
  minutos y la barra no puede parecer colgada.
- Desde el editor, el comando `avatar-render-scenes { projectId, sceneIds }` corre el mismo carril
  para esas escenas, con el lease de animación (`withProjectAnimationLease`: las lecturas siguen
  disponibles mientras se guardan recibos). `isProjectBusy` / la admisión del editor lo tratan como a
  `animate-scenes`.

## 9. Crear: la sección «Avatar»

Una tarjeta debajo de `CreateAnimationSection`, con el mismo estilo (interruptor, ayuda, estimación,
aviso de clave):

- **Interruptor** «Avatar presentador». Apagado = nada viaja en el payload.
- **Avatar:** selector con vista previa y nombre, tomado de la biblioteca (§12); enlace «Administrar
  avatares». Sin avatares en la biblioteca, el selector lleva a crearlos.
- **Motor:** sin selector. Por decisión del dueño del 2026-10-09, Vimo usa solo Avatar III
  (`AVATAR_DEFAULT_ENGINE = 'avatar_iii'`); el avatar elegido tiene que soportarlo (su look principal
  lo trae en `supportedEngines`). Si algún día vuelven Avatar IV o V, el selector muestra solo los que
  soporta el avatar, con su precio por minuto al lado.
- **Apariciones:** 1–10, por defecto 3. **Segundos por aparición:** 7–60, por defecto 10.
- **Empieza con el avatar:** casilla, por defecto activa.
- **Total y costo:** con Avatar III, «30 s de avatar ≈ 0,50 USD» para un avatar de foto o de estudio
  (0,99 USD por minuto) y ≈ 0,30 USD para un gemelo digital (0,60 por minuto), con la fórmula
  `apariciones × segundos / 60 × tarifa`, más una imagen de fondo por aparición en la línea de
  imágenes. El chequeo de saldo compara en dólares solo si `avatar-balance` devuelve `currency: 'usd'`
  (la OpenAPI admite `credits`): con otra moneda muestra el saldo sin bloquear.
- **Aviso de moderación** (una línea): HeyGen rechaza contenido político, violento o engañoso y el uso
  de personas reales sin permiso.
- Sin clave de HeyGen: la tarjeta avisa y enlaza a Claves API; el interruptor queda apagado.
- Sin saldo: bloqueo, como con las demás líneas (`useCostCheck` lee el saldo del dominio `avatar`).

Estado del formulario (`CreateFormValue`): `avatar: SelectedAvatar | null`, `avatarEngine`,
`avatarAppearances`, `avatarSecondsPerAppearance`, `avatarStartsVideo`. Payload: `options.avatar`
(§3.4) con `placement: 'auto'`; `create-video-project` valida rangos y enumerados, copia la vista
previa del avatar a `<proyecto>/avatar/look.jpg` y rechaza un look que no esté en la biblioteca.
La opción «Lo elijo en el editor» (`placement: 'manual'`) aparece en la entrega 3.

Estimación (`estimateCreateCost`): línea `{ domain: 'avatar', providerId: 'heygen', unit: 'usd' }`;
`CreditsDomain` gana `'avatar'`, `creditsDomainOf('avatar_…')`, el prefijo `avatar_` en
`insufficient-credits.ts` y una rama `heygen` en `balanceFor` (hoy todo lo que no es `poyo` cae en
Kie: eso es un bug latente para cualquier proveedor nuevo).

## 10. Render, visor y timeline

### 10.1 Render

`collectRenderScenes` agrega, **antes** de los candidatos de Kie, una candidata por escena de avatar
`ready` con clip válido y no desactualizada: `{ id, imagePath: fondo, startSeconds, endSeconds,
clipPath, clipSeconds, cameraIndex }`. La regla de solapamiento ya existente descarta cualquier clip
de Kie que pise ese tramo (no debería haber: §7.4). Una escena de avatar sin clip válido o
desactualizada renderiza **estática con su fondo** y un `warn`: el video nunca queda con un hueco. El
fundido de 8 cuadros en los bordes de un clip (`transitions.ts`) aplica igual.

### 10.2 Visor

`readyAvatarClips(scenes)` proyecta las escenas de avatar listas con la misma forma que
`readyAnimationClips`; `clipAt`, `EditorVisualComposition` y `timelineTransitionFrames` los suman.
`ClipPreviewVideo` reproduce el clip mudo en su tramo y, para un clip de avatar, reajusta al pasar
`AVATAR_PREVIEW_RESYNC_SECONDS` de desfase (hoy 0,3 s: demasiado para labios). Como el clip ya está en
el cuadro del render, `object-contain` y `cover` dan lo mismo.

### 10.3 Timeline: el bloque

`timelineBlocks` gana `kind: 'avatar'` (`TimelineAvatarBlock { scene, startSeconds, endSeconds,
state: 'planned' | 'generating' | 'ready' | 'failed' | 'stale', avatar }`). Lo dibuja
`TimelineAvatarItem` con una tarjeta compartida nueva, `TimelineBlockCard`, que `TimelineClipItem`
pasa a usar también. El diseño, el de la captura de VidRush del dueño:

- Esquinas redondeadas (`rounded-lg`), borde de 2 px del color del tipo: celeste `--sky` para el clip
  animado, **morado nuevo `--amethyst`** (`275 72% 62%`, igual en claro y oscuro, con su color de
  Tailwind) para el avatar. Al seleccionar: borde **blanco** y un brillo del color del tipo (`shadow
0 0 0 3px hsl(var(--tone)/0.7)`); al pasar el cursor, más luz.
- Ficha del tipo arriba a la izquierda: claqueta sobre celeste (hoy) y un busto (`UserRound`) sobre
  morado.
- Miniaturas: el clip animado sigue con sus escenas; el avatar muestra su **fondo** con la vista previa
  del avatar superpuesta a la izquierda; sin fondo todavía, el gradiente neutro.
- Duración abajo a la derecha (`avatarDuration`), progreso y porcentaje al generar (como hoy), franja
  ámbar y etiqueta cuando está **desactualizado**, velo rojo si falló.
- **Asas** tipo píldora en los dos extremos (blancas, con una línea oscura adentro), visibles al pasar
  el cursor o al seleccionar, **solo en bloques que se pueden estirar**: el avatar desde la entrega 3
  (§11.2); el clip animado cuando exista «mover clips» (fuera de alcance de la ADR-0056). No se dibujan
  asas que no hacen nada.
- Clic: selecciona la escena de avatar; el panel lateral muestra su panel (§11.1).

Las fronteras arrastrables de la pista: en la entrega 2, las dos fronteras de una escena de avatar
están **bloqueadas** (`animationTimingLocked` se extiende a `avatar` con clip o recibos); en la
entrega 3 se desbloquean con ajuste a frases.

## 11. Desde el editor (entrega 3)

### 11.1 Panel de la escena de avatar

Al seleccionar el bloque, el panel lateral muestra: el texto que dice, el avatar (vista previa y
nombre), el motor, el estado (§3.3), la duración, el costo estimado y los botones: **Generar** /
**Regenerar** (muestra el costo antes; corre `avatar-render-scenes`), **Regenerar fondo** (la
regeneración de imagen de siempre), **Cambiar avatar** (otro look de la biblioteca → planeado) y
**Quitar avatar** (§11.3). Un bloque desactualizado explica por qué (narración nueva o tramo movido).

### 11.2 Agregar, mover y estirar

- **«Avatar aquí»** en el panel de cualquier escena normal: propone un tramo desde la frase más cercana
  al inicio de la escena con el largo por defecto del proyecto; el usuario lo ajusta y confirma el
  costo. Comando `avatar-insert-scene { projectId, startSeconds, endSeconds, look, engine }`: valida
  frases y mínimo, **inserta** una escena de avatar nueva (id = máximo + 1, el arreglo se mantiene
  ordenado por tiempo), recorta las vecinas parciales y quita las escenas que quedan enteras dentro
  (sus imágenes quedan en disco). Devuelve el detalle nuevo; el render de HeyGen corre aparte.
- **Asas:** estirar un extremo ajusta a la frontera de frase más cercana (el detalle del proyecto trae
  `sentences`), respeta el mínimo de 7 s y mueve tiempo con la vecina, como la frontera arrastrable
  de siempre (`update-scenes`). Mover el bloque entero = las dos fronteras. El tramo nuevo deja el
  clip **desactualizado** (el `renderHash` ya no coincide) hasta que el usuario regenera; el fondo se
  conserva.
- Los proyectos con `placement: 'manual'` no tienen pines al crear: el usuario los agrega así.

### 11.3 Quitar

`avatar-remove-scene { projectId, sceneId }` convierte la escena de avatar en una escena normal:
borra `avatar`, conserva texto, prompt e imagen (el fondo queda como imagen de la escena; el usuario
puede regenerarla como cualquier otra). Los clips quedan en disco. No hay «deshacer» aparte: volver a
poner el avatar es «Avatar aquí» otra vez, y si el hash coincide, el carril reusa el video ya pagado.

### 11.4 Cuando cambia la narración

`replace-narration` incrementa `metadata.narrationVersion` además de redistribuir los tiempos. Toda
escena de avatar queda **desactualizada** al leerse (§3.3): el bloque lo muestra, el render la salta
(estática con su fondo) y el panel ofrece «Regenerar» o «Regenerar todos» con el costo total. Así
nunca queda un avatar hablando con los labios de otra narración.

## 12. Biblioteca de avatares y clave de HeyGen (entrega 1)

### 12.1 Clave

`heygen` en `ApiKeyProviderId`, categoría nueva `'avatar'` (`apiKeys.categoria.avatar`), tarjeta en
Claves API con descripción, enlaces para crear la clave y recargar, `recommended: false`; en
`pipeline/config/api-keys.ts`; enum y `ALL_PROVIDERS` en Rust; validación `GET /v3/users/me` (5 s)
→ 200 válida, 401 inválida, saldo si se puede leer (§17). En la entrega 1 la validación solo
comprobaba la clave (200 con `data.username`); desde la entrega 1b (sonda 3 respondida) muestra
además el saldo de la billetera en dólares (`data.wallet.remaining_balance`, solo si `currency` es
`usd` o falta), y la vista Avatares lo muestra con `avatar-balance`. Tests en
`src-tauri/src/api_keys/tests/validation.rs`.

### 12.2 Biblioteca

Módulo `src/modules/avatars/` (ruta `/avatars`, entrada «Avatares» en el sidebar debajo de
Personajes), con el patrón de la biblioteca de personajes:

- **Almacenamiento:** `<projectsRoot>/avatars/<id>/{metadata.json, preview.<ext>, looks/}`;
  `avatars` en `RESERVED_ROOT_DIRECTORIES`; ids `<slug>-<rand>` con la misma guarda de traversal.
  Desde la entrega 1b (2026-10-09, enmienda de la ADR-0057) **un avatar = un grupo de HeyGen con sus
  looks**, con un **look principal** que es el que usan los videos. `metadata.json` guarda `name`,
  `groupId`, `ownership` (`'stock' | 'own'`), `gender?` (`'male' | 'female'`), `status`
  (`'ready' | 'processing' | 'failed'`), `errorCode?`, `mainLookId`, `looks[]`, `previewFile?`,
  `createdAt` y `syncedAt?`; cada look, `lookId`, `name`, `lookType`, `supportedEngines`,
  `preferredOrientation?`, `status`, `origin` (`'heygen'`: venía del grupo; `'vimo'`: generado desde
  Vimo con un prompt) y `createdAt`. El `id` y las rutas no se guardan: se derivan al listar, así la
  carpeta raíz puede moverse sin romper la biblioteca. La vista previa de un look vive en
  `looks/<lookId>.<ext>` (solo si el id es `[a-zA-Z0-9_-]`) y la del avatar es la de su look
  principal o, sin ella, `preview.<ext>`: la foto subida mientras entrena o, en un avatar agregado,
  una copia de la de su principal (o la portada del grupo si esa no bajó).
  `mainLookId` es `null` mientras ningún look sirve de principal (un avatar desde foto que HeyGen
  todavía entrena); al agregarlo o elegirlo, un principal tiene que estar listo y soportar
  `avatar_iii`, pero un refresco puede dejar uno que no lo soporta (§3.4).
  `errorCode` solo está si el avatar terminó `failed` (`avatar_training_failed`;
  `avatar_no_compatible_look` si no le queda ningún look listo ni en camino; `avatar_group_missing`
  si HeyGen ya no tiene el grupo). `metadata.json` se
  escribe atómico, con un temporal único por escritura (`writeFileAtomic`: dos procesos que la
  reescriben a la vez no comparten el temporal), y quien la modifica la relee justo antes de escribir
  con un cambio puro (`updateAvatarMetadata`, sin E/S entre la relectura y el rename: las vistas
  previas de `looks/` se escriben antes, y la cara del avatar —`preview.<ext>` en
  `avatar-set-main-look`— y la vista previa de un look generado que llega listo, después de que la
  metadata confirma el cambio): `avatar-refresh` corre en otro proceso mientras HeyGen entrena y no
  pisa un look que se sumó mientras tanto. Al listar, una carpeta con la metadata ilegible deja un
  `log warn`. Al listar se valida cada campo: un look sin id, nombre o tipo conocido (o
  repetido) se descarta; un valor fuera de rango cae a `stock`, `ready`, `heygen` o sin motores; un
  género que no es `male` ni `female` se descarta; un principal que no está entre los looks queda
  en `null`; y una entrada sin `groupId` o sin `looks` se saltea en vez de tumbar la lista. La
  metadata de la entrega 1 (un look por entrada, con `lookId` suelto) ya no se lee: el listado avisa
  con un `log warn` y la persona vuelve a agregar ese avatar (no hay videos que dependan de ella);
  la carpeta queda en disco.
- **Comandos** (`pipeline/commands/avatars/`, diez): `avatars-list`,
  `avatar-stock-groups { ownership?, token? }` (los avatares de HeyGen como grupos de looks, cada
  uno con su `looksCount`; proxy a `listGroups`, paginado por cursor),
  `avatar-stock-looks { ownership?, groupId?, lookType?, token? }` (proxy a `listLooks`, paginado;
  con `groupId` solo los looks de ese avatar; el `gender` de grupos y looks sale normalizado a
  `male` / `female` con `toAvatarGender`: HeyGen manda `male` / `female` en el stock público y
  `Man` / `Woman` en lo propio, o nada),
  `avatar-add { groupId, ownership, mainLookId?, gender?, name? }` (`name` solo nombra la fila del
  log de soporte; el avatar guarda el nombre que devuelve HeyGen; un avatar ya agregado devuelve su
  entrada sin hablar con HeyGen; si no, `getGroup` (nombre, género de los propios, portada) → todos
  los looks del grupo, hasta 4 páginas de 50 → el principal: el pedido si está listo y soporta
  `avatar_iii`, si no el primero que cumpla, y sin ninguno `avatar_no_compatible_look` → baja las
  vistas previas del principal y de los dos siguientes, `AVATAR_CARD_LOOK_PREVIEWS` en total (un
  fallo avisa y no tumba) → ficha `ready`; el `gender` del payload, que viene del listado, cubre a
  los públicos, que `getGroup` trae sin género), `avatar-create-photo { name, photoPath }` (magic
  bytes, solo JPEG o PNG, ≤ 12 MB leído del `stat` antes de abrir el archivo, `uploadAsset` →
  `createPhotoAvatar` → ficha `processing` con el look que devolvió HeyGen, o sin looks si solo
  devolvió el grupo, y la foto como vista previa; sin grupo, `avatar_provider_error`; el
  `POST /v3/assets` de HeyGen no acepta WEBP, su OpenAPI lista png, jpeg, mp4, webm, mp3, wav, pdf y
  srt, así que un WEBP se rechaza en local como `avatar_photo_invalid`, antes de hablar con HeyGen y
  sin costo), `avatar-refresh { id }` (`getGroup`, y los looks del grupo; si HeyGen responde 404
  por el grupo, el avatar queda `failed` con `avatar_group_missing` y el refresco lo devuelve sin
  error, así el sondeo se detiene solo; con el grupo presente, los looks del
  grupo: actualiza los conocidos y suma los nuevos como `heygen`; consulta uno por uno, hasta 6 por
  refresco, los que no vinieron en el listado y hay que confirmar: el principal, los que procesaban
  y los de Vimo listos sin vista previa en disco (404 = ya no existen). Un look que no vino y no se
  pudo confirmar se queda si es de Vimo, procesaba o es el principal; uno de HeyGen listo se va. Un
  listado vacío de un avatar con `looksCount` > 0 no se cree y no saca a nadie. Recalcula el
  principal (si HeyGen confirmó que desapareció, el primero listo con `avatar_iii`) y el estado, y
  baja hasta 6 vistas previas que falten: las de la tarjeta y las de los looks de Vimo que quedaron
  listos), `avatar-set-main-look { id, lookId }` (el look tiene que ser del avatar
  —`invalid_payload` si no—, estar listo y soportar `avatar_iii` —`avatar_no_compatible_look` si
  no—; baja su vista previa si falta, con `getLook`, y la copia como `preview.<ext>`, la cara del
  avatar; si HeyGen o la clave fallan, el principal cambia igual y el log avisa),
  `avatar-generate-look { id, prompt, aspectRatio, referenceImagePaths?, name? }` («Crear
  escenario»: un look nuevo desde un prompt de hasta `AVATAR_PROMPT_LIMIT` = 1000 caracteres, con
  un formato de `AVATAR_ASPECT_RATIOS` (`auto`, `16:9`, `9:16`, `1:1`, `4:5`, `5:4`) y hasta
  `AVATAR_REFERENCE_IMAGES_MAX` = 3 fotos de referencia con la misma regla que la foto del avatar.
  Antes de pagar valida el payload (`invalid_payload`), lee cada referencia
  (`avatar_photo_invalid`), la carpeta raíz, el avatar (`avatar_not_found`) y que su principal esté
  listo (`avatar_main_look_not_ready`), y la clave; después sube las referencias y pide
  `createPromptLook` con `avatar_id` = el principal, `avatar_group_id` = el grupo y la
  `Idempotency-Key` `vimo-avatar-look-` + 32 hex del sha256 de id, look principal, prompt, formato
  y el sha256 de cada referencia, separados por saltos de línea (con otro principal, el mismo
  prompt pide otro look); el nombre, si falta, es `<avatar> · <n>` y no entra en la clave. El look
  vuelve `processing` (salvo que ya venga listo: entonces se registra primero y su vista previa se
  baja después, así una cancelación o un fallo de esa descarga no pierde el look ya pagado),
  con `origin: 'vimo'`, y se suma primero en `looks[]`; si HeyGen acepta el pedido pero responde
  solo con el grupo (la OpenAPI permite `avatar_item: null`), el look ya está pagado: se leen los
  looks del grupo (gratis) y se suman los que la metadata no conoce —uno solo entra como `vimo` y es
  el `lookId` devuelto; varios entran como `heygen`—; si todavía no aparece ninguno, es
  `avatar_look_not_listed` y la vista vuelve a buscar los looks de ese avatar a los 20 s (gratis),
  así un look que HeyGen lista tarde no queda invisible; siempre con un único `POST`. HeyGen
  no publica el precio por look: `AVATAR_LOOK_GENERATION_USD = null` y la interfaz muestra el
  saldo), `avatar-balance` (`getBalance`: el saldo de la billetera de la API, en USD; nunca falla:
  sin clave, o ante cualquier fallo, `{ available: false, errorCode }`, con
  `avatar_balance_unavailable` para una cuenta sin billetera legible), `avatar-delete { id }` (solo
  local; nunca borra en HeyGen). Todos de solo lectura salvo los que escriben la carpeta.
- **Vista `AvatarLibrary`** (rehecha en la entrega 1b tras la QA del dueño del 2026-10-09; plan
  `plan-e1b.md` (interno)): en la cabecera, el **saldo de HeyGen** (`avatar-balance`; en dólares con
  `formatUsd`, otra moneda como créditos; se relee al instante y a los 20 s de cada cobro, con un
  botón para los casos especiales) y los botones «Agregar de stock» y «Crear desde foto». Cuadrícula
  de **una tarjeta por avatar**: la cara del look principal anclada arriba (`aspect-[4/5]`) y, si
  hay otros looks con vista previa, dos miniaturas a la derecha; chips del tipo y de **Avatar III**
  (el único motor que Vimo usa por ahora) o «No compatible con Vimo»; el entrenamiento se muestra sin
  nombrar al proveedor («Vimo está entrenando el motor de tu avatar…») y un fallo muestra el mensaje
  de su código. Un clic abre el **panel del avatar**: la cara grande, el origen, sus looks con «Look
  principal» y «Usar como principal», la tarjeta **«Crear escenario»** (solo en avatares propios:
  descripción de hasta 1000 caracteres, formato, hasta 3 imágenes de referencia, el costo sin cifra
  —HeyGen no la publica— con el saldo al lado y el aviso de que repetir la misma descripción
  devuelve el mismo look) y quitar en dos pasos. «Agregar de stock» navega como HeyGen en dos
  niveles: los avatares (grupos) con búsqueda y chips de género del lado del cliente y video de
  vista previa al pasar el mouse, y los looks de cada uno para elegir el principal; esqueletos
  mientras carga y un error de «Cargar más» que no borra lo ya cargado; sin filtro por tipo (los
  grupos no tienen tipo). «Crear desde foto»: nombre, la foto JPG/PNG anclada arriba y ampliable en
  un visor, la tarjeta de permisos con tres reglas (foto propia o con permiso; no famosos ni
  personas reconocibles; sin contenido político, violento ni engañoso) y la casilla obligatoria
  «Tengo derecho a usar esta foto», y el precio como badge (1,32 US$ por avatar). La vista relee cada
  15 s los avatares o looks `processing` y solo deja de releer uno ante `avatar_not_found` o
  `invalid_payload`; las consultas y mutaciones del módulo usan `networkMode: 'always'` (el sidecar
  es local: sin red, el error de HeyGen llega igual en vez de quedar en pausa y dispararse solo al
  volver). Mientras «Crear escenario» o «Crear desde foto» cobran, la X queda deshabilitada, el foco
  se queda dentro del diálogo y una guarda síncrona impide el doble envío; tras un fallo, el foco
  vuelve al botón que cobró («Generar look», «Crear avatar») y, al cerrar el panel, a su tarjeta,
  con mouse o con teclado; en el stock y en la biblioteca, la vuelta al lugar de origen (la
  tarjeta, «Ver looks», el botón de la foto) solo ocurre si la interacción fue de teclado. Sin
  clave: aviso que lleva a Claves API.

## 13. Textos (i18n)

Todo texto nuevo vive en los tres catálogos, agrupado por pantalla. Grupos y claves principales (la
lista final la cierra el plan; `pnpm check:locales` las valida):

| Grupo                           | Claves                                                                                                                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apiKeys.*`                     | `descripcion.heygen`, `categoria.avatar`                                                                                                                                                           |
| `layout.nav.*`                  | `avatares`                                                                                                                                                                                         |
| `avatars.*`                     | `pageTitle`, `titulo`, `tagline`, `intro`, `soloEscritorio`, `agregarStock`, `crearFoto`, `vacio.*`, `tarjeta.*`, `types.*`, `engines.*`, `status.*`, `stock.*`, `foto.*`, `toasts.*`, `errors.*`  |
| `create.avatar.*`               | `title`, `hint`, `enable`, `look`, `chooseLook`, `manageLibrary`, `engine`, `pricePerMinute`, `appearances`, `secondsPerAppearance`, `startWithAvatar`, `total`, `cost`, `noKey`, `moderationHint` |
| `create.stages.*`               | `avatar`                                                                                                                                                                                           |
| `create.confirmScenes.*`        | `avatarLine`                                                                                                                                                                                       |
| `library.editor.timeline.*`     | `avatarDuration`, `avatarRenderingPercent`, `avatarStale`, `avatarFailed`                                                                                                                          |
| `library.editor.panel.avatar.*` | `title`, `says`, `engine`, `status.*`, `generate`, `regenerate`, `regenerateBackdrop`, `changeLook`, `remove`, `addHere`, `cost`, `staleReason.*`                                                  |
| `library.errors.*` (entrega 2)  | la familia `avatar_*` que aparece en pleno pipeline (§14); los códigos de la biblioteca de la entrega 1 ya viven en `avatars.errors.*`                                                             |

## 14. Errores

| Código                         | Cuándo                                                        | Qué ve el usuario / qué hace Vimo                                           |
| ------------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `avatar_invalid_key`           | 401                                                           | Revisar la clave en Claves API                                              |
| `avatar_insufficient_credits`  | saldo < estimado (pre-chequeo) o rechazo por saldo            | Pausa con recarga (patrón de voz/imágenes)                                  |
| `avatar_rate_limited`          | 429, o 409 `request_in_progress`                              | Espera y reintento (3 veces); el 409, sin cambiar el pedido                 |
| `avatar_look_unsupported`      | 400 por motor/look (`param: engine` o `avatar_id`)            | Elegir otro motor o avatar                                                  |
| `avatar_moderation_rejected`   | `failure_code` de moderación                                  | Explica la política; no se cobra                                            |
| `avatar_render_failed`         | otro `failure_code`                                           | Reintentar; no se cobra                                                     |
| `avatar_timeout`               | plazo vencido                                                 | El recibo queda pendiente; la próxima corrida lo cosecha                    |
| `avatar_download_failed`       | descarga inválida o URL vencida sin reemplazo                 | Reintentar (vuelve a pedir la URL)                                          |
| `avatar_network`               | red / 5xx tras reintentos                                     | Reintentar                                                                  |
| `avatar_incomplete`            | la fase terminó con escenas sin clip                          | Reanudar solo lo que falta                                                  |
| `avatar_sentences_unavailable` | sin `words.json` al planificar o insertar                     | Transcribir primero                                                         |
| `avatar_invalid_request`       | otro 4xx de HeyGen que no es de look ni de moderación         | «HeyGen respondió algo inesperado»; reintentar en un rato                   |
| `avatar_provider_error`        | 200 con un cuerpo que no tiene la forma esperada              | Ídem: «HeyGen respondió algo inesperado»                                    |
| `avatar_photo_invalid`         | la foto no se lee, no es JPG/PNG (WEBP no) o supera los 12 MB | El mensaje de la foto: elegir otra (se valida antes de subirla, sin costo)  |
| `avatar_not_found`             | el id del avatar ya no está en la biblioteca                  | «Ese avatar ya no está en tu biblioteca»                                    |
| `avatar_training_failed`       | HeyGen no pudo entrenar el avatar desde la foto               | La ficha queda `failed` con «probá con otra foto»                           |
| `avatar_main_look_not_ready`   | «Crear escenario» sobre un avatar sin look principal listo    | «El avatar todavía no tiene un look principal listo»; sin hablar con HeyGen |
| `avatar_no_compatible_look`    | el avatar no tiene ningún look listo con Avatar III           | «Este avatar no tiene ningún look listo compatible con Vimo (Avatar III)»   |
| `avatar_group_missing`         | HeyGen responde 404 por el grupo del avatar al refrescar      | La ficha queda `failed`: «HeyGen ya no tiene este avatar. Quitalo…»         |
| `avatar_look_not_listed`       | look por prompt aceptado sin `avatar_item` y aún sin listar   | «HeyGen recibió el pedido…»; la vista lo vuelve a buscar a los 20 s         |

Mapeo en `pipeline/providers/avatar/heygen-errors.ts` (puro, testeable). El orden importa: el saldo
se mira antes que el status, el `param` de look (`avatar_id`, `engine`, `avatar_group_id`) antes que
la moderación (un «not allowed» sobre un `avatar_id` es «ese tipo de avatar no sirve», no un rechazo
de contenido), y todo otro 4xx es `avatar_invalid_request`: solo desde el 500 es `avatar_network`
(«revisá tu conexión»). `avatar_photo_invalid` tampoco admite WEBP aunque Vimo lo reconozca como
imagen: `POST /v3/assets` de HeyGen solo acepta png y jpeg entre las imágenes. Textos: en la
entrega 1, los de la biblioteca viven en `avatars.errors.*`; los códigos que aparecen en pleno
pipeline (entrega 2) irán en `library.errors.*`, con el mismo patrón que `animation_*`.

## 15. Pruebas y QA

**Guards provisorios** (`scripts/test/`, node:test + esbuild, como `check-timeline-layout.mjs`):

- `check-narration-sentences.mjs`: modo con `sentenceEnd`, modo por pausas, partición de frases
  largas, contigüidad 0→fin, cuantización.
- `check-avatar-planner.mjs`: `fit` (más cerca del objetivo, mínimo 7, máximo 60), primera aparición
  en 0, reparto parejo, hueco mínimo, `dropped`, determinismo.
- `check-scene-pins.mjs`: pines con los tres cortadores (segundos, cantidad, prefijo animado), tramos
  cortos absorbidos, ids contiguos, textos por palabras, caché reutilizable con recibos.
- `check-avatar-blocks.mjs`: candidatos del render con prioridad sobre Kie, estática si no hay clip,
  `stale` derivado (versión de narración y hash del tramo), `timelineBlocks` con `kind: 'avatar'`,
  `coveredIntervals` hacia Kie.
- `check-heygen-client.mjs` (entrega 1, existe): cliente de HeyGen, mapeo de HTTP y cuerpo a `avatar_*`,
  reintento ante 429, subida multipart, idempotencia y la biblioteca en disco; `check-avatar-library.mjs`
  (entrega 1, existe): los diez subcomandos de la biblioteca con HeyGen simulado (desde la entrega
  1b, con el alta por grupo, el refresco de sus looks, el look principal, el look desde un prompt y
  el saldo). El mapeo de `failure_code` de los
  videos se suma en la entrega 2.

**Rust:** `src-tauri/src/api_keys/tests/validation.rs` para la rama de HeyGen.

**QA del dueño, por entrega** (lista completa en el plan): (1) pegar la clave, ver el saldo; agregar
dos avatares de stock y crear uno desde una foto, ver el aviso de moderación y el estado
`processing` → listo; (2) crear un video con 3 apariciones de 10 s desde Crear, ver la línea del avatar
en la confirmación de escenas, el progreso «Avatar n/3», el bloque morado en el timeline, el visor con
los labios en sincronía, el render final con la narración de siempre y el fondo relacionado con el
tema; reemplazar la narración y ver los bloques desactualizados; silenciar/renderizar sin avatar sigue
igual; (3) «Avatar aquí», estirar con las asas con ajuste a frases, regenerar con costo, quitar.

## 16. Entregas

1. **Clave y biblioteca** (§12 + las sondas de §17): HeyGen en Claves API; vista Avatares; stock, foto,
   borrar. Sin tocar el pipeline de video.
2. **Avatar en el video**: §3–§10 desde Crear (planificador, pines, fondos, carril, fase, sección,
   render, visor, bloque morado con el diseño nuevo también en el clip animado, desactualizado al
   cambiar la narración). Fronteras del avatar bloqueadas.
3. **Avatar desde el editor**: §11 (panel, «Avatar aquí», asas con ajuste a frases, regenerar,
   quitar, `placement: 'manual'`).

La entrega 1b (ajustes de la QA del dueño a la entrega 1) va entre la 1 y la 2. Su revisión final
dejó cuatro cuidados para el plan de la entrega 2, que se apoya en la biblioteca por avatar tal cual:

- El look de un video es `looks.find((look) => look.lookId === mainLookId)` y su compatibilidad se
  mira en `supportedEngines.includes(AVATAR_DEFAULT_ENGINE)`, nunca solo en `status: 'ready'` (un
  refresco puede dejar un principal listo sin Avatar III).
- Sin selector de motor mientras siga la decisión del dueño (§9), y el costo con la tarifa de
  `avatar_iii`.
- `avatar-balance` puede devolver una `currency` distinta de `usd`: el chequeo de saldo de la fase
  `avatar` no compara créditos contra un estimado en dólares.
- `options.avatar` (§3.4) suma el `id` del avatar de la biblioteca (para validar y copiar su vista
  previa sin recorrer todos los avatares), y la copia en el proyecto conserva la extensión real de la
  vista previa (puede ser PNG o WEBP, no solo `look.jpg`, §3.2).

Cada entrega tiene su plan, su ejecución con subagentes y su QA del dueño; el push y el PR siguen
pidiendo su aprobación cada vez.

## 17. Riesgos y sondas

Cuatro dudas solo se resuelven con la clave del dueño, dentro de la entrega 1, avisándole el costo
antes (las tres primeras, con renders reales: menos de 1 USD en total, tres videos de 7 s; la
cuarta, hasta 1,32 USD):

1. **Avatar de foto + fondo de imagen:** confirmar que HeyGen reemplaza el fondo de la foto por el
   nuestro (si no, `remove_background` o fondo de color como respaldo).
2. **Encuadre en 16:9:** `fit: 'contain'` contra omitirlo, con un look vertical.
3. **Saldo — respondida el 2026-10-09 (sonda gratis con la clave del dueño):** `GET /v3/users/me`
   devuelve `data.billing_type: "wallet"` y `data.wallet: { currency: "usd", remaining_balance,
auto_reload }`; no vienen `subscription` ni `usage_based`. La validación de la clave (entrega 1b)
   lee `wallet.remaining_balance` y lo muestra en dólares; `balanceFor` (entrega 2) usa el subcomando
   `avatar-balance`. Una cuenta sin billetera valida igual, sin saldo.
4. **Cobro de un entrenamiento fallido:** si un avatar desde foto que termina `failed` se cobra
   (1,32 USD) o HeyGen lo devuelve. Hasta saberlo, el texto del precio en «Crear desde foto» solo
   dice cuánto cuesta («Crear el avatar cuesta {{price}} de tu cuenta de HeyGen.») y no promete que
   un rechazo no se cobre. Se sondea con una foto sin cara, mirando el saldo antes y después (la
   sonda 3 dice cómo leerlo).

Otros riesgos aceptados: los renders tardan minutos (la UI lo muestra con tiempo transcurrido);
`punctuate` de Deepgram se verifica en la primera transcripción de la entrega 2 (si no viniera
`punctuated_word`, el modo por pausas cubre); los términos de HeyGen sobre «autorizar a terceros» los
asume el dueño hasta tener su visto bueno por escrito; la salida con alfa (`webm`) y la composición
propia quedan para el sub-proyecto 3, con el mismo audio cortado y el mismo fondo ya guardados.
