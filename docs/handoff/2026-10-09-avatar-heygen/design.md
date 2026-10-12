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
  **Entrega 2 implementada en la rama el 2026-10-10/11** (plan en `plan-e2.md` (interno): el
  avatar dentro del video desde Crear; evidencia en `execution-e2/` (interno)), y dos rondas
  sobre la QA del dueño del 2026-10-11: la **entrega 2b** (plan en `plan-e2b.md` (interno):
  planificador, filtros y favoritos del stock, reproductor de looks y borrador de Crear; evidencia en
  `execution-e2b/` (interno)) y la **entrega 2c** (plan en `plan-e2c.md` (interno):
  eliminar en HeyGen, formato de los looks, título del video en cada render, coral legible en tema
  claro y la tarjeta de Crear con el formato del look; evidencia en `execution-e2c/` (interno)) y la
  **entrega 2d** (plan en `plan-e2d.md` (interno): el reproductor de Crear con «Usar», los textos de
  avatares sin el nombre del proveedor, eliminar de la lista o de HeyGen, una aparición que falla que no
  frena el video, la escena desactualizada que no se paga sola, el mínimo de 5 s y «Generar» / «Regenerar»
  desde el editor; evidencia en `execution-e2d/` (interno)). Pendiente: la QA del dueño de la 2d
  ([qa-2d.md](execution-e2d/qa-2d.md), con la app de prueba que ahí se nombra), con los puntos que gastan
  saldo de HeyGen. Lo que falta de la entrega 3 (cambiar de avatar, «Avatar aquí», mover y estirar, quitar)
  no tiene plan todavía.
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
  // cortado + versión de la narración. La Idempotency-Key se deriva de la huella
  // más el id del proyecto, el id de la escena y el número de intentos `failed`
  // del mismo pedido (renders fallidos o rechazos definitivos): así un fallo no se
  // repite 24 h por la misma clave, dos proyectos con la misma narración no
  // comparten clave, y los intentos se agrupan por huella (rulings del 2026-10-10,
  // commits 98bb7860 y 5d1b423d).
  hash: string
  state: 'creating' | 'pending' | 'succeeded' | 'failed' | 'ambiguous'
  engine: AvatarEngine
  lookId: string
  audioAssetId?: string
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
`text` son las frases que dice, no tiene imagen generada (su imagen fija es la vista previa del look,
`avatar/look.<ext>`, §6.2) y su clip vive en `avatar/`.

### 3.2 Archivos del proyecto

```
<proyecto>/
  avatar/
    look.<ext>                        vista previa del look elegido (copia de la biblioteca; jpg, png o webp)
    scene_<id>.<hash8>.wav            el pedazo de narración que habla (se reusa por hash)
    scene_<id>.<hash8>.raw.mp4        lo que devolvió HeyGen
    scene_<id>.<hash8>.mp4            normalizado al cuadro del render (= clipFile)
```

`ProjectPaths` suma `avatarDirectory`; `pipeline/avatar/clip-path.ts` valida los nombres igual que
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

**Desde la entrega 2d (§20)** `stale` se deriva en TODA escena `ready` desactualizada, también en la que
perdió su clip (esa sigue viniendo con `status: 'failed'` y `avatar_download_failed`). Para mostrar una
escena lista, `stale` manda sobre `failed`: el bloque y el panel del editor la muestran **desactualizada**,
porque regenerarla paga un render nuevo y el texto de la descarga promete que no se cobra otra vez. Una
`ready` al día que perdió su clip sí sigue fallida (repetir el mismo pedido reusa el video ya pagado).

### 3.4 Opciones del proyecto

```ts
// en VideoProjectOptions (pipeline/types/video-project.ts), validado en create-video-project
avatar?: {
  avatarId: string // el avatar de la biblioteca (§12); valida el look y copia su vista previa
  lookId: string
  lookName: string
  lookType: AvatarLookType
  engine: AvatarEngine
  appearances: number // 1..10
  secondsPerAppearance: number // 5..60
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

| Constante                            | Valor                             | Para qué                                                     |
| ------------------------------------ | --------------------------------- | ------------------------------------------------------------ |
| `AVATAR_MIN_APPEARANCE_SECONDS`      | 5                                 | Mínimo por aparición (5 desde la 2d; antes 7)                |
| `AVATAR_MAX_APPEARANCE_SECONDS`      | 60                                | Máximo por aparición                                         |
| `AVATAR_DEFAULT_APPEARANCE_SECONDS`  | 10                                | Valor inicial del formulario                                 |
| `AVATAR_MIN_APPEARANCES`             | 1                                 |                                                              |
| `AVATAR_MAX_APPEARANCES`             | 10                                |                                                              |
| `AVATAR_DEFAULT_APPEARANCES`         | 3                                 |                                                              |
| `AVATAR_MIN_GAP_SECONDS`             | 10                                | Mínimo de imágenes entre dos apariciones                     |
| `SENTENCE_PAUSE_SECONDS`             | 0.35                              | Pausa que cierra una frase sin puntuación                    |
| `MAX_SENTENCE_SECONDS`               | 15                                | Una frase más larga se parte en su pausa mayor               |
| `AVATAR_RENDER_CONCURRENCY`          | 3                                 | Renders de HeyGen a la vez (su tope es 10)                   |
| `AVATAR_POLL_INITIAL_MS` / `_MAX_MS` | 5000 / 20000                      | Espera creciente al consultar el estado                      |
| `AVATAR_RENDER_DEADLINE_MS`          | 30 min                            | HeyGen dice 1–5 min; su centro de ayuda, hasta 10 por minuto |
| `AVATAR_PREVIEW_RESYNC_SECONDS`      | 0.12                              | Reajuste del visor sobre un clip de avatar (labios)          |
| `AVATAR_LOOK_ORIENTATION_BY_FORMAT`  | 16:9 → landscape, 9:16 → portrait | La orientación de look que exige cada formato (§6.2)         |

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
  `AVATAR_MIN_APPEARANCE_SECONDS` (5 s desde la entrega 2d, pregunta 4 del dueño; 7 hasta la 2c; sigue
  sumando) ni más de `AVATAR_MAX_APPEARANCE_SECONDS`. Si el audio se acaba antes de llegar al mínimo, esa
  aparición no cabe. Los ejemplos con números de esta sección se escribieron con el mínimo de 7 s: con el de
  5 s algunos dan otro plan (el guard lee la constante y reescaló sus casos).
- **Primera aparición.** Con `startWithAvatar`, `fit` desde la frase 0: el video abre con el avatar.
  Si la apertura no cabe (la primera frase sola pasa el máximo, o el audio es más corto que el
  mínimo), cuenta como UNA aparición descartada y las demás se reparten como sin apertura (nunca
  antes de `MIN_SECONDS_PER_SCENE`); no se descarta el plan entero (ruling del 2026-10-10, tarea 3).
  Una frase de más de `AVATAR_MAX_SENTENCE_SECONDS` entra entera mientras no pase el máximo de la
  aparición; una de más del máximo no entra en ninguna. **Desde la entrega 2b (decisión del dueño
  del 2026-10-11):** una frase desde la que `fit` no cabe (pasa el máximo, o el audio se acaba
  antes del mínimo) no descarta la aparición: se saltea y la aparición se arma desde la frase más
  cercana al ancla desde la que sí cabe. Solo si ninguna frase de la zona sirve, la aparición se
  cuenta en `dropped`. Antes de la 2b la regla era literal («la más cercana, y si no cabe, se
  descarta»); el ejemplo de la tarea 3 —3 s, una frase de 65 s y diez de 5 s, tres apariciones de
  10 s con apertura— daba `[[83, 93]]` con 2 descartadas y ahora da `[[68, 78], [88, 98]]` con 1.
- **Las demás.** Se reparten parejo: la zona libre va desde el fin de la anterior más
  `AVATAR_MIN_GAP_SECONDS` hasta el fin del audio; para M apariciones restantes, el ancla k es el
  centro del tramo k de M tramos iguales; la aparición empieza en la frase cuyo inicio está más cerca
  de `ancla − objetivo/2` entre las que arrancan después del fin de la anterior más el hueco mínimo
  **y desde las que `fit` cabe** (con empate, la primera); `fit` desde ahí.
- **Pausas (entrega 2b, decisión del dueño del 2026-10-11).** Una aparición nunca carga más de
  `AVATAR_MAX_PAUSE_SECONDS` = 2 s de silencio después de la última palabra de una frase. Cada
  `NarrationSentence` lleva `lastWordEndSeconds` (el fin de su última palabra, sin llevar al cuadro;
  `detectSentences` lo saca de `words.json`) y su **fin recortado** para el avatar es
  `min(endSeconds, cuadro(lastWordEndSeconds + AVATAR_MAX_PAUSE_SECONDS))` (al cuadro de 25 fps con
  `frameBoundary`, nunca antes del inicio de la frase). `fit` mide los largos hasta el fin recortado
  (con las dos excepciones de más abajo: la cola corta y el máximo después del corte), y una
  frase cuya pausa pasa el tope **cierra** la aparición: la siguiente no se suma, aunque el largo esté
  por debajo del mínimo (entonces esa aparición no cabe desde ahí). El silencio que queda afuera pasa
  a la escena de imagen siguiente (el corte ya admite escenas sin palabras). El tope no cambia el
  plan cuando todas las pausas son de 2 s o menos (la regla de la frase más cercana desde la que
  cabe y la del máximo, de abajo, sí pueden cambiarlo sin ninguna pausa). El silencio inicial de la
  primera frase (de 0 a su primera palabra) no se recorta: con «empieza con el avatar» el video abre
  con el avatar. Ejemplo: una palabra y 19 s de silencio ya no es una aparición de 19,6 s que HeyGen
  cobra: esa frase sola mide 2,44 s útiles, no puede sumar la siguiente, y la aparición se arma
  desde otra frase.
  **El tope nunca deja una cola corta** (rulings del 2026-10-11, revisión de la 2b): si el fin
  recortado de una frase queda a menos de `MIN_SECONDS_PER_SCENE` del fin del audio, el tramo llega
  a su fin nominal, porque el corte absorbería esa cola igual (§6.1); el mínimo se sigue midiendo
  hasta el fin recortado, así una última frase casi muda al fin del audio no se vuelve aparición: la
  última frase 3–11 con su última palabra a los 7 s no entra, y la 3–13 con su última palabra a los
  9 s entra y llega a 13. Con la última frase 5–12 (última palabra a los 7,95 s, audio de 12 s) la
  aparición es 0–12, como antes de la 2b. **El máximo se cumple después del corte** (ruling del
  2026-10-11, ronda 3): los 60 s por aparición son una regla del dueño («máx. 1 min»), así que una
  aparición que terminaría a menos de `MIN_SECONDS_PER_SCENE` del fin del audio se mide hasta el fin
  del audio, haya o no tope de silencio en su última frase. Con objetivo 60 s y la última frase
  55–61 (última palabra a los 57,95 s, audio de 61 s) el plan es 0–55 y la escena final de imagen
  55–61; sin pausas, con once frases de 5 s, una de 4,6 y una final de 1,8 (audio de 61,4 s), 0–55 y
  no 0–59,6. Si ni sacando frases la aparición queda en el máximo, se descarta (una apertura de 59 s
  seguida de una final de 2 s). Una pausa larga ADENTRO de una frase de 15 s o menos (después de una
  coma o de un punto que Deepgram no marcó) la aparición la carga entera: el tope mira solo la pausa
  después de la última palabra (límite deliberado).
- Determinista: mismas frases y opciones, mismo plan. Los que no caben se cuentan en `dropped` y se
  informan (evento `avatar-planned`), no fallan.

El costo real queda a unos segundos del estimado (frases enteras); la fase lo vuelve a comparar con
el saldo antes de pagar (§8).

## 6. Cortes con pines y el look como escenario

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
  confirmada menos los pines se reparte entre los tramos libres por **promedios mayores** (D'Hondt:
  una escena por tramo y cada escena sobrante al tramo donde la escena resultante dura más; empate →
  el anterior), y la cantidad automática con pines es `pines + Σ max(1, ⌊largo del tramo / 3⌋)`, así
  ninguna imagen queda por debajo de 3 s salvo que la persona pida más que la capacidad (como hoy sin
  avatar); con prefijo animado de Kie, `planPrefixSceneWindowsWithin` se aplica a los tramos libres en
  orden con el presupuesto de minutos restante (el prefijo animado nunca pisa al avatar), la última
  fuente del prefijo más corta que 3 s que queda antes de una aparición se **une a la anterior**
  (nunca en el fin del audio ni si es la única fuente del tramo), y el resto posterior al prefijo queda
  entre una escena cada 12 s y una cada 3 s (una cantidad pedida mayor se acota, como hoy sin avatar).
  Residuales documentados, a lo sumo uno por video: la única fuente corta de un tramo, un resto corto
  que termina en una aparición y la cola final del audio (igual que sin avatar). Rulings del
  2026-10-10 (tarea 4, ronda 1).
- Un tramo libre menor a `MIN_SECONDS_PER_SCENE` (3 s) se absorbe en la escena de avatar vecina (la
  que le sigue; si no hay, la anterior): mejor que el avatar hable tres segundos más a que haya una
  imagen de dos segundos. Por eso los `avatarSpans` de la pausa y los tiempos de las escenas de avatar
  salen YA absorbidos (la última aparición puede alargarse hasta 3 s respecto del plan, nunca por
  encima del máximo: el planificador mide su máximo con esa cola, §5), y el costo
  se mide sobre ellos, no sobre el plan.
- La caché del corte se conserva: si el corte previo es reutilizable, se mantienen las escenas
  previas con sus recibos (`scenes = reusable ? previous : fresh`, como hoy).

**Confirmación de escenas (ADR-0013).** `suggestedScenes` cuenta todas las escenas, avatar incluido.
El evento `awaiting-scene-confirmation` suma `avatarSpans: [{ startSeconds, endSeconds }]` y el
diálogo muestra una línea: «El avatar aparece 3 veces (0:00–0:11, 1:02–1:13, 2:10–2:19)» con el costo
real («Costo del avatar: ≈ X US$», calculado sobre esos tramos ya absorbidos). Cambiar la
cantidad o los segundos en el diálogo solo reparte las escenas libres; los pines no se mueven; el
«≈ N escenas · M imágenes» del diálogo sale de `countScenesAroundSpans` con los tramos reales (nunca
del número elegido a mano; con prefijo animado, una cantidad mayor se acota). Si ninguna aparición entra
(`avatarSpans: []` con el avatar activo), la pausa lo dice y ofrece cancelar («Ninguna aparición del
avatar entra en esta narración (N descartadas): acortá la duración de las apariciones o alargá la
narración»), y «N apariciones no entraron» aparece en la pausa y en el progreso siempre que
`dropped > 0` (ola final del 2026-10-10).

### 6.2 El look es el escenario (sin fondo generado)

**Decisión del dueño del 2026-10-10** (reemplaza la versión anterior de esta sección, que hacía
que las fases de prompts e imágenes generaran un «decorado» para cada aparición): el clip del avatar
**es** la escena. HeyGen renderiza el look tal cual, con el fondo que el look ya tiene (un look
hecho «en una cocina» desde la biblioteca, §12, para un video de cocina), en el formato del
proyecto. Vimo **no escribe un prompt ni genera una imagen** para una escena de avatar: sería una
imagen que nadie ve.

- Una escena con `avatar` no pasa por el director, el clasificador de presencia, el redactor, el
  revisor narrativo, la fase de imágenes ni los rescates por contenido rechazado; `charactersPresent`
  queda vacío y nunca recibe referencias de personaje. Los proyectos sin avatar quedan byte-idénticos
  (lo fijan las huellas del guard `check-gem-verbatim-lane`).
- La imagen fija de la escena de avatar es la vista previa del look elegido, copiada al crear el
  proyecto a `<proyecto>/avatar/look.<ext real>` (§3.2): sirve de miniatura en la confirmación de
  escenas y en el timeline, y de respaldo estático del render si el clip falta (§10.1).
- El look tiene que tener la orientación del formato del proyecto (`preferredOrientation`
  `landscape` para 16:9, `portrait` para 9:16): Crear solo ofrece esos looks y, si el avatar no
  tiene ninguno, lleva a «Crear escenario» en la biblioteca con el formato correcto (§9).
- Regenerar la imagen de una escena de avatar desde el editor no existe: lo que se regenera es el
  clip (§11).

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
| `listVideos()`        | `GET /v3/videos`                        | Recuperar un pedido ambiguo por `title` (§7.1)         |
| `createPhotoAvatar()` | `POST /v3/avatars` `{ type: 'photo' }`  | Biblioteca (entrega 1)                                 |
| `createPromptLook()`  | `POST /v3/avatars` `{ type: 'prompt' }` | Un look nuevo desde un prompt (entrega 1b)             |
| `getBalance()`        | `GET /v3/users/me`                      | Saldo de la billetera para la vista Avatares; no lanza |

Cuerpo de `createVideo` (verificado contra la OpenAPI; decisión del dueño del 2026-10-10: el look se
renderiza tal cual, con su propio fondo): `type: 'avatar'`, `avatar_id` (el look elegido),
`audio_asset_id` (el pedazo de narración cortado), `engine: { type: 'avatar_iii' }`,
`aspect_ratio: '16:9' | '9:16'` (el formato del proyecto; el look tiene la misma orientación, §6.2),
`resolution: '1080p'`, `output_format: 'mp4'`, `title: 'vimo:<projectId>:scene-<id>:<hash8>'`.
**Desde la entrega 2c (decisión del dueño del 2026-10-11, «debe llevar título video»)** el título es
`<nombre del video> · vimo:<projectId>:scene-<id>:<hash8>`: el nombre que la persona le puso al video
(sin espacios de más y cortado en `AVATAR_VIDEO_TITLE_NAME_LIMIT` = 80 grafemas; sin nombre, solo la
marca) y la marca de antes, que sigue siendo la clave para recuperar un pedido sin respuesta.
El recibo guarda el título exacto que se mandó y cada repetición manda el mismo cuerpo bajo la misma
clave: un recibo de antes de la 2c, que no tiene título guardado, repite la marca sola, como salió
su POST original. La recuperación busca el render cuyo título es EXACTAMENTE el que salió (el
guardado, o la marca sola en un recibo de antes de la 2c): primero, si el recibo tiene un título
guardado distinto de la marca, una página de `GET /v3/videos?title=<título guardado>` (la OpenAPI
dice que el filtro es por substring; así también sirve si HeyGen filtra por igualdad o por prefijo),
y después por la MARCA, hasta tres páginas, donde también vuelven las copias. El exacto se adopta
con cualquier estado. Solo si no aparece, uno cuyo título termine en la marca, con lo que sea
delante (HeyGen pudo guardar distinto el nombre o el separador), y no esté `failed`, el más avanzado
(completado, después en curso, después de estado desconocido; entre iguales, el primero del
listado). Una copia hecha en HeyGen («`Copia de <título>`») también termina así, pero nunca le gana
al exacto, y una `failed` nunca se elige: cerraría el intento y el siguiente pagaría otro render. Un
título con la marca en otro lugar (no al final) no se adopta. Así un render pedido antes del cambio
se sigue recuperando sin pagar dos veces y un renombre del video en el medio no rompe nada.
**Medición pendiente (QA HR; aquí va la oración «Medido el …»):** cómo filtra de verdad
`GET /v3/videos?title=` (por substring, por prefijo o por igualdad) y si devuelve el título tal
cual. La sonda gratis del 2026-10-11 a las 17:06 (`GET /v3/videos?limit=20`) no encontró renders en
la cuenta para probar el filtro, así que se mide con el primer render de la QA HR.
**Sin `background`, sin `remove_background` y sin `fit`.** Sin webhooks (una app de escritorio no
tiene URL pública): se consulta el estado. Medido con siete renders pagos de 7 s (§17): 7 s de audio →
video de 7,000 s a 25 fps, 0,11–0,12 USD a 720p con Avatar III, entre 32 s y 4 min de espera.

Errores: HTTP 400/401/409/429 y el sobre `error.{code,message,param}`; `failure_code` cuando un video
termina `failed`. La tabla de mapeo está en §14.

### 7.2 Carril por escena (`pipeline/avatar/lane.ts`)

Pago una sola vez, como el carril de Kie (ADR-0042), pero con recibos propios en `scene.avatar`:

1. **Audio.** `ffmpeg -ss <inicio> -t <largo> -i narration.mp3 -ar 44100 -ac 1 -c:a pcm_s16le`
   → `avatar/scene_<id>.<hash8>.wav`; inicio y largo cuantizados a 25 fps. Se reusa si existe con el
   mismo hash (narración, tramo).
2. **Subida.** Solo el audio, con `uploadAsset`; el `asset_id` se persiste en el intento. Un id de
   asset no vence: un reintento con el mismo hash no vuelve a subir. (No hay fondo que subir: §6.2.)
3. **Pedido.** Se persiste `{ state: 'creating', hash, … }` **antes** del POST y
   `{ state: 'pending', videoId }` después (fuera del `try` del POST: un error al persistir nunca se
   clasifica como respuesta de HeyGen). Sin respuesta → `ambiguous`: la próxima corrida busca el
   render en `listVideos()` (primero por el título guardado, una página, y después por la marca,
   recorriendo `nextToken`) y adopta el que corresponda (la regla, en §7.1); si no hay, repite el
   POST con la **misma** `Idempotency-Key` y el mismo cuerpo (HeyGen deduplica 24 h). Un intento
   `creating`/`ambiguous`
   bloquea cualquier POST nuevo hasta resolverse. Clasificación (rulings del 2026-10-10, tarea 7,
   rondas 1 y 2): todo `409` y el `429` agotado dejan el recibo `ambiguous`, también en el primer
   envío (un 4xx de esos en una repetición no dice nada del original); un rechazo definitivo (400,
   402, 404, 413, 422, moderación, y el `invalid_payload` local del cliente) deja el recibo `failed`
   con su código, así el siguiente intento nace con otra clave (recargar saldo y reanudar paga con la
   clave nueva sin volver a subir el audio); en una **repetición**, un 401, 402 o 403 (o cualquier
   respuesta cuyo código hable de saldo) deja el recibo `ambiguous`, porque la autenticación y el saldo
   pueden resolverse antes que la clave y no dicen nada del envío original (el 402 sigue pausando por
   saldo); un asset de audio que HeyGen rechaza (`param: audio_asset_id`) sale de todos los recibos del
   mismo pedido. Ola final del 2026-10-10: un rechazo posterior a un `409 request_in_progress` de la
   misma cadena queda `ambiguous` (`HeyGenFailure.sawRequestInProgress`), y también un 408 o 425 en una
   repetición; `listVideos` conserva un render de estado desconocido si trae id y título; el mp4 del
   proyecto se marca desactualizado solo con el checkpoint que trae un clip nuevo; el carril barre al
   entrar los temporales (`.cut-tmp.wav`, `.normalize-tmp.mp4`) que un job matado dejó para su escena.
4. **Espera.** `getVideo` cada `AVATAR_POLL_INITIAL_MS`, creciendo ×1,5 hasta `AVATAR_POLL_MAX_MS`;
   `AVATAR_RENDER_CONCURRENCY` a la vez; plazo `AVATAR_RENDER_DEADLINE_MS` → `avatar_timeout` (el recibo
   queda `pending` y no se vuelve a pagar: lo cosecha sin pagar el «Regenerar» del editor, o reanudar si la
   fase no terminó).
5. **Descarga** con el `video_url` (vence: se persiste y se vuelve a pedir si venció) a
   `scene_<id>.<hash8>.raw.mp4`, reusando `saveClipToFile` (200 MB, magic bytes mp4).
6. **Normalización** a `scene_<id>.<hash8>.mp4`: escala y recorte al cuadro del render (1920×1080 o
   1080×1920), `fps=25`, **sin audio** (`-an`), x264 `crf 18`, y relleno con el último cuadro o
   recorte al tramo exacto. **Nunca se retima**: si HeyGen devolvió más de 0,5 s de diferencia con el
   audio, se avisa (`log warn`) y se recorta igual. `normalizedSeconds` = largo del tramo.
7. `status: 'ready'`, `renderHash`, `narrationVersion`, `usdEstimated`.

Qué pasa si falla: `failed` con `errorCode`; HeyGen no cobra los fallos; la escena renderiza estática
con la vista previa del look (§10.1). Reintentar desde el editor reusa audio, assets y, si existe, el
video ya pagado. Normalización: `-g 25` (un cuadro clave por segundo), para que el visor no entre en
una cadena de seeks al reajustar a los 0,12 s.

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
- `skip()`: no hay escenas de avatar, o ninguna está pendiente (`isAvatarScenePending`: una `ready`
  desactualizada no lo está aunque le falte el clip, §20), o la fase ya está en `completedStages`
  (terminada: no vuelve a correr al reanudar; lo que dejó con la imagen fija se regenera desde el editor, y
  una pausa de la cuenta no la completa).
- `run()`: (1) saldo con `me()` **antes de cada escena que paga** (no solo al inicio), contra lo que
  falta pagar en la corrida (estimación exacta por la duración real de la escena, en cuadros); si no
  alcanza, o HeyGen responde 402 (o un fallo cuyo código habla de saldo), pausa con `pauseReason:
'insufficient-credits'` y `errorCode: 'avatar_insufficient_credits'` y ninguna otra escena de la
  corrida paga (el mismo patrón que voz e imágenes; con `currency` distinta de `usd` el saldo se
  muestra y no bloquea); antes de pedir nada, una pasada de **cosecha** resuelve los recibos
  `creating`/`pending`/`ambiguous` (por su título guardado y su marca, o repitiendo la misma clave, sin pasar por el saldo
  porque HeyGen deduplica); (2) carril por escena pendiente, tres a la vez, con una cola de escrituras
  compartida que relee `scenes.json` bajo el lease de escena; `avatar-scene-started` se emite una vez
  por escena y corrida; (3) si alguna no quedó `ready` por un fallo de la escena (render fallido, plazo
  vencido, moderación, look no soportado, descarga, HeyGen caído), la fase **termina** con un aviso `warn`
  en el log y el render deja esa escena con la imagen fija del look (§10.1). Así es **desde la entrega 2d**
  (§20): hasta la 2c la fase fallaba con `avatar_incomplete` y el código dominante, como imágenes, y
  reanudar retomaba lo que faltaba (rulings del 2026-10-10, tarea 8). Terminada, reanudar NO la vuelve a
  correr —su `skip` mira `completedStages`, donde el pipeline la anota solo si `run` terminó—: esas
  apariciones se regeneran desde el editor, que también cosecha sin pagar un recibo `pending` vencido
  (ruling R-P2). Solo la cuenta la frena: si el código dominante es de la cuenta (`avatar_invalid_key`,
  `missing_api_key`, `avatar_insufficient_credits`), la fase lanza ESE código (gana aunque otra escena haya
  sido rechazada), pausa o falla como voz e imágenes y NO se completa, así que reanudar retoma lo pendiente;
  `avatar_incomplete` queda solo en proyectos de antes de la 2d. Una escena cuyo último intento `failed` del
  mismo pedido fue moderación o look no soportado no se vuelve a pedir sola (queda `failed`, con aviso;
  desde el editor sí, con `retryFinalRejection`).
- `avatar-planned { sceneIds, dropped }` se emite apenas se conoce el plan, ANTES de la pausa
  `awaiting-scene-confirmation` (una vez por corrida; el job que sigue a la confirmación lo vuelve a
  emitir), y el estado del proyecto con que la app rearma la pausa tras reiniciar trae `avatarSpans` y
  `avatarDropped` recomputados desde `words.json` (ausentes sin avatar automático): así «N apariciones
  no entraron» llega al diálogo y al progreso aunque la fase se saltee.
- Eventos nuevos (`pipeline/runner/events.ts`): `avatar-planned { sceneIds, dropped }`,
  `avatar-scene-started { sceneId }`, `avatar-scene-progress { sceneId, phase: 'audio' | 'upload' |
'render' | 'download' | 'normalize', elapsedSeconds }`, `avatar-scene-ready { sceneId, scene }`,
  `avatar-scene-failed { sceneId, code }`, `avatar-provider-trouble { code, httpStatus? }`. Las claves
  numéricas y de código ya están en `ALLOWED_EVENT_KEYS`; se agrega `dropped`.
- La pantalla de progreso muestra «Avatar 2/3» con el tiempo transcurrido de cada render: HeyGen tarda
  minutos y la barra no puede parecer colgada.
- Desde el editor, el comando `avatar-render-scenes { projectId, sceneIds }` corre el mismo carril
  para esas escenas, con el lease de animación (`withProjectAnimationLease`: las lecturas siguen
  disponibles mientras se guardan recibos). `isProjectBusy` / la admisión del editor lo tratan como a
  `animate-scenes`. Desde la entrega 2d lo lanzan el «Generar» / «Regenerar» del panel y del aviso del
  editor (§11.1), con el costo y el saldo a la vista antes de confirmar.

## 9. Crear: la sección «Avatar»

Una tarjeta debajo de `CreateAnimationSection`, con el mismo estilo (interruptor, ayuda, estimación,
aviso de clave):

- **Interruptor** «Avatar presentador». Apagado = nada viaja en el payload.
- **Avatar y look:** selector del avatar de la biblioteca (§12) con vista previa y nombre, y del look
  (por defecto el principal) entre los que tienen la orientación del formato del proyecto (§6.2);
  enlace «Administrar avatares». Sin avatares, el selector lleva a crearlos; con avatar pero sin un
  look en ese formato, lleva a «Crear escenario» con el formato correcto.
- **Motor:** sin selector. Por decisión del dueño del 2026-10-09, Vimo usa solo Avatar III
  (`AVATAR_DEFAULT_ENGINE = 'avatar_iii'`); el avatar elegido tiene que soportarlo (su look principal
  lo trae en `supportedEngines`). Si algún día vuelven Avatar IV o V, el selector muestra solo los que
  soporta el avatar, con su precio por minuto al lado.
- **Apariciones:** 1–10, por defecto 3. **Segundos por aparición:** 5–60 (7–60 hasta la 2c), por defecto 10.
- **Empieza con el avatar:** casilla, por defecto activa.
- **Total y costo:** con Avatar III, «30 s de avatar ≈ 0,50 USD» para un avatar de foto o de estudio
  (0,99 USD por minuto) y ≈ 0,30 USD para un gemelo digital (0,60 por minuto), con la fórmula
  `apariciones × segundos / 60 × tarifa`. Las escenas de avatar no generan imagen (§6.2): la línea de
  imágenes cuenta solo las escenas libres. El chequeo de saldo compara en dólares solo si
  `avatar-balance` devuelve `currency: 'usd'` (la OpenAPI admite `credits`): con otra moneda muestra
  el saldo sin bloquear.
- **Aviso de moderación** (una línea): no se acepta contenido político, violento o engañoso, ni usar a
  personas reales sin su permiso (`create.avatar.moderationHint`; desde la 2d no nombra al proveedor, §20).
- Sin clave de HeyGen: la tarjeta avisa y enlaza a Claves API; el interruptor queda apagado, y si la
  clave desaparece con Crear abierto el avatar se apaga en el formulario (derivado, no con efecto):
  nunca viaja `options.avatar` sin clave. Crear refresca los looks que siguen procesándose (al volver
  de «Crear escenario») y un look generado conserva la orientación del formato pedido si HeyGen no la
  informa. Durante la fase, un `avatar-provider-trouble` se muestra como aviso pasajero traducido.
- Sin saldo: bloqueo, como con las demás líneas (`useCostCheck` lee el saldo del dominio `avatar`).
  Al reanudar un proyecto con escenas de avatar pendientes, el costo se muestra como techo («necesitás hasta
  X»): la fase relee el saldo antes de cada escena y puede pagar menos. Desde la entrega 2d solo cuenta lo
  que la fase va a pagar: una escena desactualizada no cuenta aunque le falte el clip, y con la fase
  terminada no cuenta nada (§8, §20).
- No se ofrecen avatares que HeyGen perdió (`failed` con `errorCode: 'avatar_group_missing'`, aunque
  sus looks sigan «listos» en disco); `create-video-project` los rechaza igual con ese código, antes
  de pagar nada (ruling del 2026-10-10, tarea 12).

Estado del formulario (`CreateFormValue`): `avatar: SelectedAvatar | null`, `avatarEngine`,
`avatarAppearances`, `avatarSecondsPerAppearance`, `avatarStartsVideo`. Payload: `options.avatar`
(§3.4) con `placement: 'auto'`; `create-video-project` valida rangos y enumerados, copia la vista
previa del look elegido a `<proyecto>/avatar/look.<ext>` y rechaza un look que no sea del avatar, no esté
listo con Avatar III o no tenga la orientación del formato.
La opción «Lo elijo en el editor» (`placement: 'manual'`) aparece en la entrega 3.

**Desde la entrega 2b (QA del dueño del 2026-10-11, §18):**

- **El look es un desplegable.** Debajo de la fila de avatares, un `LabeledSelect` «Look» con los
  looks del avatar que sirven para el formato (`avatarLooksFor`), cada uno con su nombre y, como
  nota, su tipo y «Look principal de tu biblioteca» si es el principal; **el principal va por
  defecto** (ya era así: `defaultAvatarChoice`) y elegir otro cambia la elección. Al lado, la vista
  previa del look elegido en el marco del formato (`AVATAR_LOOK_FRAME_CLASSES`) con el video al pasar
  el mouse, y debajo la descripción de una línea (`create.avatar.lookHint`). Ya no hay grilla de
  looks (superado por la entrega 2c: la grilla vuelve detrás de un botón «Look»; ver «Desde la
  entrega 2c» más abajo).
- **Vistas previas correctas.** La biblioteca solo baja a disco las tres vistas previas de la tarjeta
  (`AVATAR_CARD_LOOK_PREVIEWS`): los demás looks salían con el dibujo de respaldo. Crear completa lo
  que falta con el listado de HeyGen (gratis): `useStockLooks` por avatar mostrado (misma caché que
  el panel de la biblioteca), imagen y video de vista previa remotos cuando no hay archivo en disco.
- **Desde la entrega 2c (QA del dueño del 2026-10-11, tarde, §19) la elección del look cambia otra
  vez: el desplegable de nombres se reemplaza por tarjetas.** Las tarjetas de la fila «Avatar»
  tienen el formato del video (horizontales en 16:9, verticales en 9:16) y muestran el look de ese
  avatar para este video: el elegido en el avatar elegido y el look por defecto en los demás, con su
  imagen (la de disco o la del listado de HeyGen), su video al pasar el mouse (con la espera de
  intención de la biblioteca) y abajo, adentro de la tarjeta, en blanco sobre un degradado oscuro,
  el nombre del look y «+N looks» (los demás looks del avatar). Al montar Crear solo la tarjeta del
  avatar elegido pide el listado de HeyGen (gratis); las demás muestran su look si su vista previa
  está en disco o, si no, la cara del avatar, y piden el listado recién con la intención de mirarlas
  (el mouse quieto encima o el foco visible del teclado). Un avatar sin look para el formato muestra
  su cara con el motivo de siempre. Debajo, un botón «Look» (con flecha, `aria-expanded`) abre y
  cierra la grilla con TODOS los looks del avatar mirado, como estaba antes de la 2b; el botón
  aparece también en un avatar sin look para el formato (con todos sus looks atenuados) y no le pide
  nada a HeyGen hasta abrirse. Cada ficha tiene su vista previa, el video al pasar el mouse, su
  formato (`lookFormatOf`: 16:9, 9:16, 1:1…) y «Principal» en el principal; los del otro formato,
  los que no están listos y los que no tienen Avatar III se ven pero no se eligen (atenuados, con el
  motivo: «Para videos 9:16»), y un look sin orientación en la biblioteca dice «Sin orientación
  confirmada» aunque su chip muestre un formato sacado de las medidas del listado. Las fichas que no se
  eligen siguen enfocables con el teclado (`aria-disabled`) para llegar a su motivo y a su video (superado
  por la entrega 2d: ya no son `aria-disabled`, abren el reproductor y dicen su motivo allí). La grilla
  tiene una altura máxima con scroll; elegir un look lo marca, cierra la grilla, deja el foco en el botón y
  actualiza la tarjeta de arriba (superado por la entrega 2d: tocar una ficha abre su reproductor y «Usar»
  elige; ver abajo). Debajo sigue la línea de ayuda del look (no
  aparece si no hay nada que elegir).
- **Aviso de moderación destacado:** un recuadro `role="note"` con ícono de escudo, el título
  «Normas de contenido» y el texto de siempre, con fondo y borde saffron suaves, en vez de
  una línea gris.
- **El borrador de Crear sobrevive a la navegación.** «Crear escenario», «Administrar avatares»,
  «Crear un avatar» e «Ir a Claves API» sacan de Crear; antes, al volver, el formulario arrancaba
  vacío. Ahora el formulario (`CreateFormValue` y la selección de la otra pestaña) vive también en un
  borrador en memoria del módulo (`src/modules/videos/utilities/createDraft.ts`) que Crear siembra al
  montarse y escribe en cada cambio; se descarta recién cuando el proyecto de una generación ya
  existe (`onProjectCreated` de `startCreation`: un pre-chequeo que frena, una cancelación o un
  `createProject` que falla lo dejan) y al reiniciar la app; en la demo no se guarda, no se lee ni se
  descarta. Los enlaces siguen siendo enlaces (`avatarScenarioPath`): no se abren diálogos de otro
  módulo desde Crear. Un formulario intacto (la semilla con la que Crear se montó, sin borrador) no
  se guarda, así Crear sigue tomando las preferencias y las claves del momento. «Crear otro» y
  cerrar la confirmación de escenas guardan el formulario que vuelven a mostrar (en su manejador, no
  en un efecto) con la misma regla: uno intacto no se guarda. Al restaurar el borrador, lo que
  ninguna pantalla de Crear edita y solo siembra Ajustes (la duración de escena de las gemas y su
  pausa) sale de la preferencia actual. Cerrar sesión no borra el borrador (igual que la tarea en
  curso; un reinicio sí): residual aceptado en una app de escritorio de una sola persona (rulings del
  2026-10-11).
- **Desde la entrega 2d (QA del dueño del 2026-10-11, noche, §20) tocar una ficha de la grilla «Look» ya no
  elige: abre el reproductor del look.** La grilla es una lista de botones (una `ul` con un `li` por look,
  `aria-haspopup="dialog"`; el elegido lleva `aria-current` y dice «Elegido»; deja de ser un `radiogroup`,
  porque un clic ya no elige). Un clic, Enter o Espacio en una ficha abre el `LookPlayerDialog` del módulo
  `avatars` (`CreateLookPlayer`) con el nombre del look, sus chips, su imagen y su video de vista previa (el
  mismo del hover; mientras el listado de HeyGen llega, un spinner, y si no lo trae, «sin video»). Un look
  que sirve abre con la acción `use`: **«Usar»** elige el look, cierra el reproductor y la grilla y deja el
  foco en el botón «Look» (el ya elegido no cambia nada). Un look que no sirve (otro formato, generándose,
  fallido, sin Avatar III, sin orientación confirmada) abre igual y dice por qué con una frase entera, sin
  «Usar»: el reproductor traduce el motivo sin variables, así que tiene su clave por motivo
  (`LOOK_PLAYER_REASON_KEYS`) aparte de las etiquetas de la ficha. Cerrar sin elegir (X, Escape o clic
  afuera) devuelve el foco a la ficha (`returnFocusRef`; tras «Usar» apunta al botón «Look», porque la ficha
  se va con la grilla). El reproductor sigue a lo que se muestra: si cambia el avatar que se mira o se
  deshabilita el formulario, se cierra sin elegir y no se reabre solo al volver. Arranca solo, como en
  Avatares (§12.2).

Estimación (`estimateCreateCost`): línea `{ domain: 'avatar', providerId: 'heygen', unit: 'usd' }`;
`CreditsDomain` gana `'avatar'`, `creditsDomainOf('avatar_…')`, el prefijo `avatar_` en
`insufficient-credits.ts` y una rama `heygen` en `balanceFor` (hoy todo lo que no es `poyo` cae en
Kie: eso es un bug latente para cualquier proveedor nuevo).

## 10. Render, visor y timeline

### 10.1 Render

`collectRenderScenes` agrega, **antes** de los candidatos de Kie, una candidata por escena de avatar
`ready` con clip válido y no desactualizada: `{ id, imagePath: la vista previa del look, startSeconds, endSeconds,
clipPath, clipSeconds, cameraIndex }` (su `imagePath` es la vista previa del look, §6.2). La regla de
solapamiento ya existente descarta cualquier clip de Kie que pise ese tramo (no debería haber: §7.4).
Una escena de avatar sin clip válido o desactualizada renderiza **estática con la vista previa del
look** (con el movimiento de cámara de siempre) y un `warn`: el video nunca queda con un hueco. Desde la
entrega 2d este es también el camino de una aparición que falla (§8, §20): el video sale en vez de frenarse.
**Qué apariciones salen así lo decide una sola regla**, `isAvatarFallback`
(`src/modules/videos/utilities/avatarFallback.ts`): manda lo que pasó en la corrida y, si no, la vista;
cuentan las fallidas y la lista que perdió su clip; una desactualizada no cuenta nunca (su fila dice
«Desactualizada»); una planeada cuenta solo en un proyecto ya hecho (contexto `project`; en la pantalla de
progreso, contexto `progress`, todavía la genera la fase). La comparten la fila de cada aparición, el aviso
del final de Crear, el del reproductor de la biblioteca y el del editor, y el aviso dice cuántas salieron
así y que se regeneran desde el editor. El fundido de 8 cuadros en los bordes de un clip (`transitions.ts`)
aplica igual.

**Subtítulos de una escena de avatar** (`pipeline/stages/render/subtitles.ts`): una línea por frase
de la narración, recortada al tramo de la escena. Desde la entrega 2b (ruling del 2026-10-11) una
frase es de la escena de avatar si el punto medio de su **parte hablada** (de su inicio a
`lastWordEndSeconds`) cae adentro: con el tope de silencio (§5) la última frase de una aparición
puede terminar después de la escena, y medida entera sus palabras no se subtitularían en ningún
lado (el texto de la escena de imagen siguiente no las tiene). Las escenas de imagen no cambian (una
línea con todo su texto).

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
- Miniaturas: el clip animado sigue con sus escenas; el bloque de avatar muestra la **vista previa
  del look** (`avatar/look.<ext>`, §6.2).
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

**Desde la entrega 2d (adelantado de la entrega 3, §20)** el panel de una escena de avatar ya tiene el
«Generar» / «Regenerar», sin «Regenerar fondo» (la escena de avatar no tiene imagen que regenerar, §6.2).
Explica la escena con la nota `avatarSceneHint` y ofrece **Generar avatar** (planeada), **Regenerar avatar**
(fallida, desactualizada —con o sin clip— o lista sin clip) y, con más de una escena de avatar sin clip
válido o desactualizada, **Regenerar todos (N)** (§11.4). Una lista y al día, o una que se está generando,
no ofrece nada. El botón abre una confirmación con la cantidad y el costo (el de Crear, por la duración real
de cada tramo, `avatarSpansCostEstimate`) y el saldo de avatares, que se relee antes de pagar: si no
alcanza, lo dice y «Generar» queda apagado; sin la clave, el aviso de Crear. Confirmar corre
`avatar-render-scenes { projectId, sceneIds }` como una tarea del editor (`startAvatarRender`, con el patrón
de `startRegeneration`): una a la vez con las demás del proyecto —Crear tampoco lanza ni reanuda el pipeline
de ese proyecto mientras tanto: avisa que está ocupado— y cancelable (lo pagado queda en los
recibos y se cosecha sin cobrar), con el avance de los eventos `avatar-scene-*` en el bloque del timeline
(«Generando el avatar…»; las pedidas esperan en cola, sin porcentaje, hasta que su render arranca). Al
terminar se relee el proyecto: el bloque queda listo con su clip o fallido con su motivo, con un aviso
`listo` si todas quedaron listas, y el video exportado queda desactualizado como con cualquier cambio del
editor. Una tecla sostenida no paga dos veces ni cancela lo que acaba de confirmar; al arrancar, el foco va
a la región del avance y, al terminar, vuelve al botón que abrió la confirmación o al panel de la escena,
nunca a `body`. Arriba del editor, el aviso de las apariciones con la imagen fija (§10.1) ofrece
«Regenerarlas (N)» con la misma confirmación (§11.4). El costo de un clip ya pagado que solo hay que volver
a bajar se muestra completo (un techo seguro; marcarlo «recuperable sin costo» queda para la entrega 3).
«Cambiar avatar», «Quitar avatar», «Avatar aquí», mover y estirar siguen en la entrega 3.

### 11.2 Agregar, mover y estirar

- **«Avatar aquí»** en el panel de cualquier escena normal: propone un tramo desde la frase más cercana
  al inicio de la escena con el largo por defecto del proyecto; el usuario lo ajusta y confirma el
  costo. Comando `avatar-insert-scene { projectId, startSeconds, endSeconds, look, engine }`: valida
  frases y mínimo, **inserta** una escena de avatar nueva (id = máximo + 1, el arreglo se mantiene
  ordenado por tiempo), recorta las vecinas parciales y quita las escenas que quedan enteras dentro
  (sus imágenes quedan en disco). Devuelve el detalle nuevo; el render de HeyGen corre aparte.
- **Asas:** estirar un extremo ajusta a la frontera de frase más cercana (el detalle del proyecto trae
  `sentences`), respeta el mínimo (`AVATAR_MIN_APPEARANCE_SECONDS`, 5 s desde la 2d) y mueve tiempo con la
  vecina, como la frontera arrastrable
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
(estática con la vista previa del look) y el panel ofrece «Regenerar» o «Regenerar todos» con el costo
total. Así nunca queda un avatar hablando con los labios de otra narración.

Desde la entrega 2d (§20) esto ya funciona: reanudar NO paga una escena desactualizada aunque le falte el
clip (§8) y se regenera desde el editor, con el costo a la vista. Hay **dos «Regenerar» con alcance
distinto**: el del panel, «Regenerar todos (N)», cuenta todas las escenas de avatar sin clip válido o
desactualizadas; el del aviso de arriba del editor, «Regenerarlas (N)», pide exactamente las que el aviso
cuenta —la regla única `isAvatarFallback` en el contexto `project` (§10.1) y solo escenas con tramo
(`editorFallbackSceneIds`)—, sin las desactualizadas, así que los dos números pueden diferir. El aviso del
editor tiene su propio texto (`library.editor.avatar.fallbackNote`), sin la frase «podés regenerarlas desde
el editor», que ahí sería circular.

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
  `formatUsd`, otra moneda como créditos; se relee al instante y a los 20 s de cada cobro, con un botón para
  los casos especiales; desde la 2d la píldora dice «Saldo · US$ …» y no nombra al proveedor) y los botones
  «Agregar de stock» y «Crear desde foto». Cuadrícula
  de **una tarjeta por avatar**: la cara del look principal anclada arriba (`aspect-[4/5]`) y, si
  hay otros looks con vista previa, dos miniaturas a la derecha; chips del tipo y de **Avatar III**
  (el único motor que Vimo usa por ahora) o «No compatible con Vimo»; el entrenamiento se muestra sin
  nombrar al proveedor («Vimo está entrenando el motor de tu avatar…») y un fallo muestra el mensaje
  de su código. Un clic abre el **panel del avatar**: la cara grande, el origen, sus looks con «Look
  principal» y «Usar como principal», la tarjeta **«Crear escenario»** (solo en avatares propios:
  descripción de hasta 1000 caracteres, formato, hasta 3 imágenes de referencia, el costo sin cifra
  —HeyGen no la publica— con el saldo al lado y el aviso de que repetir la misma descripción
  devuelve el mismo look) y quitar en dos pasos (superado por la 2d: el menú de eliminar, abajo). «Agregar
  de stock» navega como HeyGen en dos
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
- **Desde la entrega 2b (QA del dueño del 2026-10-11, §18):**
  - **Filtros por categoría del stock público**, como los de HeyGen: «Todos», «Profesional»,
    «Estilo de vida», «Comunidad» y «Favoritos» (chips `FilterChips`, además de los de género y la
    búsqueda; solo en «De stock»). HeyGen no expone sus categorías por la API (§18), así que Vimo las
    deriva del tipo de look: «Profesional» = avatares de estudio (`studio_avatar`), «Comunidad» =
    gemelos digitales compartidos (`digital_twin`), «Estilo de vida» = los demás (avatares de foto).
    La clasificación la da el subcomando **`avatar-stock-types`** (§18): dos barridas de
    `GET /v3/avatars/looks?ownership=public&avatar_type=…` (gratis, ~45 pedidos, ~20 s, en paralelo)
    que devuelven los ids de grupo de estudio y de gemelo, con caché de 24 h en
    `<projectsRoot>/avatars/.stock-types.json` (el listado de la biblioteca ignora los nombres que
    no son un id). Una barrida que no devuelve ningún grupo de ningún tipo no se guarda en caché (un
    `data: []` pasajero no deja los filtros vacíos un día entero) y sirve la caché que haya; en la app,
    una clasificación vacía cuenta como no disponible y se vuelve a pedir al reabrir el stock
    («Clasificando…» mientras llega). Mientras clasifica, los chips se pueden tocar y la grilla dice
    «Clasificando los avatares del stock…»; si falla, lo dice y «Todos» sigue andando. «Favoritos»
    son los avatares marcados con el corazón de la tarjeta, guardados en esta máquina (store
    `avatars.json` de la app, clave `stockFavorites`, ids de grupo), con las escrituras en fila y una
    relectura del store cuando la fila se vacía tras un fallo. Vimo nunca borra un favorito por su
    cuenta: uno que el listado completo de HeyGen no trae solo se oculta y, en la sesión, deja de
    contar para la auto-carga (HeyGen corre su listado entre páginas: «no vino» no prueba que ya no
    exista). Con cualquier filtro activo (categoría, género,
    favoritos o búsqueda), la grilla pide páginas sola hasta mostrar al menos
    `STOCK_FILTER_MIN_VISIBLE` = 12 tarjetas o llegar a la última («Buscando más avatares…» al pie):
    un filtro con pocas coincidencias no deja la grilla vacía. «UGC» no se ofrece: la API no lo
    distingue.
  - **Video al pasar el mouse, siempre que exista.** El listado de grupos trae `preview_video_url`
    en 1273 de 1417 avatares públicos, pero no en los primeros de la lista (Dante, Brody, Hayes…):
    cuando el grupo no trae video, la tarjeta pide sus looks (`useStockLooks`, la misma caché que el
    segundo nivel) y reproduce el del **look de portada**: el look cuya `previewImageUrl` es la
    portada del grupo o, si ninguno coincide, el primero con video. Los pide recién cuando la persona
    se detiene en la tarjeta (`useHoverIntent`: el mouse quieto `HOVER_FETCH_DELAY_MS` = 250 ms, o el
    foco visible del teclado al instante), así cruzar la grilla no lanza un pedido por tarjeta.
  - **La tarjeta de la biblioteca** reproduce al pasar el mouse el video de **cada** una de sus
    imágenes (la principal y las dos miniaturas), cada una el suyo, con los looks remotos del avatar
    (`useStockLooks`, con la misma espera de intención); el mosaico llena la tarjeta sin huecos; debajo, el nombre con
    el contador de looks y el botón de quitar en la misma fila, y los chips (tipo, Avatar III o «No
    compatible») en una fila compacta, sin espacio vacío. Las tarjetas de una misma fila miden lo
    mismo (la grilla mide cada fila por su tarjeta más alta, sin `auto-rows-fr`, y cada tarjeta llena
    su fila), así una tarjeta con el estado del entrenamiento no deja escalones ni estira las demás
    filas. Quitar un favorito desde «Favoritos» con el teclado deja el foco en el corazón de la
    tarjeta vecina (o en el chip «Favoritos» si no queda ninguna), nunca en la caja del diálogo.
  - **Entrega 2c (QA del dueño del 2026-10-11, tarde, §19).** La pestaña de los avatares propios se llama
    «Mis avatares» (antes «Mis avatares en HeyGen»: es obvio que son de HeyGen). Los borrados que describe
    esta viñeta —el tacho de dos pasos de esa pestaña y el «Quitar» → «Seguro» de la tarjeta y del panel de
    la biblioteca— los reemplaza el menú de eliminar de la entrega 2d (abajo); lo demás (el subcomando, el
    404, las guardas de tecla sostenida y doble clic, un borrado a la vez, el foco) sigue. En esa
    pestaña, cada tarjeta trae un botón (un tacho, arriba a la izquierda) para **eliminar el avatar
    de HeyGen de verdad**: aparece con el mouse o el foco, pide confirmación en dos pasos («Eliminar
    de HeyGen» → «¿Eliminar para siempre?», con la explicación de que se borra de la cuenta de
    HeyGen con todos sus looks, no se puede deshacer y, si está en la biblioteca, sale también de
    ahí) y llama al subcomando `avatar-heygen-delete` (`DELETE /v3/avatars/{group_id}`, gratis;
    HeyGen no deja borrar grupos públicos ni de la comunidad). El subcomando valida el id
    (`[a-zA-Z0-9_-]`, hasta 128) antes de llamar y, solo cuando HeyGen confirma, quita las entradas
    de la biblioteca de ese grupo; si HeyGen falla, no toca nada. Un 404 de HeyGen (ya no estaba) y
    un 2xx sin cuerpo cuentan como borrado. Nunca aparece en «De stock». Reglas de la confirmación
    (cada una la fija el guard de la biblioteca): ni el segundo clic de un doble clic ni una **tecla
    sostenida** (Enter o Espacio) confirman, y las dos guardas valen también en los otros dos
    borrados en dos pasos del módulo, «Quitar» → «Seguro» de la tarjeta de la biblioteca y del
    panel: el primer gesto arma; soltar y volver a apretar, o un clic aparte, confirma. Salir de la
    tarjeta, sacarle el foco o tocarla cancela (tocarla no abre los looks). Ya armado, el botón se
    llama como su texto visible («¿Eliminar para siempre?»; «Eliminando…» mientras borra), sin
    `aria-label`, y lo describen el avatar y la explicación. El diálogo hace un borrado a la vez y
    nunca junto a un alta, y no se cierra (Escape, clic afuera ni la X) mientras el borrado está en
    vuelo; al lograrlo, la tarjeta sale en el acto, se relee la cuenta y el foco del teclado pasa al
    tacho vecino o a la pestaña. Cada ficha de look (segundo nivel del stock, panel del avatar y
    reproductor) muestra su **formato** (`lookFormatOf`: 16:9, 9:16, 1:1, 4:5 o 5:4; manda la
    orientación de HeyGen, que decide en qué videos sirve el look; sin ella, el formato más cercano
    a las medidas de la imagen; sin datos, sin chip) en lugar de «Vertical»/«Horizontal»/«Cuadrado».
  - **Fichas parejas y un reproductor por look.** Las fichas de looks siguen todas del mismo tamaño
    (`aspect-[4/5]`, recorte anclado arriba) sea el look vertical u horizontal; un clic en una ficha
    abre el **reproductor del look** (`LookPlayerDialog`, como el modal de HeyGen): el nombre, sus
    chips, el video entero en su formato real sobre un escenario oscuro con la imagen desenfocada de
    fondo, un botón grande de reproducir (arranca solo, desde la entrega 2d: con sonido o, si el navegador
    no lo deja, silenciado y con «Activar el sonido»; en la 2b esperaba un clic), y la barra con
    reproducir/pausar, la línea de tiempo, el tiempo, silenciar, la velocidad (0,5×, 1×,
    1,5×, 2×) y pantalla completa si el navegador la permite. El pie depende de dónde se abre: en el
    stock, «Cargar a la biblioteca» (agrega el avatar con ese look como principal y abre su panel;
    el antiguo «Agregar con «look»» del pie desaparece y las fichas ya no se seleccionan) o, si el
    avatar ya está en la biblioteca, «Abrir en tu biblioteca»; en el panel de un avatar, «Usar como
    principal» (o «Es el look principal de este avatar.»); un look no compatible o que todavía se
    genera lo dice y no ofrece acción. Las vistas previas al pasar el mouse siguen mudas.
  - **Entrega 2d (QA del dueño del 2026-10-11, noche, §20).**
    - **El reproductor arranca solo** (R-2d-1) en los tres lugares donde se abre (segundo nivel del stock,
      panel del avatar y Crear): al montarse con video llama a `play()` con sonido; si el navegador lo
      rechaza por su política de reproducción automática (`NotAllowedError`), lo silencia, el botón de
      sonido pasa a «Activar el sonido» y reintenta; otro rechazo (un video que no carga, un `AbortError`)
      no lo silencia ni reintenta, y si tampoco arranca silenciado queda en pausa con el sonido de vuelta y
      el botón grande; una respuesta que llega con el reproductor ya cerrado no toca el video. El video que
      llega después (el panel espera la lista de looks) también arranca solo. Pausar, la línea de tiempo, la
      velocidad, la pantalla completa y Escape siguen igual, y las vistas previas al pasar el mouse siguen
      mudas. La lógica vive en `useLookPlayback`.
    - **El botón de eliminar ofrece dos opciones** (R-2d-2), en un componente propio (`AvatarDeleteMenu`,
      con su estado en `useAvatarDeleteMenu`) que usan la tarjeta y el panel de la biblioteca y «Mis
      avatares» (ahí arriba a la izquierda de la imagen, con el mouse o el foco). **«Eliminar de la lista»**
      saca el avatar de la biblioteca de Vimo sin otro paso (`avatar-delete`; sigue en HeyGen y se puede
      volver a agregar; aviso «{{name}} salió de tu lista.»). **«Eliminar permanentemente de HeyGen»** (en
      rojo; solo en un avatar propio, `ownership === 'own'`) se vuelve **«Seguro»** en su mismo lugar, con
      «Este avatar se eliminará también de HeyGen. ¿Seguro?» y «Cancelar» en el lugar de la lista, y recién
      ahí llama a `avatar-heygen-delete { groupId, name }` (aviso «{{name}} se eliminó de tu lista y de
      HeyGen.»; sale de la biblioteca y de «Mis avatares»). Los lugares importan: la revisión midió que con
      «Seguro» donde estaba «Eliminar de la lista» un clic de corrección borraba para siempre, así que sobre
      la imagen la columna se apoya abajo y en el panel las opciones son dos celdas iguales. En «Mis
      avatares», «Eliminar de la lista» aparece solo si el avatar está en la biblioteca; un avatar de stock
      en la biblioteca solo tiene la lista.
    - **Las guardas de la 2c siguen y se suman otras.** Ni una tecla sostenida ni el segundo clic de un
      doble clic confirman, ni abren lo que queda debajo (la imagen y el nombre de la tarjeta, la tarjeta de
      «Mis avatares»); sacarle el foco, Escape, «Cancelar», volver a tocar el botón, tocar el velo o salir
      de la tarjeta lo cancelan, y el diálogo del stock no se cierra con un borrado de HeyGen en vuelo.
      Nuevo: al abrir, el foco entra a la primera opción (el mousedown nunca lo mueve dentro del menú, así
      se comporta igual en WebKit, donde un clic no enfoca un botón) sin desplazar la grilla
      (`preventScroll` en todo foco del menú: con una opción a medias a la vista el navegador la traería
      entera y «Seguro», más bajo, caería sobre la lista) y Escape cierra solo el menú y no el
      diálogo de atrás; en la biblioteca hay un borrado de HeyGen a la vez (con uno en vuelo, el botón de
      eliminar de las demás tarjetas y del panel queda apagado) y, tras «Eliminar de la lista», el foco del
      teclado pasa a la tarjeta vecina o, con la biblioteca vacía, a «Agregar de stock». Mientras elimina de
      HeyGen el botón dice «Eliminando…» (en la tarjeta de la biblioteca, un spinner con el texto para el
      lector de pantalla, y la tarjeta apagada).
    - **El saldo y los títulos no nombran al proveedor** (§13, R-2d-3): la píldora del saldo dice «Saldo ·
      US$…» y el diálogo del stock se titula «Agregar un avatar» (con las pestañas «De stock» y «Mis
      avatares»).

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
| `create.errors.*` (entrega 2)   | la familia `avatar_*` que aparece en pleno pipeline (§14); los códigos de la biblioteca de la entrega 1 ya viven en `avatars.errors.*`                                                             |

**Desde la entrega 2d (§20)** se suman estas claves, y los textos de avatares dejan de nombrar al proveedor:

- `avatars.*`: `eliminar.*` (`boton`, `botonAria`, `opcionesAria`, `deLista`, `deHeygen`, `confirmarHeygen`,
  `seguro`, `cancelar`, `eliminando`), `reproductor.usar` y `usarHint`, `saldo.etiqueta`,
  `toasts.eliminadoLista` y `toasts.eliminadoHeygen` (texto nuevo).
- `create.avatar.*`: `lookOpenAria`, `selectedLook` y `otherFormatHint`, `failedLookHint` y
  `unknownOrientationHint` (las tres últimas son las frases del pie del reproductor de Crear para un look
  que no sirve: el reproductor traduce el motivo sin variables).
- `create.progress.*`: `avatarFallback_one` / `_other` (el aviso de las apariciones con la imagen fija) y
  `avatarStale` («Desactualizada», la fila de una aparición desactualizada).
- `library.editor.avatar.*`: `generar`, `regenerar`, `regenerarTodos`, `regenerarAviso`, `costo`, `saldo`,
  `saldoInsuficiente`, `confirmarTitulo`, `confirmarTexto_one` / `_other`, `confirmar`, `cancelar`, `listo`,
  `fallo` y `fallbackNote_one` / `_other` (el aviso de arriba del editor, sin la frase circular);
  `library.editor.panel.avatarSceneHint` reemplaza a `avatarScene`.
- **Sin el nombre del proveedor (R-2d-3).** Ningún texto visible de avatares, Crear, progreso, editor ni
  errores nombra a HeyGen («el servicio de avatares», «tu saldo de avatares», «la clave del avatar
  presentador»), salvo `apiKeys.categoria.avatar` (en Claves API el nombre identifica la clave) y las claves
  del borrado en HeyGen (`avatars.eliminar.deHeygen`, `avatars.eliminar.confirmarHeygen` y
  `avatars.toasts.eliminadoHeygen`). El guard `check-avatar-texts-without-provider.mjs` lo exige en los tres
  catálogos, con una lista permitida de esas cuatro claves. Las citas de textos de pantalla de esta spec ya
  son las vigentes.
- **Claves borradas** (nueve por idioma): `library.editor.panel.avatarScene`, `avatars.tarjeta.eliminar` y
  `confirmar`, `avatars.toasts.eliminado` y `avatars.stock.eliminarHeygen`, `eliminarHeygenAria`,
  `eliminarConfirmar`, `eliminando` y `eliminarHint`: el menú de eliminar reemplazó al tacho de dos pasos y
  al «Quitar» → «Seguro».

## 14. Errores

| Código                             | Cuándo                                                                                                            | Qué ve el usuario / qué hace Vimo                                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `avatar_invalid_key`               | 401                                                                                                               | Revisar la clave en Claves API                                                                                                    |
| `avatar_insufficient_credits`      | saldo < estimado (pre-chequeo) o rechazo por saldo                                                                | Pausa con recarga (patrón de voz/imágenes)                                                                                        |
| `avatar_rate_limited`              | 429, o 409 `request_in_progress`                                                                                  | Espera y reintento (3 veces); el 409, sin cambiar el pedido                                                                       |
| `avatar_look_unsupported`          | 400 por motor/look (`param: engine` o `avatar_id`)                                                                | Elegir otro motor o avatar                                                                                                        |
| `avatar_moderation_rejected`       | `failure_code` de moderación                                                                                      | Explica la política; no se cobra                                                                                                  |
| `avatar_render_failed`             | otro `failure_code`                                                                                               | Reintentar; no se cobra                                                                                                           |
| `avatar_timeout`                   | plazo vencido                                                                                                     | El recibo queda pendiente; lo cosecha sin pagar el «Regenerar» del editor (reanudar, solo si la fase no terminó)                  |
| `avatar_download_failed`           | descarga inválida o URL vencida sin reemplazo                                                                     | Reintentar (vuelve a pedir la URL)                                                                                                |
| `avatar_network`                   | red / 5xx tras reintentos                                                                                         | Reintentar                                                                                                                        |
| `avatar_incomplete`                | hasta la 2c: la fase terminó con escenas sin clip; desde la 2d no la lanza                                        | Heredado: un proyecto detenido con este error antes de la 2d se reanuda y retoma lo que falta                                     |
| `avatar_sentences_unavailable`     | sin `words.json` al planificar o insertar                                                                         | Transcribir primero                                                                                                               |
| `avatar_invalid_request`           | otro 4xx de HeyGen que no es de look ni de moderación                                                             | «El servicio de avatares respondió algo inesperado»; reintentar en un rato                                                        |
| `avatar_provider_error`            | 200 con un cuerpo que no tiene la forma esperada                                                                  | Ídem: «El servicio de avatares respondió algo inesperado»                                                                         |
| `avatar_photo_invalid`             | la foto no se lee, no es JPG/PNG (WEBP no) o supera los 12 MB                                                     | El mensaje de la foto: elegir otra (se valida antes de subirla, sin costo)                                                        |
| `avatar_not_found`                 | el id del avatar ya no está en la biblioteca                                                                      | «Ese avatar ya no está en tu biblioteca»                                                                                          |
| `avatar_training_failed`           | HeyGen no pudo entrenar el avatar desde la foto                                                                   | La ficha queda `failed` con «probá con otra foto»                                                                                 |
| `avatar_main_look_not_ready`       | «Crear escenario» sobre un avatar sin look principal listo                                                        | «El avatar todavía no tiene un look principal listo»; sin hablar con HeyGen                                                       |
| `avatar_no_compatible_look`        | el avatar no tiene ningún look listo con Avatar III                                                               | «Este avatar no tiene ningún look listo compatible con Vimo (Avatar III)»                                                         |
| `avatar_group_missing`             | HeyGen responde 404 por el grupo del avatar al refrescar                                                          | La ficha queda `failed`: «El servicio de avatares ya no tiene este avatar. Quitalo…»                                              |
| `avatar_look_not_listed`           | look por prompt aceptado sin `avatar_item` y aún sin listar                                                       | «El servicio de avatares recibió el pedido…»; la vista lo vuelve a buscar a los 20 s                                              |
| `avatar_look_unavailable`          | al crear: el look no es del avatar, no está listo con Avatar III o no tiene vista previa (ni la del avatar)       | Elegir otro look; texto en `create.errors.*` (entrega 2)                                                                          |
| `avatar_look_orientation_mismatch` | al crear: el look no tiene la orientación del formato                                                             | Crear un look en ese formato («Crear escenario»); `create.errors.*`                                                               |
| `avatar_timing_locked`             | mover la frontera de una escena de avatar con clip o recibos                                                      | Como `animation_timing_locked`; `create.errors.*` (mismo precedente que `animation_timing_locked`; la biblioteca lo hereda)       |
| `avatar_scene_without_image`       | pedir prompt, descripción, personajes, modelo o calidad de imagen de una escena de avatar                         | No se ofrece en la UI; el sidecar saltea la escena en pedidos mixtos; `library.errors.*`                                          |
| `avatar_render_look_unavailable`   | al renderizar o exportar: la escena de avatar no tiene clip usable ni vista previa del look (`avatar/look.<ext>`) | «Volvé a elegir el look en la biblioteca o regenerá el avatar»; `create.errors.*` y `library.errors.*` (ola final del 2026-10-10) |

Reglas del carril fijadas en la ola final del 2026-10-10 (ver §7.2): un rechazo que llega después de
un `409 request_in_progress` de la misma cadena deja el recibo `ambiguous` (`sawRequestInProgress`),
igual que un 408 o 425 en una repetición; la fase no vuelve a pedir sola un render cuyo último intento
`failed` del mismo pedido fue `avatar_moderation_rejected` o `avatar_look_unsupported` (la escena queda `failed` con ese código —en un proyecto de antes de la 2d, la cabecera dice que el video sale con su imagen fija—; desde el editor sí se repite, `retryFinalRejection`); si el código dominante de la fase es de la cuenta
(`avatar_invalid_key`, `missing_api_key`, `avatar_insufficient_credits`) la fase lanza ese código —desde la
2d cualquier otro fallo de escena la deja terminar (§8), así que `avatar_incomplete` ya no se lanza—, y un
código de cuenta gana aunque otra escena haya sido rechazada; el saldo se
compara en millonésimas de dólar; `create-video-project` hace un pre-vuelo de la cuenta cuando el
proyecto lleva avatar (401/403 → `avatar_invalid_key`; sin clave → `missing_api_key`; red, 429 o
plazo corto vencido → aviso y sigue; el saldo no frena).

Mapeo en `pipeline/providers/avatar/heygen-errors.ts` (puro, testeable). El orden importa: el saldo
se mira antes que el status, el `param` de look (`avatar_id`, `engine`, `avatar_group_id`) antes que
la moderación (un «not allowed» sobre un `avatar_id` es «ese tipo de avatar no sirve», no un rechazo
de contenido), y todo otro 4xx es `avatar_invalid_request`: solo desde el 500 es `avatar_network`
(«revisá tu conexión»). `avatar_photo_invalid` tampoco admite WEBP aunque Vimo lo reconozca como
imagen: `POST /v3/assets` de HeyGen solo acepta png y jpeg entre las imágenes. Textos: en la
entrega 1, los de la biblioteca viven en `avatars.errors.*`; los códigos que aparecen en pleno
pipeline (entrega 2) van en `create.errors.*`, el patrón real de `animation_*` (los de la biblioteca de la
entrega 1 siguen en `avatars.errors.*` y se reutilizan por clave).

## 15. Pruebas y QA

**Guards provisorios** (`scripts/test/`, node:test + esbuild, como `check-timeline-layout.mjs`):

- `check-narration-sentences.mjs`: modo con `sentenceEnd`, modo por pausas, partición de frases
  largas, contigüidad 0→fin, cuantización.
- `check-avatar-planner.mjs`: `fit` (más cerca del objetivo, mínimo 5 desde la 2d y 7 antes, máximo 60),
  primera aparición
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
  el saldo). El mapeo de `failure_code` de los videos se suma en la entrega 2.
- **Desde la entrega 2d:** `check-editor-avatar-regenerate-ui.mjs` (el «Generar» / «Regenerar» del editor
  con el panel, la pista y el store reales y el sidecar simulado: botones por estado, confirmación con costo
  y saldo, ids exactos, cola y avance, cancelar, tecla sostenida, foco, el aviso de arriba y Crear esperando
  al editor con su store real) y
  `check-avatar-texts-without-provider.mjs` (ningún texto de los catálogos nombra al proveedor fuera de la
  lista permitida); y ampliados `check-create-avatar-ui.mjs` (el reproductor y «Usar»),
  `check-avatar-library-ui.mjs` (el menú de eliminar y el arranque automático), `check-avatar-stage.mjs` (la
  fase que termina con una fallida, la desactualizada que no se paga, reanudar),
  `check-avatar-progress-ui.mjs` (la regla única y los avisos) y los del planificador,
  `create-video-project` y el modelo de escena (mínimo de 5 s, `stale` en una lista sin clip).

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
2. **Avatar en el video**: §3–§10 desde Crear (planificador, pines, carril, fase, sección,
   render, visor, bloque morado con el diseño nuevo también en el clip animado, desactualizado al
   cambiar la narración). Fronteras del avatar bloqueadas.
3. **Avatar desde el editor**: §11 (panel, «Avatar aquí», asas con ajuste a frases, regenerar,
   quitar, `placement: 'manual'`); el «Generar» / «Regenerar» del panel y del aviso ya llegó con la 2d
   (§20).

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

La entrega 2b (ajustes de la QA del dueño del 2026-10-11 a la entrega 2: §5 pausas y frase más
cercana que cabe, §9 desplegable de looks, vistas previas, aviso destacado y borrador de Crear, §12.2
filtros, favoritos, video al pasar el mouse y reproductor del look; hechos en §18) va entre la 2 y la
3, con su plan `plan-e2b.md` (interno).

La entrega 2c (QA del dueño del 2026-10-11, tarde: las tarjetas de Crear con el formato del video y
el botón «Look» en §9, eliminar de HeyGen y el formato de los looks en §12.2, el título del render
en §7.1 y el coral legible; hechos y rulings en §19) va después de la 2b y antes de la 3, con su plan
`plan-e2c.md` (interno).

La entrega 2d (QA del dueño del 2026-10-11, noche: el reproductor de Crear con «Usar» en §9, los textos sin
el nombre del proveedor en §13, eliminar de la lista o de HeyGen y el reproductor que arranca solo en §12.2,
una aparición que falla y la desactualizada que no se paga sola en §8, el mínimo de 5 s en §3.4 y «Generar»
/ «Regenerar» desde el editor en §11; hechos y rulings en §20) va después de la 2c y antes de la 3, con su
plan `plan-e2d.md` (interno). Adelanta de la 3 el «Generar» / «Regenerar» / «Regenerar todos» del editor (§11.1 y
§11.4).

Cada entrega tiene su plan, su ejecución con subagentes y su QA del dueño; el push y el PR siguen
pidiendo su aprobación cada vez.

## 17. Riesgos y sondas

Cuatro dudas solo se resuelven con la clave del dueño, dentro de la entrega 1, avisándole el costo
antes (las tres primeras, con renders reales: menos de 1 USD en total, tres videos de 7 s; la
cuarta, hasta 1,32 USD):

1. **Avatar de foto + fondo de imagen — respondida el 2026-10-10 (cinco renders de 7 s, 0,58 USD):**
   sin `remove_background`, HeyGen NO reemplaza el fondo: la foto entera (rectángulo blanco, a todo el
   alto, centrada) queda sobre nuestra imagen, que solo rellena los costados. Con
   `remove_background: true` recorta a la persona y la compone sobre nuestro fondo, bien, en 16:9 y en
   9:16. `output_format: 'webm'` trae alfa de verdad (`ALPHA_MODE=1`, `yuva420p` con `libvpx-vp9`,
   máscara limpia): la composición propia queda disponible para el sub-proyecto 3. El recorte
   funciona en los tres tipos de look probados: foto propia («SEBAS AVATAR»), estudio de stock
   (`Daphne_public_1`, solo Avatar III) y foto de stock con fondo propio («Dante Office 2»), en
   94–105 s. Siete renders en total, 0,81 USD (saldo 3,68 → 2,87).
   **Nota del 2026-10-10 15:13:** el dueño descartó el fondo generado por Vimo (§6.2): el look se
   renderiza con su propio fondo y estas mediciones de composición quedan como dato de reserva;
   siguen valiendo el costo por minuto, los tiempos y que 7 s de audio dan 7,000 s de video.
2. **Encuadre en 16:9 — respondida el 2026-10-10:** `fit: 'contain'` y omitirlo dan el mismo cuadro
   con un look vertical (avatar a todo el alto, centrado); `fit` se omite.
3. **Saldo — respondida el 2026-10-09 (sonda gratis con la clave del dueño):** `GET /v3/users/me`
   devuelve `data.billing_type: "wallet"` y `data.wallet: { currency: "usd", remaining_balance,
auto_reload }`; no vienen `subscription` ni `usage_based`. La validación de la clave (entrega 1b)
   lee `wallet.remaining_balance` y lo muestra en dólares; `balanceFor` (entrega 2) usa el subcomando
   `avatar-balance`. Una cuenta sin billetera valida igual, sin saldo.
4. **Cobro de un entrenamiento fallido:** si un avatar desde foto que termina `failed` se cobra
   (1,32 USD) o HeyGen lo devuelve. Hasta saberlo, el texto del precio en «Crear desde foto» solo
   dice cuánto cuesta (`avatars.foto.precio.detalle`: «por avatar · se descuenta de tu saldo de avatares»;
   la propuesta de la 1b nombraba a HeyGen) y no promete que
   un rechazo no se cobre. Se sondea con una foto sin cara, mirando el saldo antes y después (la
   sonda 3 dice cómo leerlo).

Otros riesgos aceptados: los renders tardan minutos (la UI lo muestra con tiempo transcurrido);
`punctuate` de Deepgram se verifica en la primera transcripción de la entrega 2 (si no viniera
`punctuated_word`, el modo por pausas cubre); los términos de HeyGen sobre «autorizar a terceros» los
asume el dueño hasta tener su visto bueno por escrito; la salida con alfa (`webm`) y la composición
propia quedan para el sub-proyecto 3, con el mismo audio cortado y el mismo fondo ya guardados.

## 18. Entrega 2b — la QA del dueño del 2026-10-11

Pedidos del dueño (2026-10-11, 01:2x y 01:5x, con capturas de HeyGen y de Vimo) y lo decidido para
cada uno. Hechos verificados con dos sondas gratis (solo `GET`) con la clave del dueño el 2026-10-11
entre las 01:28 y las 01:36 (`heygen-probe.mjs` y `heygen-probe-2.mjs`, en el scratchpad de la
sesión; no se guardan en el repo):

- `GET /v3/avatars?ownership=public&limit=50`: **1417 grupos en 29 páginas (45 s)**; 1273 traen
  `preview_video_url` y 1417 `preview_image_url`; `looks_count` suma 25 098. Los primeros de la lista
  (Dante 27 looks, Brody 31, Hayes 33, Lasse 23, Julian 30, Fintan 25…) **no traen video de grupo**:
  por eso la tarjeta del stock no se movía al pasar el mouse. `gender` llega como `male`/`female`
  (129), `Man`/`Woman` (1271), `Unspecified` (1) o ausente (16). El listado de grupos **no trae
  tipo, tags ni categoría**.
- `GET /v3/avatars/looks?ownership=public&limit=50` sin filtro: 4000 looks en 80 páginas (53 s) y
  quedaban más; todos `photo_avatar`, todos con `tags: []`, 3987 con video; 3441 horizontales
  (1920×1080) y 559 verticales; cubren 189 grupos, y en 119 de ellos la portada del grupo es la
  imagen de uno de sus looks.
- Con `avatar_type=studio_avatar`: **1257 looks en 26 páginas (18 s), 157 grupos**, todos con video,
  tags `AvatarTags.NEW` (1148); con `avatar_type=digital_twin`: **818 looks en 17 páginas (14 s),
  708 grupos**, tags `AvatarTags.AVATAR_IV` y `AvatarTags.FOURK` (112). Todos soportan `avatar_iii`.
  Los demás grupos (≈ 552) son avatares de foto.
- Las vistas previas públicas son URLs estables del CDN (`resource2.heygen.ai/public-avatars/…`),
  con `Range` (206); la portada de Hayes pesa 2 MB (JPEG).
- La OpenAPI v3 no tiene favoritos ni categorías: las rutas de avatares son `GET/POST /v3/avatars`,
  `GET/PATCH/DELETE /v3/avatars/{group_id}`, `POST …/consent`, `GET/POST /v3/avatars/looks`,
  `GET /v3/avatars/look-templates`, `GET/PATCH/DELETE /v3/avatars/looks/{look_id}` y el avatar en
  tiempo real.

| Pedido del dueño                                                                                                                                        | Decisión                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| «Aplicá» los dos del planificador (frase casi muda; frase de más de 60 s cerca del ancla)                                                               | §5: la aparición se arma desde la frase más cercana al ancla **desde la que cabe**; y una aparición nunca carga más de `AVATAR_MAX_PAUSE_SECONDS` = 2 s de silencio tras la última palabra de una frase (`lastWordEndSeconds` en `NarrationSentence`).                                                                                                                               |
| «Crear escenario» saca de Crear y pierde el formulario                                                                                                  | §9: borrador de Crear en memoria del módulo, sembrado al montar y escrito en cada cambio; se descarta cuando el proyecto existe y al reiniciar; nunca en la demo. Los enlaces siguen siendo enlaces.                                                                                                                                                                                 |
| Los filtros de HeyGen (All, Professional, Lifestyle, UGC, Community, Favorites) funcionales en los públicos                                             | §12.2: «Profesional» = estudio, «Estilo de vida» = foto, «Comunidad» = gemelos, por `avatar-stock-types` (barrida por tipo con caché de 24 h); «Favoritos» locales con corazón; **«UGC» no se ofrece** (la API no lo distingue de los demás avatares de foto). Las categorías son una aproximación por tipo de look: no es la clasificación interna de HeyGen, que la API no expone. |
| Todos los looks del mismo tamaño de ficha aunque sean verticales                                                                                        | §12.2: ya era así (`aspect-[4/5]`, recorte anclado arriba); se mantiene, y el video entero se ve en el reproductor.                                                                                                                                                                                                                                                                  |
| Al hacer clic en el avatar (el look), un modal como el de HeyGen con el video, la línea de tiempo y un botón «Cargar…»                                  | §12.2: `LookPlayerDialog` con reproductor propio; en el stock el botón dice «Cargar a la biblioteca» (o «Abrir en tu biblioteca»), en el panel «Usar como principal».                                                                                                                                                                                                                |
| Al pasar el mouse por la imagen del avatar del stock, que se mueva (la portada)                                                                         | §12.2: cuando el grupo no trae video, el del look de portada, pedido al primer hover.                                                                                                                                                                                                                                                                                                |
| En la tarjeta de la biblioteca, que cada una de las tres imágenes se mueva al pasar el mouse                                                            | §12.2: video por imagen, con los looks remotos del avatar.                                                                                                                                                                                                                                                                                                                           |
| La tarjeta tiene un espacio blanco; recortarla y ordenar las etiquetas                                                                                  | §12.2: mosaico sin huecos, quitar en la fila del nombre, chips compactos.                                                                                                                                                                                                                                                                                                            |
| Con el interruptor de avatar, Crear no muestra las vistas previas de los looks; el look como desplegable con el principal por defecto y una descripción | §9: desplegable «Look» con el principal por defecto, vista previa remota cuando no hay archivo en disco, descripción de una línea.                                                                                                                                                                                                                                                   |
| Resaltar el aviso de moderación                                                                                                                         | §9: recuadro destacado con título e ícono.                                                                                                                                                                                                                                                                                                                                           |

Lo que **no** entra en la 2b: «UGC»; reproducir con sonido en las vistas previas al pasar el mouse;
clasificar por escena (oficina, cocina…) a partir de los nombres de los looks; el reproductor en el
selector de Crear (ahí alcanza la vista previa con video al pasar el mouse).

## 19. Entrega 2c — la QA del dueño del 2026-10-11 (tarde)

Pedidos del dueño tras el cierre de la 2b (con una captura de la tarjeta del avatar en Crear) y
lo decidido. Los hechos de HeyGen salen de la OpenAPI v3 descargada el 2026-10-11:
`DELETE /v3/avatars/{group_id}` «borra para siempre un grupo y todos sus looks; no se pueden borrar
grupos públicos ni de la comunidad» (200 con `{ data: { id } }`; 400, 401, 404 y 429); los looks
traen `image_width` e `image_height`.

| Pedido del dueño                                                                                                                                                                                                                                                       | Decisión                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La tarjeta del avatar en Crear con el formato del look elegido (no vertical si el look es 16:9), el nombre del look abajo en blanco y los looks restantes; el look como un botón «Look» que despliega las tarjetas de todos los looks con su vista previa y su formato | §9: tarjetas de la fila en el formato del video con overlay; botón «Look» que abre la grilla de todos los looks, con formato, y los del otro formato visibles pero no elegibles           |
| Un botón en «Mis avatares» que elimine el avatar de verdad, y la pestaña sin «en HeyGen»                                                                                                                                                                               | §12.2: `avatar-heygen-delete` con confirmación en dos pasos; pestaña «Mis avatares»                                                                                                       |
| El título de cada render en HeyGen lleva el título del video                                                                                                                                                                                                           | §7.1: `<nombre del video> · <marca>`, con la marca de antes para recuperar y el título exacto guardado en el recibo                                                                       |
| El coral de los avisos se lee poco en tema claro                                                                                                                                                                                                                       | Token `--coral-text` (`text-coral-text`: `5 85% 42%` en claro, el coral de siempre en oscuro) para todo texto o ícono de aviso en coral; el coral pleno sigue en fondos, bordes y adornos |
| La grilla de looks de Avatares dice el formato del look                                                                                                                                                                                                                | §12.2: chip de formato con `lookFormatOf` en todas las fichas de looks                                                                                                                    |

Fuera de la 2c: borrar un look suelto de HeyGen (`DELETE /v3/avatars/looks/{look_id}`) y las seis
preguntas del 2026-10-10 15:13. El botón rojo (`variant="destructive"`, blanco sobre coral) también
quedaba afuera, pero la ejecución lo cubrió (ver abajo).

**Lo que la ejecución ajustó** (rulings del 2026-10-11 de `execution-e2c/ledger.md` (interno); donde dicen
otra cosa que la tabla de arriba, mandan ellos):

- **Título del render (R-H1 a R-H4, §7.1).** La marca sigue siendo la clave de recuperación, pero ya
  no se adopta cualquier render que la lleve: primero el de título exacto (pedido también por el
  título guardado, por si HeyGen filtra por igualdad); sin él, el que termina en la marca, con
  cualquier separador delante, y no está `failed`, el más avanzado. Un recibo de antes de la 2c
  repite la marca sola, y el nombre se corta en 80 grafemas.
- **Crear (§9).** El botón «Look» aparece también en un avatar sin look para el formato (todos
  atenuados); al montar, solo el avatar elegido pide el listado de HeyGen; un look sin orientación
  confirmada lo dice.
- **Biblioteca (§12.2).** Los tres borrados en dos pasos ignoran una tecla sostenida y el segundo
  clic de un doble clic, el botón armado se llama como su texto visible y el diálogo del stock no se
  cierra con un borrado en vuelo.
- **Coral y rojo (R-I3 y R-I4).** El pedido del coral se extendió a los rellenos con texto blanco:
  la etiqueta de error de la clonación de estilo y el botón de quitar imagen pasan a `bg-wine`
  (blanco 7,40:1 en los dos temas) y `--destructive` se oscurece en el tema claro (`0 72% 43%`), con
  lo que el blanco del botón rojo, del toast de error y de los distintivos llega a 6,21:1.
  `--destructive-text` en claro (`0 72% 43%`) y `--cherry` (`354 70% 53%`) completan la pasada; los
  grises de ayuda sobre cajas rojas pasan a `text-foreground/65`. Quedan aparcados, fuera del
  pedido, `--muted-foreground` en claro (marginal) y el blanco sobre `sky` y `amethyst`.

## 20. Entrega 2d — la QA del dueño del 2026-10-11 (noche)

Pedidos del dueño tras el cierre de la 2c, con una captura de la grilla «Look» de Crear, y lo
decidido. Donde el pedido admitía dos lecturas, la decisión dice cuál se tomó (ruling) para que el
dueño la corrija en la QA.

| Pedido del dueño                                                                                                                                                                                           | Decisión                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| En Crear, un clic en una ficha de la grilla «Look» abre el mismo reproductor de la ruta Avatares, que reproduce el avatar solo, con un botón «Usar» abajo; «Usar» cierra la grilla y deja ese look elegido | §9: la ficha abre `LookPlayerDialog` con la acción nueva `use` («Usar»); los looks que no sirven abren igual y dicen por qué, sin «Usar». «Usar» elige el look, cierra el reproductor y la grilla, y el foco vuelve al botón «Look». El reproductor arranca solo al abrirse, en todos los lugares donde se usa (stock, panel del avatar y Crear): con sonido y, si el navegador no lo deja, sin sonido y con «Activar el sonido» a mano                                                                                                                                                                                                                                                                                                                        |
| Los mensajes y avisos de avatares no mencionan a HeyGen; solo la eliminación dice «este avatar se eliminará también de HeyGen, ¿seguro?»                                                                   | §13: todos los textos de avatares, Crear, progreso, editor y errores dejan de nombrar a HeyGen («el servicio de avatares», «tu saldo de avatares», «tu clave del avatar presentador»). Quedan con el nombre solo las opciones y la confirmación del borrado en HeyGen y la pantalla de Claves API, donde el nombre identifica la clave                                                                                                                                                                                                                                                                                                                                                                                                                         |
| El botón de eliminar un avatar pregunta ahí mismo «Eliminar permanente de HeyGen» o «Eliminar de la lista»; HeyGen pide «Seguro» y la lista elimina directo                                                | §12.2: el botón de eliminar abre dos opciones en la misma tarjeta. «Eliminar de la lista» saca el avatar de tu biblioteca de Vimo sin otro paso (sigue en HeyGen y se puede volver a agregar). «Eliminar permanentemente de HeyGen», solo en avatares propios (`ownership: 'own'`), pide «Este avatar se eliminará también de HeyGen. ¿Seguro?» y recién ahí borra (`avatar-heygen-delete`). Va en la tarjeta y el panel de la biblioteca y en la pestaña «Mis avatares», donde «Eliminar de la lista» aparece solo si el avatar está en tu biblioteca. Siguen las guardas de tecla sostenida y doble clic                                                                                                                                                     |
| Implementar las soluciones de las seis preguntas del 2026-10-10 15:13                                                                                                                                      | Las respuestas recomendadas ese día ya rigen en 1 (solo looks con la orientación del video), 2 (un look por video), 3 (reparto parejo con la opción de abrir con el avatar) y 5 (frases enteras): quedan decididas. 4: el mínimo por aparición baja a **5 s** (`AVATAR_MIN_APPEARANCE_SECONDS`, lo que pidió el dueño; el máximo sigue en 60 s y hasta 10 apariciones). 6: **una aparición que falla no frena el video**: la fase `avatar` deja de lanzar `avatar_incomplete` por fallos de una escena (render, plazo, moderación, look), el video sale con la imagen fija del look en esas escenas (§10.1), la pantalla de progreso lo avisa y el editor ofrece regenerarlas. Los códigos de la cuenta (clave, saldo) siguen pausando, como en voz e imágenes |
| Implementar la solución de la escena desactualizada que se paga sola al reanudar                                                                                                                           | §8: una escena `ready` desactualizada **no cuenta como pendiente aunque falte su clip**: reanudar no la paga, el render la muestra estática con la vista previa del look y se regenera desde el editor con el costo a la vista. El costo de reanudar cuenta exactamente lo que la fase va a pagar                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Implementar la excepción de dependencias en `CLAUDE.md`                                                                                                                                                    | `CLAUDE.md`, «Regla de dependencias», y enmienda de la ADR-0005: `videos` (Crear y el editor) arma el video con piezas de otros dominios y puede importar lo que esos módulos exponen para elegir o mostrar algo; ningún otro módulo tiene la excepción                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

**Regenerar desde el editor (§11.1 y §11.4, adelantado de la entrega 3).** Sin esto, las escenas que
la decisión 6 y la escena desactualizada dejan estáticas no tendrían salida. El panel de una escena
de avatar ofrece **Generar** (planeada), **Regenerar** (fallida o desactualizada) y **Regenerar
todos** (todas las de avatar sin clip válido o desactualizadas), con el costo estimado y el saldo antes
de confirmar; corre `avatar-render-scenes { projectId, sceneIds }` como tarea del editor, con el
progreso en el bloque del timeline. Al terminar, el video exportado queda desactualizado como con
cualquier cambio del editor. «Cambiar avatar», «Avatar aquí», mover y estirar siguen en la entrega 3.

Fuera de la 2d: ocultar avatares de «Mis avatares» sin borrarlos de HeyGen, elegir un look distinto
por aparición y un tope de minutos de avatar por video.

**Lo que la ejecución ajustó** (rulings del 2026-10-11 de `execution-e2d/ledger.md` (interno); donde dicen otra cosa
que la tabla de arriba, mandan ellos):

- **Crear (§9).** La ficha deja de ser un `radio`: la grilla es una lista de botones (`ul`, con
  `aria-current` y «Elegido»). Un look que no sirve abre el reproductor con una frase propia por motivo,
  porque el reproductor traduce el motivo sin variables (`create.avatar.otherFormatHint`, `failedLookHint` y
  `unknownOrientationHint`, más las del reproductor de Avatares). El reproductor se cierra si cambia el
  avatar que se mira o se deshabilita el formulario, y no se reabre solo al volver. La píldora del saldo ya
  no nombra al proveedor.
- **El reproductor (§12.2).** Arranca solo con sonido; si la política de reproducción automática lo rechaza
  (`NotAllowedError`), queda silenciado con «Activar el sonido»; otro rechazo no lo silencia y, si tampoco
  arranca silenciado, queda en pausa con el sonido; una respuesta tardía con el reproductor cerrado no toca
  el video.
- **Eliminar (R-2d-2, §12.2).** «Seguro» ocupa el lugar de «Eliminar permanentemente de HeyGen» y «Cancelar»
  el de la lista (la revisión midió que de otro modo un clic de corrección borraba para siempre). El valor
  de un avatar propio es `'own'` (`'private'` es el del listado de HeyGen). El foco entra a la primera
  opción al abrir y ningún foco del menú desplaza la grilla (`preventScroll`), Escape cierra solo el menú,
  el segundo clic de un doble clic no confirma ni abre lo que
  queda debajo, y la biblioteca también hace un borrado de HeyGen a la vez.
- **Textos (R-2d-3, §13).** Se quedan con el nombre la categoría de Claves API, el borrado en HeyGen y, por
  decisión del controlador, las filas del aviso de saldo y de «Faltan claves» (dicen qué cuenta recargar o
  qué clave cargar). Un guard permanente (`check-avatar-texts-without-provider.mjs`, cuatro claves
  permitidas) lo exige. Se borraron nueve claves sin uso.
- **Una aparición que falla (pregunta 6, R-2d-4 y R-P2, §8).** Una vez terminada, la fase no vuelve a correr
  al reanudar: las apariciones con la imagen fija se regeneran solo desde el editor, que también cosecha sin
  pagar un recibo `pending` vencido; una pausa de la cuenta (clave o saldo) no la completa. Si el dueño
  prefiere que reanudar reintente las fallidas, es la línea del `skip` que mira `completedStages` (y volver
  a contar el avatar en el costo de reanudar). `avatar_incomplete` queda como código heredado de proyectos
  de antes de la 2d.
- **Una sola regla para «sale con la imagen fija» (§10.1).** `isAvatarFallback` decide qué apariciones
  cuentan para la fila del progreso, el aviso del final de Crear (contexto `progress`: una planeada todavía
  no cuenta), el del reproductor de la biblioteca y el del editor (contexto `project`: una planeada sí
  cuenta). Una desactualizada no cuenta nunca y su fila dice «Desactualizada»
  (`create.progress.avatarStale`).
- **La desactualizada (R-2d-5, §3.3).** Para mostrar una escena lista, `stale` manda sobre `failed`: el
  bloque y el panel del editor dicen «Desactualizado» también en la que perdió su clip, y regenerarla paga
  un render nuevo.
- **Regenerar desde el editor (R-2d-6, §11).** Hay dos «Regenerar» con alcance distinto: «Regenerar todos
  (N)» en el panel (todas las de avatar sin clip válido o desactualizadas) y «Regenerarlas (N)» en el aviso
  de arriba del editor (exactamente lo que el aviso cuenta: sin las desactualizadas y solo con tramo). La
  confirmación es una sola para los dos y relee el saldo antes de pagar; la tarea es exclusiva con las demás
  del proyecto y con Crear (que espera con el aviso de «ocupado»), las pedidas esperan en cola sin
  porcentaje, una tecla sostenida no paga dos veces y el foco
  nunca cae a `body`. El costo de un clip ya pagado que solo hay que volver a bajar se muestra completo (un
  techo): marcarlo «recuperable sin costo» queda para la QA y la entrega 3.
- **Módulos (R-2d-7).** La excepción de dependencias de `videos` incluye también las constantes públicas de
  otros módulos (claves de query, límites, tiempos), como dice `CLAUDE.md`.
