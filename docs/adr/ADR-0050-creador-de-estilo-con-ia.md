# ADR-0050 — Creador de estilo con IA: clonar un estilo desde un video o desde imágenes

- **Estado:** Aceptada (sidecar implementado; la app llega en el commit siguiente de la misma rama)
- **Fecha:** 2026-10-03
- **Área:** pipeline / app / servidor
- **Extiende a:** [ADR-0018](ADR-0018-estilos-visuales-propios-fase-basica.md) (su nota del
  2026-09-05 dejaba «Crear estilo con IA» fuera de alcance porque no había subcomando),
  [ADR-0048](ADR-0048-gemas-por-secciones-y-agente-reconstructor.md) (el estilo clonado es una gema
  por secciones) y [ADR-0006](ADR-0006-sdk-de-supabase-directo-sin-backend.md) (otra llamada de la
  app a vimo.click).
- **Depende de:** [ADR-0021](ADR-0021-previews-de-personaje-con-estilos-propios.md) con su enmienda
  del 2026-10-02 (un personaje de identidad de prompt viaja siempre como texto), que vive en la rama
  `fix/prompt-identity-travels-as-text` y todavía no está en esta.
- **Spec:** [design.md](../handoff/2026-10-03-ai-style-creator/design.md).

## Problema

Crear un estilo en Mi estilo exige escribir o conseguir una gema. El dueño usa en Imperio Pro
(viani.pro) un «Creador de Gemas» que mira un video de YouTube, propone pruebas y devuelve el estilo
escrito, y quiere lo mismo dentro de Vimo, «igual o mejor», más una variante desde hasta 10 imágenes.

Restricciones que achicaron las opciones:

- **El análisis tiene que ser el de Imperio Pro**: el mismo modelo (Gemini 3.1 Pro) y su instructivo,
  pulido contra 11 canales reales. La clave del modelo es de Vimo y no puede viajar en la app.
- **Las imágenes de prueba se pagan con las claves del usuario** (Fal o Evolink), que viven en el
  llavero y solo las ve el sidecar (ADR-0011).
- **YouTube bloquea algunas redes como bot.** Medido el 2026-10-03 en la Mac del dueño: la página
  del video redirige a `google.com/sorry` y los clientes por defecto de yt-dlp fallan con «Sign in
  to confirm you’re not a bot»; el cliente `mweb` responde. Al servidor de Imperio Pro le pasa lo
  mismo y sigue con 4 fotogramas, sin avisar.
- **Un análisis tarda de 24 a 76 s** (hasta 137 s medidos en Imperio Pro) y el modelo no escribe nada
  antes del primer byte: una conexión muda se corta en el camino.
- **La clonación no puede atar al usuario al modal**: tiene que seguir en segundo plano y detenerse
  solo cuando necesita una respuesta.

## Decisión

**La app conduce la clonación, el sidecar junta el material y dibuja y guarda, y vimo.click analiza;
el servidor no guarda estado ni va a YouTube.**

| Pieza                  | Estado | Ubicación                                                                             | Para qué                                                                                      |
| ---------------------- | ------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `style-clone-prepare`  | nuevo  | `pipeline/commands/styles/style-clone-prepare.ts`                                     | Junta el material en la carpeta de la sesión                                                  |
| `style-clone-draw`     | nuevo  | `pipeline/commands/styles/style-clone-draw.ts`                                        | Dibuja una ronda de pruebas y deja el «Original» de cada escena                               |
| `style-clone-save`     | nuevo  | `pipeline/commands/styles/style-clone-save.ts`                                        | Guarda el estilo, sus muestras y el personaje                                                 |
| `style-clone-discard`  | nuevo  | `pipeline/commands/styles/style-clone-discard.ts`                                     | Borra la carpeta de la sesión                                                                 |
| Contrato               | nuevo  | `pipeline/types/style-clone.ts`                                                       | Payloads y resultados de los cuatro                                                           |
| Carpeta de la sesión   | nuevo  | `style-clone-store.ts`, `<carpeta raíz>/_style-clones/<sesión>/`                      | Material (`material.json` y sus imágenes) y pruebas; reservada en `RESERVED_ROOT_DIRECTORIES` |
| Ficha del video        | nuevo  | `readYouTubeInfo` en `pipeline/providers/ytdlp/download.ts`                           | `yt-dlp -J` con captura de stdout; sigue siendo el único punto de spawn de yt-dlp (ADR-0013)  |
| Agente                 | nuevo  | `vimo-landing`: `POST /api/estilos/crear-con-ia` y `functions/_lib/creador-estilo/`   | Un turno por pedido con Gemini 3.1 Pro; contrato en su `SETUP_CREADOR_ESTILO_IA.md`           |
| Origen del estilo      | cambia | `GemOrigin` en `pipeline/types/styles.ts`, `style-store.ts`                           | Suma `{ kind: 'ai-clone', source, videoUrl? }`                                                |
| Tope del final fijo    | cambia | `PROMPT_END_CHAR_LIMIT` en `style-store.ts`, `GEM_SECTION_LIMITS` en `gemTemplate.ts` | `promptEnd` pasa de 600 a 1 000 caracteres                                                    |
| Interruptor            | nuevo  | `VIMO_FLAG_AI_STYLE_CREATOR` → `features.aiStyleCreator`                              | Arranca en `admins`                                                                           |
| Card, modal y sesiones | —      | `src/modules/videos` (commit siguiente)                                               | La parte visible y el segundo plano                                                           |

### El material (`style-clone-prepare`)

- **De un video:** la ficha se pide con el cliente de siempre de yt-dlp y, solo si responde el
  bloqueo de bot (`ytdlp_needs_login`), otra vez con `--extractor-args youtube:player_client=mweb`.
  Del storyboard de celdas más grandes (`sb0`: mosaicos de 3×3 con celdas de 320×180) se bajan hasta
  10 mosaicos repartidos de punta a punta (`spreadIndexes`), y de cada uno se guarda su cuadrícula
  real (el último suele venir incompleto: se mide el JPEG) y el segundo en que empieza. Siempre se
  suman los 3 fotogramas públicos (`maxres1..3`, o `sd`/`hq`), la miniatura y el título por oEmbed.
- **Sin storyboard, la clonación sigue con los fotogramas públicos y no avisa** (decisión del dueño:
  es lo que hace Imperio Pro). Solo falla con menos de 2 imágenes, con el motivo que dio yt-dlp o
  con `style_clone_no_material`.
- **De imágenes del usuario:** hasta 10, validadas por sus bytes y achicadas con FFmpeg a un JPEG de
  hasta 1 536 px de lado mayor, sin agrandar las chicas. Con una sola inválida no se prepara nada:
  el resultado trae `rejectedImages` y la app pide quitarla.
- Las URL de los mosaicos vienen de la ficha, que es dato de afuera: solo se bajan de `*.ytimg.com`.
- No se leen las cookies del navegador.

### Las pruebas (`style-clone-draw`)

- Usa los mismos generadores que las muestras de Mi estilo (`generateEvolinkImage`,
  `generateFalImage`): calidad baja.
- **Diseños del personaje:** el prompt tal cual llega. **Escenas sin personaje:** el prompt con la
  etiqueta `[subject]` neutralizada. **Escenas con personaje:** de la forma que eligió el usuario,
  con las funciones de las muestras: `weaveSampleIdentity` («identidad de prompt») o
  `buildCustomStyleReferencePrompt` con el diseño elegido adjunto («con foto»; si la referencia no
  se puede subir o el encargo falla, una vez como texto).
- **El «Original» de cada escena** sale del origen que dijo el modelo: el fotograma o la imagen del
  usuario tal cual, o la celda recortada de su mosaico. Un origen que el material no tiene queda sin
  original: nunca se muestra uno equivocado. La miniatura no es original de nada.
- **Una prueba que falla no tumba la ronda**: vuelve con su `errorCode` y la tarjeta ofrece
  reintentar. Un rechazo por contenido se reintenta una vez con `applySafetyReplacements`. Saldo
  agotado y clave rechazada sí cortan el job, después de anunciar las que salieron.
- Cada ronda escribe archivos nuevos (`scene-r<ronda>-<n>.jpg`) y cada prueba trae `mtimeMs`: el
  webview no muestra una imagen vieja desde su caché.

### El guardado (`style-clone-save`)

- Crea un estilo NUEVO (`st-…`) con las secciones del servidor, su versión, las clonaciones
  aprobadas como `sample-N.jpg` y `origin: { kind: 'ai-clone', … }`, que se lee del material de la
  sesión y no del webview.
- **Personaje replicado:** se crea en la biblioteca y el estilo queda en
  `{ mode: 'own', defaultCharacterId }`. «Con foto»: el diseño es su `photoFile` (viaja como
  referencia en todos los estilos, ADR-0033). «Identidad de prompt»: sin foto, con el diseño como su
  preview del estilo nuevo, que se ve en su tarjeta y no viaja (ADR-0021, enmienda del 2026-10-02).
- **Sin personaje:** `{ mode: 'generic' }`. La sección `character` no se guarda nunca, así
  «Personaje genérico» siempre significa diseñarlo desde el guion.
- Todo se valida y se lee antes de tocar el disco; `style.json` se escribe al final. Un guardado que
  falla a mitad borra lo que alcanzó a escribir y deja la sesión para reintentar; uno que sale bien
  la borra.
- Las imágenes de terceros (mosaicos, fotogramas, miniatura) nunca pasan a ser muestras: mueren con
  la carpeta de la sesión.

### El final fijo llega a 1 000 caracteres

La fidelidad de Imperio Pro viene de pegar la ficha de estilo al final de cada prompt de imagen. En
Vimo ese lugar es `promptEnd`, que el código pega solo. Su tope sube de 600 a 1 000
(`PROMPT_END_CHAR_LIMIT`; `promptStart` sigue en 600). Lo aceptan `style-save`, el snapshot de
`create-video-project` y el modal de Mi estilo. El agente reconstructor de la ADR-0048 sigue
escribiendo finales de hasta 600.

No puede ser más largo. El cuerpo de un prompt final tiene **2 106 caracteres**
(`FINAL_PROMPT_BODY_BUDGET`: los 3 000 de `MAX_PROMPT_CHARS` menos las dos cláusulas que la
plataforma pega siempre, la de texto en imagen y la de anonimato) para la escena, la identidad del
personaje (hasta 700) y este cierre. Cuando no entra, `fitFramedBody` recorta primero la escena
hasta un piso de 300 caracteres y después el cierre. Con un cierre de 1 000 y una identidad de 700 a
la escena le quedan unos 400. Las fichas de las tres clonaciones reales del 2026-10-03 midieron
entre 818 y 1 590 caracteres: el instructivo del servidor tiene que pedir una ficha de hasta 900 y
usar esa misma en las escenas de prueba, para que lo aprobado sea lo que después sale en el video
(pendiente en `vimo-landing`, ver Consecuencias).

### Flujo de un turno

1. La app pide el material al sidecar (una vez por sesión) y lo lee del disco.
2. Manda a vimo.click la acción, el material en base64 y el historial como texto.
3. El servidor responde por partes (NDJSON): `inicio`, un `latido` cada 10 s y `resultado` o `error`.
4. La app le pide al sidecar que dibuje los prompts que llegaron.
5. Muestra las pruebas o se detiene a esperar la respuesta del usuario.

## Alternativas consideradas

- **Que el sidecar hable con Gemini** — la clave de Vimo viajaría en la app. Descartada.
- **Que el servidor baje el video** — a un servidor YouTube lo bloquea casi siempre (le pasa a
  Imperio Pro), y la IP del usuario suele pasar. Además ata el costo de ancho de banda a Vimo.
- **Mandar el video entero a Gemini** — Imperio Pro no lo hace (manda mosaicos y fotogramas), cuesta
  más y hay que bajarlo primero. Queda para comparar después contra este material.
- **Avisar «menos preciso» cuando no hay storyboard** — el dueño lo descartó: Imperio Pro sigue con
  los fotogramas sin decir nada y el resultado le gusta.
- **Leer las cookies del navegador para saltar el bloqueo** — invasivo y no hace falta: `mweb` y los
  fotogramas públicos alcanzan.
- **Guardar la ficha en `visualStyle` y dejar `promptEnd` en 600** — el modelo de prompts la resume
  distinto en cada escena y el estilo se dispersa; pegada por código sale idéntica en todas.
- **Un final fijo de 1 800, para la ficha entera** — era el plan (la spec lo decía). Se descartó al
  medir el presupuesto real del cuerpo, 2 106 caracteres y no «cerca de 3 000»: con un cierre de
  1 500 y una identidad de 600 la escena quedaba en su piso de 300 y el cierre igual se cortaba.
- **Subir `MAX_PROMPT_CHARS`** — cambia todos los carriles y el costo de cada imagen (Evolink cobra
  el texto). No es de esta decisión.
- **Una respuesta JSON única del servidor** — con 30 a 140 s de silencio la conexión se corta. La
  respuesta por partes con latidos la mantiene viva.

## Consecuencias

- **Contrato del sidecar:** cuatro subcomandos nuevos, una carpeta reservada nueva, `GemOrigin` pasa
  a ser una unión y `promptEnd` admite 1 800 caracteres. Rust no cambia: `start_pipeline_job` es
  genérico. El diagnóstico (ADR-0038) los agrupa como entidad de estilo por la palabra «style».
- **Un prompt de imagen más largo.** Con un cierre de 900, una identidad de 600 y la escena, el
  cuerpo llena su presupuesto de 2 106 caracteres, y Evolink cobra el texto del prompt: una imagen
  de un estilo clonado cuesta algo más que el precio de lista.
- **El servidor todavía pide un cierre de hasta 1 800** (`LIMITE_FRASE_CIERRE` de `vimo-landing`,
  commit `d0bc72f`, sin desplegar). Hasta que se ajuste a 900, `style-clone-save` rechaza con
  `invalid_payload` un estilo cuyo cierre pase de 1 000: es un cambio pendiente del instructivo, con
  su corrida real de validación.
- **Costo para Vimo:** unos 10 centavos de dólar por turno de Gemini (medido); una clonación son 2 o
  3 turnos más uno por comentario. No hay tope diario (decisión del dueño); la válvula es
  `CREADOR_ESTILO_CUPO_DIARIO` o el interruptor en vimo.click.
- **Con Fal las pruebas salen en 4:3** (el pedido de preview de `generateFalImage`), como las
  muestras de Mi estilo; con Evolink, en 16:9.
- **El «Original» de una celda de mosaico mide 320×180.** Bajar ese instante del video para mostrar
  un cuadro nítido queda pendiente (spec §5.3).
- **Arreglo de paso:** `classifyYtDlpError` no reconocía el bloqueo de bot porque yt-dlp lo escribe
  con apóstrofo tipográfico. También mejora el mensaje de la música y el overlay desde YouTube
  ([informe](../../fixes/2026-10-03_ytdlp-bot-block-apostrophe.md)).
- **Pendiente antes de abrirlo a todos:** desplegar el servidor (SQL, variables, merge), sumar a
  esta rama la enmienda de la ADR-0021 y actualizar la política de privacidad de vimo.click.

## Guards

`scripts/test/check-style-clone-material.mjs`, `check-style-clone-draw.mjs`,
`check-style-clone-save.mjs` y `check-app-style-clone.mjs`
([README](../../scripts/test/README.md)).
