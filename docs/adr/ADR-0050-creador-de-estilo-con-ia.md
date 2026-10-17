# ADR-0050 — Creador de estilo con IA: clonar un estilo desde un video o desde imágenes

- **Estado:** Aceptada (sidecar y app implementados; servidor desplegado en vimo.click el 2026-10-03, encendido solo para admins)
- **Fecha:** 2026-10-03
- **Área:** pipeline / app / servidor
- **Extiende a:** [ADR-0018](ADR-0018-estilos-visuales-propios-fase-basica.md) (su nota del
  2026-09-05 dejaba «Crear estilo con IA» fuera de alcance porque no había subcomando),
  [ADR-0048](ADR-0048-gemas-por-secciones-y-agente-reconstructor.md) (el estilo clonado es una gema
  por secciones) y [ADR-0006](ADR-0006-sdk-de-supabase-directo-sin-backend.md) (otra llamada de la
  app a vimo.click).
- **Depende de:** [ADR-0021](ADR-0021-previews-de-personaje-con-estilos-propios.md) con su enmienda
  del 2026-10-02 (un personaje de identidad de prompt viaja siempre como texto), sumada a esta rama
  el 2026-10-03 desde `fix/prompt-identity-travels-as-text`.
- **Spec:** [design.md](../handoff/2026-10-03-ai-style-creator/design.md).

## Enmienda 2026-10-13 — Imágenes de prueba con Vimo gratis

La restricción original de pagar todas las imágenes con Fal/Evolink queda **superada**: diseños y escenas de prueba también admiten Vimo (gratis), con Multimagen preparado y un plan explícito conservado en la sesión. El análisis del estilo conserva su contrato y servicio actuales.

Cada tarjeta tiene una intención durable por sesión, tipo, ronda e índice. Reintentar una tarjeta incierta recupera su recibo; un fallo terminal confirmado permite un nuevo intento explícito. Las referencias fotográficas conservan su hash y no se degradan silenciosamente a texto. La UI presenta los tres proveedores y sólo un badge de conexión, con validación de capacidad antes de iniciar.

La implementación, diagrama, contratos de fallo y pruebas están en [el fix de imágenes de prueba con Vimo gratis](../../fixes/2026-10-13_clonacion-de-estilo-con-vimo-gratis.md) del 2026-10-13. La descripción siguiente conserva el contexto de la decisión original de 2026-10-03.

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

| Pieza                     | Estado | Ubicación                                                                             | Para qué                                                                                      |
| ------------------------- | ------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `style-clone-prepare`     | nuevo  | `pipeline/commands/styles/style-clone-prepare.ts`                                     | Junta el material en la carpeta de la sesión                                                  |
| `style-clone-draw`        | nuevo  | `pipeline/commands/styles/style-clone-draw.ts`                                        | Dibuja una ronda de pruebas y deja el «Original» de cada escena                               |
| `style-clone-save`        | nuevo  | `pipeline/commands/styles/style-clone-save.ts`                                        | Guarda el estilo, sus muestras y el personaje                                                 |
| `style-clone-discard`     | nuevo  | `pipeline/commands/styles/style-clone-discard.ts`                                     | Borra la carpeta de la sesión                                                                 |
| Contrato                  | nuevo  | `pipeline/types/style-clone.ts`                                                       | Payloads y resultados de los cuatro                                                           |
| Carpeta de la sesión      | nuevo  | `style-clone-store.ts`, `<carpeta raíz>/_style-clones/<sesión>/`                      | Material (`material.json` y sus imágenes) y pruebas; reservada en `RESERVED_ROOT_DIRECTORIES` |
| Ficha del video           | nuevo  | `readYouTubeInfo` en `pipeline/providers/ytdlp/download.ts`                           | `yt-dlp -J` con captura de stdout; sigue siendo el único punto de spawn de yt-dlp (ADR-0013)  |
| Agente                    | nuevo  | `vimo-landing`: `POST /api/estilos/crear-con-ia` y `functions/_lib/creador-estilo/`   | Un turno por pedido con Gemini 3.1 Pro; contrato en su `SETUP_CREADOR_ESTILO_IA.md`           |
| Origen del estilo         | cambia | `GemOrigin` en `pipeline/types/styles.ts`, `style-store.ts`                           | Suma `{ kind: 'ai-clone', source, videoUrl? }`                                                |
| Tope del final fijo       | cambia | `PROMPT_END_CHAR_LIMIT` en `style-store.ts`, `GEM_SECTION_LIMITS` en `gemTemplate.ts` | `promptEnd` pasa de 600 a 1 000 caracteres                                                    |
| Interruptor               | nuevo  | `VIMO_FLAG_AI_STYLE_CREATOR` → `features.aiStyleCreator`                              | Arranca en `admins`                                                                           |
| Sesiones en segundo plano | nuevo  | `src/modules/videos/utilities/styleCloneSessions.ts`, `hooks/useStyleClones.ts`       | El store que conduce cada clonación fuera del modal                                           |
| Contrato con el servidor  | nuevo  | `src/modules/videos/utilities/styleCloneTurn.ts`, `types/styleClone.ts`               | Qué lleva cada turno y cómo se valida su respuesta                                            |
| Respuesta por partes      | nuevo  | `vimoServerStream` y `readNdjson` en `src/modules/common/fetcher/`                    | Cliente NDJSON de vimo.click con tope total y tope de silencio                                |
| Card, tarjetas y modal    | nuevo  | `src/modules/videos/components/StyleClone*.tsx`, `hooks/useStyleCloneModal.ts`        | La parte visible, dentro de la galería de Mi estilo                                           |

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
- **Sin personaje replicado:** `{ mode: 'generic' }`, o `{ mode: 'none' }` si el servidor sugirió
  «sin personaje» porque el original no muestra ninguno (`characterMode` del payload; ver «Un estilo
  que no muestra personajes» más abajo). La sección `character` no se guarda nunca, así «Personaje
  genérico» siempre significa diseñarlo desde el guion.
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

**La ficha describe una sola imagen (2026-10-04).** Como `promptEnd` se pega en cada prompt, el
generador lee la ficha como la descripción de esa imagen. Solo puede decir lo que es verdad en todos
los fotogramas (técnica, trazo, anatomía en condicional, tratamiento del color, detalle, sombreado,
textura y negaciones). La variedad del canal —los mundos de color entre los que rota, el reparto de fondos,
los tipos de escena— va en `visualStyle` y `rules`, que lee el redactor de prompts. En la primera
clonación hecha desde la app la ficha traía esa variedad y las 4 escenas salieron como collages de
paneles; el servidor ahora la pide aparte y la reclama si se cuela
(`fixes/2026-10-04_style-clone-collage-scenes.md`).

**La anatomía de la ficha va en condicional (2026-10-04).** Por la misma razón, la ficha no puede
describir el cuerpo de las personas como un hecho de la imagen: el generador las dibuja también en
las escenas que no nombran a nadie (un diagrama salió con un monigote). El bloque de anatomía
empieza con «People, only when the scene names them, have this anatomy:». Medido con el mismo
generador sobre dos escenas sin personas: una persona de más en 13 de 18 dibujos sin ese encabezado
y en 0 de 24 con él. El servidor lo pide y lo reclama si falta
(`fixes/2026-10-04_style-clone-scene-fidelity.md`).

**Cada prueba es fiel a su fotograma (2026-10-04).** La comparación «Original / Clonación» pone
cada prueba al lado de la imagen que recrea, así que la recrea tal cual: la misma composición y la
misma cantidad de personas. Un fotograma de una sola escena sale como una sola imagen; uno que ya
es una pantalla dividida o un collage en el video se recrea con esa misma división, escrita dentro
de la escena y nunca en la ficha. En el estilo final, `rules` divide el cuadro solo donde el canal
lo hace.

**Un estilo que no muestra personajes queda en «Sin personaje» (2026-10-04).** Sin personaje
replicado, un estilo clonado quedaba siempre en «Personaje genérico», y ahí Vimo diseña un
protagonista para cada video: en un canal de diagramas le sumaba uno que el estilo no tiene. Nada de
lo que devolvía el análisis decía si el video muestra personajes (en ese canal la ficha describió el
ícono de usuario de los diagramas como la anatomía de las personas), así que el análisis lo dice en
una línea propia, «PERSONAS EN ESCENA: SÍ/NO», donde un pictograma no cuenta como personaje. Al
aprobar, si la línea dijo NO y no se replicó un personaje, el servidor suma
`suggestions: { characterMode: 'none' }` a su respuesta (la forma que ya usa el reconstructor de
gemas); la app lo guarda con el estilo final y `style-clone-save` deja el estilo en
`{ mode: 'none' }`. Es el valor inicial del interruptor: el usuario lo cambia como en cualquier
estilo. Sin la sugerencia (un servidor anterior, una sesión analizada antes, o una línea que no dice
ni SÍ ni NO) el estilo queda en genérico, como antes
(`fixes/2026-10-04_style-clone-no-character-default.md`).

### La app: sesiones que siguen sin el modal

- **Una sesión es una clonación abierta.** Vive en un store fuera de React
  (`createStyleCloneSessions`, patrón de `gemMigrations`), se guarda en `localStorage`
  (`vimo:styleClone:sessions:v1`) en cada cambio y sigue trabajando aunque se cierre el modal o se
  salga de la pestaña. Hasta 3 a la vez; una que espera una respuesta sigue contando.
- **Cada acción avanza por fases** (`prepare` → `turn` → `draw` → `save`) y cada fase deja su
  resultado en la sesión antes de pasar a la siguiente. Por eso «Reintentar» (tras un fallo) y
  «Reanudar» (la app se cerró mientras trabajaba: la sesión vuelve `interrupted`) repiten solo la
  fase que estaba corriendo: no se vuelve a pagar un turno ya respondido ni una imagen ya dibujada,
  y un guardado que falla se reintenta con el estilo final que ya había llegado.
- **Cuando necesita una respuesta se detiene** (`awaiting`) y su tarjeta, al principio de la grilla
  de Mi estilo, lo dice: «Respondé para continuar». Tocarla abre el modal en su paso. Las respuestas
  solo se toman mientras espera y si corresponden a su paso.
- **Una prueba que falló se reintenta sola** (`redraw`), sin otro turno del servidor. Sin saldo, la
  sesión queda «Sin saldo · Recargá y continuá» y al reintentar dibuja solo las que faltaban.
- **Al guardar,** con el modal abierto el estilo queda en uso; con el modal cerrado no se cambia el
  estilo del video que la persona arma: un aviso ofrece «Usar en este video».
- **La respuesta del servidor es dato de afuera:** `readStyleCloneTurnResult` valida la línea
  `resultado` de cada acción y lo que no cumple el contrato no se usa. Un origen que no se entiende
  es una escena nueva.
- **El interruptor** `features.aiStyleCreator` decide si aparece la card «Crear estilo con IA»; las
  sesiones ya abiertas se siguen viendo aunque se apague.
- La respuesta por partes se lee con `vimoServerStream`: tope del pedido de 300 s y, una vez que
  empezó a llegar, 45 s de silencio (el servidor manda un latido cada 10 s).

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
- **El servidor pide un cierre de hasta 900** (`LIMITE_FRASE_CIERRE` de `vimo-landing`): solo
  «Style: » más una ficha de hasta 850, la misma que usan las escenas de prueba. Validado con una
  corrida real: cierre de 839 caracteres y estilo intacto.
- **Servidor desplegado el 2026-10-03** (`vimo-landing` `main` @ `0e5af82`, PR #13), con el SQL de
  `ai_style_creator_logs` aplicado y `VIMO_FLAG_AI_STYLE_CREATOR=admins`. En producción el endpoint
  responde 401 `sin-token` sin sesión y el preflight desde `tauri://localhost` pasa. Falta medir el
  primer turno real desde la app (el tiempo de CPU de la Function con un pedido de 1 a 3 MB).
- **Costo para Vimo:** unos 10 centavos de dólar por turno de Gemini (medido); una clonación son 2 o
  3 turnos más uno por comentario. No hay tope diario (decisión del dueño); la válvula es
  `CREADOR_ESTILO_CUPO_DIARIO` o el interruptor en vimo.click.
- **Con Fal las pruebas salen en 4:3** (el pedido de preview de `generateFalImage`), como las
  muestras de Mi estilo; con Evolink, en 16:9.
- **El «Original» de una celda de mosaico mide 320×180.** Bajar ese instante del video para mostrar
  un cuadro nítido queda pendiente (spec §5.3).
- **Pendiente en la app:** arrastrar imágenes al modal (hoy se eligen con el diálogo del sistema) y
  un aviso fuera de la pestaña Mi estilo cuando una clonación necesita una respuesta (hoy lo dice
  su tarjeta).
- **Arreglo de paso:** `classifyYtDlpError` no reconocía el bloqueo de bot porque yt-dlp lo escribe
  con apóstrofo tipográfico. También mejora el mensaje de la música y el overlay desde YouTube
  ([informe](../../fixes/2026-10-03_ytdlp-bot-block-apostrophe.md)).
- **Pendiente antes de abrirlo a todos:** la prueba del dueño en la app, la aceptación contra
  Imperio Pro y el texto de la política de privacidad de vimo.click.

## Nota posterior 2026-10-06 — «Crear estilo con IA» en el Catálogo, para el admin

**Pedido del dueño:** que el admin tenga en la pestaña Catálogo la misma tarjeta «Crear estilo con
IA» que en Mi estilo, con el mismo recorrido, pero para **publicar una gema del catálogo** desde ahí
y que los usuarios la vean. Se apoya en el catálogo remoto administrado
([ADR-0049](ADR-0049-catalogo-remoto-administrado.md)): un admin ya crea gemas desde «Crear estilo»
(pegar una gema → «Preparar con IA» → campos → muestras → Publicar).

**Decisión:** cada clonación lleva un **destino** (`StyleCloneTarget`: `custom` o `catalog`), que le
da la galería que abre el modal. Con destino catálogo:

- **La tarjeta y el modal son los mismos** (`StyleCloneCreateCard`, `StyleCloneModal`, los pasos),
  al lado de «Crear estilo» del admin y solo con `adminList` y `features.aiStyleCreator`. Las
  clonaciones en curso de ese destino se ven al principio de la grilla del catálogo, como en Mi
  estilo; las de Mi estilo siguen solo en su galería. El tope de tres cuenta los dos destinos.
- **El personaje replicado es el personaje fijo de la gema** (pedido del dueño): la pregunta
  «¿Replicamos el personaje?» y los 3 diseños son los mismos que en Mi estilo, pero el personaje
  viaja **solo como identidad de prompt** (la opción «Con foto» no se ofrece: una foto no cabe en
  una gema) y su ficha, que el servidor escribe en el formato de Vimo (rasgos y la oración final
  «Outfit:», PASO 2.8 de `maestro.ts`, hasta 700 caracteres), pasa a ser la sección `character` del
  borrador. Así la gema lleva «Personaje fijo» (`withBehaviorTags`), las muestras salen en genérico
  con ese personaje (en genérico la sección `character` es el personaje, ADR-0048), el usuario en
  genérico ve el mismo personaje que en las muestras, y si crea el suyo con «Crear personaje con mi
  estilo» sale en el estilo de la gema (`design-style-character` con sus secciones). Sin replicar,
  el personaje queda en genérico o, si el servidor lo sugiere, en «sin personaje».
- **Aprobar no guarda nada en disco.** Tras el turno `aprobar`, la sesión termina con el estilo
  final (`StyleCloneFinished` con `target: 'catalog'` y `style`: nombre, secciones, versión del
  marco, modo sugerido y el personaje, si se replicó), se borra su carpeta (`style-clone-discard`)
  y la galería del catálogo abre el modal del admin con la gema ya armada (`CatalogAdminModal` con
  `initialDraft`, que se saltea «Pegá tu gema»): `catalogDraftFromStyleClone` arma el borrador con
  el nombre solo en español, la sección `character` si hay personaje, las etiquetas de
  comportamiento, los tres modos y las muestras en genérico (o en el modo sugerido, sin personaje).
  El admin completa ahí los otros dos idiomas («Traducir con IA»), las etiquetas y las muestras, y
  publica. Ese modal se deriva del store (sin estado propio): si el admin cambia de pestaña con el
  modal abierto, la clonación lo espera y lo vuelve a encontrar al volver.
- **Las muestras no son las escenas clonadas.** Se generan en el modal, con el carril real y en el
  modo de las muestras (plan E3, P17): las escenas de prueba recrean fotogramas de un video ajeno y
  llegan en el formato que entregó el proveedor (con Evolink pueden no ser JPEG), y el bucket exige
  JPEG. Cuesta 4 imágenes más (unos 2 centavos) y un clic.
- **Una sesión guardada antes de este cambio** vuelve con destino Mi estilo.

**Guards:** `check-app-style-clone-sessions.mjs` (aprobar con destino catálogo: sin guardado, carpeta
borrada, el estilo final en `finished`, con el personaje elegido como identidad; la carpeta que no
se borra no frena; lo guardado sin destino vuelve como Mi estilo) y `check-app-catalog-admin.mjs`
(`catalogDraftFromStyleClone`, con y sin personaje).

## Guards

`scripts/test/check-style-clone-material.mjs`, `check-style-clone-draw.mjs`,
`check-style-clone-save.mjs` (sidecar), `check-app-style-clone.mjs`,
`check-app-style-clone-sessions.mjs` (app) y los casos de respuesta por partes de
`check-app-vimo-server.mjs` ([README](../../scripts/test/README.md)).
