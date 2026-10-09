# Editor con IA: investigación de librerías, de HeyGen y del editor de VidRush

- **Fecha:** 2026-10-07
- **Rama:** `feat/edicion-avatar-ia` (sale de `dev` @ `2950ebb3`)
- **Estado:** investigación terminada. No se instaló ninguna librería: qué se adopta se decide en el
  diseño de cada sub-proyecto, con el dueño.
- **Pedido:** del compañero del dueño. Buscar librerías que aceleren el editor con tres condiciones
  obligatorias: licencia que permita vender Vimo como producto cerrado, gratis, y compatible con el
  stack y el diseño de Vimo. Suma si traen efectos y transiciones listos.
- **Cómo se verificó:** cada licencia se leyó en el archivo `LICENSE` del repositorio o en los
  metadatos de npm, no en blogs; versiones y fechas salen del registro de npm. Todo el 2026-10-07.
  No se instaló nada; lo único que se ejecutó fue el `ffmpeg` de Vimo, para listar sus filtros.

El proyecto se parte en sub-proyectos con diseño y aprobación propios: (1) editor a pantalla
completa, (2) generación de avatar con HeyGen, (3) edición del contenido con el avatar (como máximo
un minuto de avatar repartido en fragmentos, con movimientos, formas y transiciones), (4) más
adelante, un agente de IA que edita. Este documento sirve sobre todo a (2) y (3).

---

## 1. Resumen

- **Avatar en movimiento y efectos:** PixiJS (MIT) dibuja la capa del avatar con máscaras (círculo,
  rectángulo redondeado, formas libres); gl-transitions (MIT, 125 transiciones) y pixi-filters (MIT,
  unos 40 efectos) le suman transiciones y efectos listos. El mismo código dibuja el visor y la capa
  que se exporta, y el `ffmpeg` que ya trae Vimo la pone encima del video.
- **Interfaz del editor:** react-resizable-panels, dnd-timeline con dnd-kit, react-moveable, cmdk,
  react-hotkeys-hook, wavesurfer.js y react-colorful. Todas MIT o BSD, gratis y compatibles con
  React 19.
- **HeyGen no tiene SDK oficial para generar videos de avatar.** Se integra con su API REST v3, que
  publica su especificación OpenAPI (de ahí salen los tipos). Hay que construir directo en v3: v1 y
  v2 se apagan el **2026-10-31**.
- **HeyGen resuelve lo central:** mueve los labios del avatar sobre nuestra propia narración (se le
  manda el pedazo de audio) y entrega el avatar sin fondo (WebM con canal alfa).
- **Descartadas por licencia:** Remotion (gratis solo hasta 3 empleados), Twick, Shotstack Studio,
  OpenVideo/designcombo, Theatre.js Studio (AGPL), Etro (GPL), tldraw, peaks.js (LGPL) y Diffusion
  Studio (marca de agua sin licencia paga).
- **Antes de construir hay que probar:** WebCodecs dentro del WKWebView de la app y que el `ffmpeg`
  de Windows y de Mac Intel lea el alfa de un WebM (§10).
- **Pendiente del dueño:** el visto bueno de HeyGen para que Vimo use la clave de cada usuario
  (§7.6).

## 2. Punto de partida: cómo está Vimo hoy

Lo que pesa al elegir librerías, según el escaneo del repo:

- **El video final lo arma `ffmpeg` desde el sidecar** (`pipeline/stages/render/`): bloques de 30
  escenas renderizados por separado (Ken Burns con el filtro `perspective`, clips de IA, fundidos
  `xfade` de 8 cuadros), unidos y mezclados con la narración y la música. Reloj de 25 cuadros por
  segundo; salida de 1920×1080 o 1080×1920.
- **El visor del editor imita el render con HTML y CSS** (`EditorVisualComposition.tsx`,
  `previewCameraStyle.ts`): imágenes con `transform`, clips en `<video>`, fundidos con opacidad. No
  usa canvas ni WebGL. Con el render comparte solo constantes de `@pipeline/animation`; el movimiento
  de cámara está escrito dos veces (expresión de ffmpeg y CSS).
- **No hay capas ni pistas superpuestas.** El render es una secuencia plana de bloques más dos
  pistas de audio, y el timeline tiene tres filas fijas (V1, A1, A2). El avatar va a ser la primera
  pista superpuesta: necesita un archivo nuevo por proyecto con sus fragmentos y su movimiento, y un
  paso nuevo en la mezcla final.
- **El timeline es propio, sin librería:** zoom por niveles, arrastre del límite entre escenas y
  selección de una escena. No tiene multiselección, recorte de clips, imanes, deshacer ni pistas.
- **El `ffmpeg` de Vimo (6.0 en Mac arm64) ya tiene lo necesario para componer el avatar:**
  `overlay`, `alphamerge`, `maskedmerge`, `geq`, `chromakey`, `colorkey`, `despill`, `xfade` (46
  transiciones con nombre más `custom`; las 12 más nuevas piden ffmpeg 6.1), el decodificador
  `libvpx-vp9` (necesario para leer el alfa de un WebM) y los codificadores ProRes y VP9. Los
  binarios de Windows y de Mac Intel no se pudieron revisar desde esta Mac.
- **Webviews:** WKWebView en macOS 11 o más y WebView2 en Windows. Hoy `src/` no usa WebCodecs,
  WebGL ni workers.
- **Diseño:** Tailwind 3.4 con tokens HSL, kit propio al estilo shadcn sobre Radix, lucide-react,
  framer-motion, las fuentes Outfit, DM Sans y Caveat, y 31 doodles SVG que se dibujan solos.
- **Proveedores:** sumar HeyGen sigue la receta de `docs/ARCHITECTURE.md` §4, y hay un contrato
  asíncrono parecido en uso para los clips animados (`pipeline/providers/video/types.ts`). La clave
  iría al mismo llavero que las otras ocho.

## 3. Referencia de interfaz: el editor de VidRush

Revisado en la cuenta del dueño, solo mirando (sin generar nada). Las capturas no se suben al repo;
esto es lo que muestran:

- **Barra superior de una línea.** A la izquierda, el logo: con el mouse encima se cambia por una
  casita sobre un cuadrado gris redondeado («Back to home»). Al lado, siete herramientas como
  íconos: Texto, Elementos (video e imagen de stock), Transiciones, Audio (efectos y música),
  Animaciones (212 plantillas de motion graphics por categoría), Local (subir archivos) e Historial.
  Al centro, las migas «All Projects / nombre del proyecto». A la derecha, ayuda, guardar,
  «Render video» (el único botón de color fuerte) y el botón del agente.
- **Cada herramienta abre un panel flotante a la izquierda** (tarjeta redondeada con buscador y
  grilla de previews animadas); el visor se corre para dejarle lugar.
- **El agente (Rush Agent) es un panel acoplado a la derecha:** chat con sugerencias, modo «Agent» y
  el atajo ⌘L para pasarle el clip seleccionado en el timeline. Está en beta y cobra créditos por
  pedido.
- **Timeline abajo, en un panel que se agranda arrastrando el borde:** deshacer y rehacer, play,
  velocidad, zoom y exportar. Pistas de subtítulos, b-roll, animaciones superpuestas (moradas),
  narración y música con forma de onda; cada pista se puede ocultar, silenciar y bloquear, y las
  transiciones (Film Burn, Zoom, Glitch) aparecen como marcas entre clips.
- Fondo oscuro con un patrón suave de ondas y tipografía Manrope.

## 4. Efectos y avatar en movimiento

| Librería              | Qué nos da                                                                                  | Licencia                                                                                                                               | Dónde corre                            |
| --------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **PixiJS** 8.22       | Composición por GPU: capas, máscaras (círculo, rectángulo redondeado, SVG), shaders propios | [MIT](https://github.com/pixijs/pixijs/blob/dev/LICENSE)                                                                               | WebGL2/WebGPU, en WKWebView y WebView2 |
| **pixi-filters** 6.1  | Unos 40 efectos: brillo, sombra, contorno, glitch, separación RGB, desenfoque de movimiento | [MIT](https://github.com/pixijs/filters/blob/main/LICENSE)                                                                             | Igual que PixiJS                       |
| **gl-transitions**    | 125 transiciones GLSL que se usan como filtros de Pixi                                      | [MIT](https://github.com/gl-transitions/gl-transitions/blob/master/LICENSE) (2 de las 125 son BSD)                                     | Cualquier WebGL                        |
| **`xfade` de ffmpeg** | 46 transiciones de pantalla completa entre dos clips, ya incluidas en Vimo                  | [LGPL-2.1+](https://github.com/FFmpeg/FFmpeg/blob/master/libavfilter/vf_xfade.c); el binario de Vimo es GPL, ya asumido en la ADR-0013 | Sidecar                                |
| **dotLottie**         | Animaciones Lottie: flechas, acentos, stickers                                              | [MIT](https://github.com/LottieFiles/dotlottie-web/blob/main/LICENSE)                                                                  | Navegador                              |
| **Mediabunny** 1.61   | Leer cuadros exactos de un video; codificar y empaquetar MP4 o WebM                         | [MPL-2.0](https://github.com/Vanilagy/mediabunny/blob/main/LICENSE) (ver §9)                                                           | Navegador (WebCodecs) y Node           |
| **anime.js** 4.5      | Líneas de tiempo y curvas de animación                                                      | [MIT](https://github.com/juliangarnier/anime/blob/master/LICENSE.md)                                                                   | Navegador                              |
| **GSAP** 3.15         | Lo mismo que anime.js, más SplitText y MorphSVG                                             | [Licencia propia, gratis](https://gsap.com/standard-license), con una cláusula sobre competir con Webflow (ver §9)                     | Navegador                              |

### Cómo encajarían (propuesta; se decide en el diseño del sub-proyecto 3)

1. El movimiento del avatar se guarda como datos: por cada fragmento, una lista de puntos clave con
   posición y tamaño, forma de la máscara, borde, sombra, curva y transición. Es el mismo formato
   que después va a escribir el agente de IA.
2. PixiJS dibuja esa capa en el visor, con las transiciones de gl-transitions y los efectos de
   pixi-filters.
3. Para exportar, el mismo código dibuja la capa cuadro por cuadro (no en tiempo real) y el sidecar
   la pone encima del video con `overlay`. Así el visor muestra exactamente lo que sale en el video,
   algo que hoy se mantiene a mano.
4. Para codificar esa capa hay dos caminos: WebCodecs, más rápido pero sin confirmar dentro del
   WKWebView de la app, o mandar los cuadros al sidecar para que los codifique `ffmpeg`, más lento
   pero sin riesgo de plataforma. Un minuto son 1.500 cuadros a 25 por segundo.

**Atajo para un primer MVP:** con posiciones fijas (pantalla completa, costado, círculo en una
esquina) y transiciones simples alcanza con `ffmpeg` solo: `overlay` con expresiones de posición,
una máscara PNG con `alphamerge` y `xfade`. Se queda corto apenas los movimientos llevan curvas o las
formas cambian.

**Alternativa con más cosas listas: HyperFrames**, de HeyGen
([Apache-2.0](https://github.com/heygen-com/hyperframes/blob/main/LICENSE), versión 0.8). Trae
reproductor, un catálogo de 170 bloques y 222 componentes (transiciones, imagen en imagen, paneles
laterales) y está pensado para agentes de IA. El costo: exporta con Chrome sin ventana (unos 100 MB
por plataforma, que se podrían descargar la primera vez), pide Node 22 o más en el sidecar, el visor
(WebKit) y el render (Chromium) pueden diferir en macOS, y su API está en 0.x y cambia rápido.

Llevar todo el render a un navegador no conviene: `ffmpeg` sigue siendo la columna del video.

## 5. Interfaz del editor

| Necesidad                                        | Librería                                                                                     | Licencia                                                                                                                              | Nota                                                                                                                                                                        |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Paneles que se agrandan arrastrando el borde     | **react-resizable-panels** 4.14                                                              | [MIT](https://github.com/bvaughn/react-resizable-panels/blob/main/LICENSE.md)                                                         | El `Resizable` de shadcn la envuelve con clases de Tailwind 4, que hay que pasar a Tailwind 3                                                                               |
| Timeline de varias pistas                        | **dnd-timeline** 3.1 + **@dnd-kit**                                                          | [MIT](https://github.com/samuelarbibe/dnd-timeline/blob/main/LICENSE) / [MIT](https://github.com/clauderic/dnd-kit/blob/main/LICENSE) | Mover, estirar, cambiar de pista, zoom; sin estilos propios. La regla, el cabezal y los imanes van por nuestra cuenta, con el timeline de OpenCut clásico como guía (abajo) |
| Mover, agrandar y rotar el avatar sobre el visor | **react-moveable** 0.56                                                                      | [MIT](https://github.com/daybrush/moveable/blob/master/LICENSE)                                                                       | Sin versiones desde 2023: fijar la versión y envolverla en un componente propio para poder cambiarla                                                                        |
| Paleta de comandos, menús y atajos               | **cmdk** 1.1, Radix context-menu, menubar, slider y toggle-group, **react-hotkeys-hook** 5.3 | MIT                                                                                                                                   | Una sola lista de acciones del editor alimenta los menús, los atajos y, después, las herramientas del agente de IA                                                          |
| Forma de onda del audio                          | **wavesurfer.js** 7.12                                                                       | [BSD-3](https://github.com/katspaugh/wavesurfer.js/blob/main/LICENSE)                                                                 | La 8.0 salió hace dos semanas; empezar en 7.12                                                                                                                              |
| Selector de color                                | **react-colorful** 5.8                                                                       | [MIT](https://github.com/omgovich/react-colorful/blob/master/LICENSE)                                                                 | En macOS no existe el cuentagotas del sistema (EyeDropper): el color se toma del visor                                                                                      |

- **OpenCut clásico** ([MIT](https://github.com/OpenCut-app/opencut-classic/blob/main/LICENSE),
  archivado el 2026-05-17) no es una librería, pero su código de timeline (regla, cabezal, imanes,
  forma de onda, editor de curvas) y sus comandos (cada edición es un comando, lo que da deshacer y
  rehacer) son una buena guía. Si se copia algo, va con su aviso de licencia.
- **Arrastrar en Windows:** el drag and drop de HTML5 en WebView2 solo funciona con
  `dragDropEnabled: false`, que apaga el soltar archivos de Tauri. dnd-kit usa eventos de puntero y
  no tiene ese problema.
- **Componentes vistosos para copiar (no se instalan):** Kibo UI (MIT: reproductor, selector de
  color, recorte de imagen) y Magic UI (MIT). Están escritos para Tailwind 4 y `motion/react`: hay que
  adaptarlos a Tailwind 3 y `framer-motion`. Animate UI y React Bits usan MIT con Commons Clause (se
  pueden usar dentro de la app, no revender los componentes). Aceternity no publica licencia para sus
  componentes gratis: mejor no usarlo.

## 6. Íconos y estilo doodle

- **Tabler Icons** ([MIT](https://github.com/tabler/tabler-icons/blob/main/LICENSE), 6.238 íconos)
  usa la misma grilla y el mismo trazo que lucide, así que conviven y se pueden animar dibujándose,
  como los doodles. Otras MIT: Hugeicons (solo el estilo Stroke Rounded es gratis), Phosphor e
  Iconoir. Remix Icon pasó en la 4.9 a una licencia propia que prohíbe usarlo como logo.
- **Para íconos doodle propios:** roughjs y svg2roughjs (MIT) convierten íconos de Tabler o lucide en
  versiones a mano alzada al compilar. Los Doodle Icons de Khushmeen son CC0 (sin atribución), pero
  falta ver si su trazo combina con el nuestro.
- **Streamline Freehand** pide crédito visible, un máximo de 50 íconos y que el usuario no los pueda
  elegir: no conviene.
- Los momentos de marca (el cohete, la casita del editor) siguen siendo doodles dibujados para Vimo.

## 7. HeyGen

### 7.1 Cómo se integra

- **No hay SDK oficial para generar videos de avatar.** `@heygen/streaming-avatar` y
  `@heygen/liveavatar-web-sdk` son para avatares en vivo, no para esto. HeyGen publica la
  [especificación OpenAPI](https://developers.heygen.com/openapi/external-api.json) de su API y de
  ahí se generan los tipos. Su CLI en Go y su servidor MCP no nos sirven para la app.
- **Solo v3.** HeyGen anunció en abril de 2026 que v1 y v2 se apagan el **2026-10-31**
  ([changelog](https://developers.heygen.com/changelog)).
- Base `https://api.heygen.com`, autenticación con el encabezado `X-Api-Key`. La clave de cada
  usuario va al llavero como las demás; HeyGen permite claves con permisos acotados
  (`videos:write`, `assets:write`).

### 7.2 Endpoints que usaríamos

| Método | Ruta                             | Para qué                                                                       |
| ------ | -------------------------------- | ------------------------------------------------------------------------------ |
| GET    | `/v3/users/me`                   | Validar la clave y leer el saldo                                               |
| GET    | `/v3/avatars/looks`              | Avatares de stock (`ownership=public`) y propios, con los motores que soportan |
| POST   | `/v3/assets`                     | Subir el pedazo de narración (hasta 32 MB; el id no vence)                     |
| POST   | `/v3/videos/batches`             | Hasta 100 renders en un pedido; cada uno sale o falla por separado             |
| GET    | `/v3/videos/statuses`            | Estado de hasta 100 videos a la vez                                            |
| POST   | `/v3/avatars`                    | Crear un avatar: `photo`, `digital_twin` o `prompt`                            |
| POST   | `/v3/avatars/{group_id}/consent` | Link de consentimiento por webcam para un gemelo digital (vale 24 h)           |

Parámetros clave de cada render (`POST /v3/videos`, el mismo cuerpo que va en el lote):
`avatar_id`; `audio_asset_id` o `audio_url` en lugar de texto (el video dura lo que dura el audio);
`engine` (`avatar_iv` por defecto, `avatar_v`, `avatar_iii`); `output_format: "webm"`;
`aspect_ratio`; `resolution`; y el encabezado `Idempotency-Key`, que vale 24 h. Los webhooks piden
una URL pública, que una app de escritorio no tiene: se consulta el estado.

### 7.3 El minuto de avatar en fragmentos

Recomendación: **un render por fragmento**, todos en un solo pedido de lote.

1. Validar la clave y mostrar el saldo y el costo estimado (segundos por la tarifa del motor).
2. El usuario elige el avatar, de stock o propio.
3. Por cada fragmento se corta su pedazo de la narración en WAV, con 0,2 a 0,3 s de margen a cada
   lado, y se sube.
4. Se piden todos juntos con `output_format: "webm"` y una clave de idempotencia que sale de un hash
   del avatar, el motor, los ajustes y el audio.
5. Se consulta el estado con espera creciente, se descarga cada video apenas está listo (los links
   vencen) y se guarda en el proyecto con ese hash.
6. `ffmpeg` pone cada clip en su momento y sin su audio: suena nuestra narración.

Por qué así y no un solo video cortado después: los renders corren en paralelo (hasta 10 a la vez);
si uno falla se repite solo ese, y los fallos no se cobran; cambiar un fragmento no obliga a regenerar
el minuto entero; y cada fragmento empieza y termina con un gesto natural. Un video continuo cortado
deja cortes a mitad de gesto y cobra los silencios que separan los fragmentos.

### 7.4 Fondo transparente

- `output_format: "webm"` saca el avatar sin fondo, en un WebM con canal alfa
  ([documentación](https://developers.heygen.com/transparent-background-videos)). Funciona con los
  motores Avatar III, IV y V, no con Cinematic. El avatar tiene que estar entrenado con recorte
  («matting»); si no lo está, la API responde «This video avatar does not support webm output» y
  hay que caer a fondo verde más `chromakey`. Con WebM no se puede mandar un `background`.
- **WKWebView no reproduce VP9 con alfa.** El sidecar convierte el WebM una sola vez a un H.264 con
  el alfa apilado (color arriba, alfa abajo) y el visor lo recompone con un shader
  ([referencia](https://github.com/jakearchibald/stacked-alpha-video), Apache-2.0). Para leer el
  alfa, `ffmpeg` tiene que decodificar con `libvpx-vp9`: el de Mac arm64 lo trae; los de Windows y
  Mac Intel hay que confirmarlos.
- La API no ofrece posición, escala ni recorte en círculo: el movimiento lo hace Vimo sobre un clip
  de 1080p.

### 7.5 Costos

Según la [página de precios de la API](https://help.heygen.com/en/articles/10060327-heygen-api-pricing-explained),
actualizada el 2026-09-16:

| Concepto                                      | USD           |
| --------------------------------------------- | ------------- |
| Avatar III, gemelo digital                    | 0,60 / minuto |
| Avatar III, avatar de estudio o de foto       | 0,99 / minuto |
| Avatar IV, avatar de foto                     | 2,31 / minuto |
| Avatar IV, gemelo digital o avatar de estudio | 4,83 / minuto |
| Avatar V, gemelo digital                      | 7,20 / minuto |
| Crear un avatar desde una foto                | 1,32 c/u      |
| Crear un gemelo digital                       | 2,13 c/u      |

- Se cobra por segundo generado; los renders fallidos o cancelados no se cobran.
- **La billetera de la API es aparte de los planes web** (Creator, Pro, Business), y **no hay
  créditos gratis de API desde febrero de 2026.** Los créditos comprados vencen a los 12 meses.
- Hasta 10 renders a la vez en el plan de pago por uso.
- Tiempo de render: la documentación para desarrolladores dice de 1 a 5 minutos por video; el centro
  de ayuda habla de unos 10 minutos por minuto de video.
- Un minuto de avatar cuesta entre 0,60 y 7,20 USD según el motor y el tipo de avatar.

### 7.6 Términos

Según los [términos](https://www.heygen.com/terms) (actualizados el 2026-07-23) y la
[política de moderación](https://www.heygen.com/moderation-policy):

- **Uso comercial:** los términos lo otorgan a los planes Creator, Pro y Business. Para quien solo
  compra créditos de API no queda claro.
- **Una app de terceros con la clave del usuario:** los términos dicen que el usuario no puede
  «autorizar a terceros» a usar el servicio, ni construir por API productos «competitivos» salvo que
  HeyGen lo habilite. La API existe justamente para integrarse y el cliente sigue siendo el usuario,
  pero **conviene tener el visto bueno de HeyGen por escrito** (formulario de integraciones o ventas)
  antes de lanzar.
- **Personas reales:** el gemelo digital pasa por el consentimiento de HeyGen con webcam. En un avatar
  desde foto, el permiso es responsabilidad del usuario. La moderación prohíbe usar personas reales
  sin consentimiento y el contenido político, de desinformación o violento, algo a tener en cuenta con
  los temas de los videos de YouTube.
- Editar y componer el resultado está permitido.

### 7.7 Crear avatares desde Vimo

- **De stock:** se listan y se usan, sin costo de creación.
- **Desde una foto:** `POST /v3/avatars` con `type: "photo"`, 1,32 USD, sin paso de consentimiento.
- **Gemelo digital desde un video** de 15 a 600 s (lo ideal, unos 2 minutos en 1080p): 2,13 USD;
  también clona la voz, y el consentimiento va por un link de HeyGen con webcam que vale 24 h.
- **Desde un texto** (`type: "prompt"`): disponible, sin precio publicado.

## 8. Descartadas

| Librería                                                                   | Por qué no                                                                                                                                                                                            |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remotion                                                                   | [Licencia propia](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md): gratis solo para empresas de hasta 3 empleados (la 5.0 cuenta también contratistas); exporta con Chrome sin ventana |
| OpenVideo (ex designcombo react-video-editor), `@designcombo/timeline`     | Mismo esquema que Remotion; el timeline trae una licencia comercial paga que prohíbe competir                                                                                                         |
| Twick                                                                      | «Sustainable Use License»: pide licencia paga si el producto compite o gana dinero con sus funciones, y el dueño puede cambiar los términos                                                           |
| Shotstack Studio SDK                                                       | PolyForm Shield: prohíbe competir con su negocio de edición de video                                                                                                                                  |
| Theatre.js Studio, Ektie/react-video-timeline-editor, audiomotion-analyzer | AGPL                                                                                                                                                                                                  |
| Etro                                                                       | GPL-3.0                                                                                                                                                                                               |
| peaks.js                                                                   | LGPL-3.0: obligaciones de reenlazado en una app cerrada y empaquetada                                                                                                                                 |
| tldraw                                                                     | Pide una clave paga para producción                                                                                                                                                                   |
| Diffusion Studio Core                                                      | Licencia contradictoria (MPL en el archivo, marca de agua sin clave paga en el README) y sin actividad desde 2025-11                                                                                  |
| Motion Canvas, editly, FFCreator, VideoContext, ffmpeg-gl-transition       | Abandonadas, o con dependencias nativas que chocan con el sidecar compilado                                                                                                                           |
| WebAV                                                                      | Solo corre en Chrome, Edge y Electron                                                                                                                                                                 |
| Vidstack                                                                   | Deprecada; recomiendan Video.js 10                                                                                                                                                                    |
| Aceternity UI                                                              | Sin licencia publicada para los componentes gratis                                                                                                                                                    |

## 9. Lo que hay que cumplir si se adoptan

- **Avisos de copyright:** MIT, ISC, BSD y Apache piden distribuir el aviso de cada librería.
  Conviene generar al compilar una pantalla «Licencias de terceros».
- **Mediabunny (MPL-2.0):** la obligación cubre solo sus propios archivos. Vimo sigue cerrado, pero
  hay que indicar dónde está su código fuente y publicar los cambios que le hagamos a esos archivos.
- **GSAP:** prohíbe usarlo en herramientas que compitan con la animación visual de Webflow. Para un
  editor de video el riesgo es bajo; anime.js o las curvas de framer-motion (ya instalado) lo evitan.
- **ffmpeg:** nada nuevo; el binario ya es GPL y está asumido en la ADR-0013.
- **Animaciones de LottieFiles** (Lottie Simple License): uso comercial sin atribución, pero no se
  pueden empaquetar en un servicio que compita con LottieFiles.

## 10. Pruebas antes de construir y preguntas abiertas

Pruebas cortas, de horas cada una, antes del diseño del sub-proyecto 3:

1. WebCodecs (`VideoEncoder`) dentro del WKWebView de la app (macOS 11 o más) y en WebView2.
2. Que los `ffmpeg` de Windows y de Mac Intel decodifiquen VP9 con alfa (`libvpx-vp9`).
3. PixiJS reproduciendo un H.264 con alfa apilado, sincronizado con la narración, en las dos
   webviews.
4. Con créditos de la API (2 a 5 USD): un render de 60 s contra cuatro de 15 s, para ver el redondeo
   en la actividad de la cuenta de HeyGen.

Preguntas abiertas:

- El visto bueno de HeyGen para el modelo de clave del usuario (§7.6): lo tiene que pedir el dueño.
- Qué motor de avatar ofrecer por defecto (costo frente a calidad): se decide en el sub-proyecto 2.
- Si los avatares desde foto soportan WebM con alfa en Avatar IV: la documentación no es clara.
- Cuánto duran los links de descarga y cuánto guarda HeyGen los videos.

## 11. Fuentes de HeyGen

- Cambios de versión: https://developers.heygen.com/changelog
- Comparación de versiones: https://developers.heygen.com/endpoint-version-comparison
- Especificación OpenAPI: https://developers.heygen.com/openapi/external-api.json
- Crear video: https://developers.heygen.com/reference/create-video
- Video desde audio propio: https://developers.heygen.com/audio-to-video
- Fondo transparente: https://developers.heygen.com/transparent-background-videos
- Lotes: https://developers.heygen.com/batch-videos
- Límites de uso: https://developers.heygen.com/docs/usage-limits
- Subir archivos: https://developers.heygen.com/docs/upload-assets
- Crear avatares: https://developers.heygen.com/docs/create-avatar
- Consentimiento: https://developers.heygen.com/docs/avatar-consent
- Códigos de error: https://developers.heygen.com/docs/error-codes
- Permisos de las claves: https://developers.heygen.com/docs/api-key-permissions
- Precios de la API: https://help.heygen.com/en/articles/10060327-heygen-api-pricing-explained
- Tiempos de render: https://help.heygen.com/en/articles/9655503-heygen-video-processing-times
- Términos: https://www.heygen.com/terms
- Política de moderación: https://www.heygen.com/moderation-policy
