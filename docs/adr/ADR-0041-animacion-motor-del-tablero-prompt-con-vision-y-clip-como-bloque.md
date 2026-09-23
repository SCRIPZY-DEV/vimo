# ADR-0041 — Animación de escenas: el motor del tablero, el prompt con visión y el clip como un solo bloque

- **Estado:** Reemplazada en redactor, planificación y representación por [ADR-0042](ADR-0042-animacion-kie-por-intervalos-y-recibos.md) el 2026-09-14. Los nuevos prompts usan guion y texto estático, sin visión.
- **Fecha:** 2026-09-13
- **Área:** pipeline | providers | app
- **Extiende a:** [ADR-0040](ADR-0040-animacion-de-escenas-el-clip-canjea-huecos.md)
  (el clip canjea huecos, el contrato con la app y el guard de tareas pagas).

## Problema

La primera prueba real de ADR-0040 la hizo el dueño sobre un short de 15
escenas de 4,13 s y devolvió cuatro fallos que tienen una sola causa:

1. Con PoYo, el clip quedó **solo sobre la escena marcada** (4 s, acelerado) y
   no mostraba nada de la escena siguiente.
2. Con Kie.ai se subió **una sola imagen** aunque el proveedor acepta dos, y el
   prompt no describía la escena 2 ni interpretaba el guion.
3. El prompt de movimiento se escribía **sin mirar las imágenes**, así que no
   podía fijar la apariencia del personaje ni describir la composición final.
4. El clip listo **no se veía en el preview** del editor, que seguía mostrando
   la imagen fija.

La causa de 1 y 2 es el planificador: elegía el hueco «más cercano a 6 s» y, a
igual distancia (4 s de la escena sola contra 8 s de las dos), prefería el más
corto. El tablero de Miro que diseñó la funcionalidad dice otra cosa en su
motor de decisión: con escenas más cortas que el clip, **fusión** de
k = ⌈6 / d⌉ escenas contiguas, y el recorte solo cuando fusionar estira de más
o no hay vecina libre. Con d = 4 s eso es fusión de dos escenas en 8 s.

## Decisión

### 1. El motor de decisión del tablero, medido en deformación

`pipeline/animation/planner.ts` sigue siendo una función pura, pero elige entre
los tramos contiguos posibles por **costo de deformación** del clip, no por
distancia en segundos:

- Un hueco más largo que el clip cuesta su factor de cámara lenta
  (8 s → 1,33); uno más corto cuesta su factor de aceleración (5 s → 1,2).
- Un hueco tan corto que habría que acelerar más de `MAX_ANIMATION_SPEED_UP`
  (1,3×) no se acelera: el clip se **corta** a velocidad normal y los segundos
  pagados de más se tiran. Ese corte lleva una penalización fija (0,5), así que
  la fusión con la vecina gana aunque quede en cámara lenta.
- A igual costo gana el tramo con menos escenas (cada escena absorbida es un
  plano perdido) y, entre iguales, el que arranca en la escena marcada.

Los límites: cámara lenta hasta `MIN_ANIMATION_STRETCH` (0,65×, hueco máximo de
9,2 s; antes 8 s) y aceleración hasta 1,3× (4,6 s). Fuera de eso la marca se
rechaza como hasta ahora. Cada unidad declara su **estrategia** y se persiste en
`SceneAnimation.strategy`: `merge` (fusión), `direct` (una escena de 6 s o más)
o `trim` (una escena más corta, el «recorte» del tablero).

Casos que fija el harness: 3 s → fusión de dos (6 s); 4 s y 4,13 s → fusión en
cámara lenta; 4,5 s → fusión a 0,67× antes que tirar 1,5 s; 5 s → sola a 1,2×;
2,9 s → dos escenas a 1,03× (no tres en cámara lenta); 2 s → tres escenas;
7 s → sola; 12 s → rechazo; la última escena toma la anterior; una escena
encerrada entre dos clips se corta a 3 s.

### 2. Una sola regla de ajuste, compartida por el render y el preview

`pipeline/animation/normalization.ts` (browser-safe) dice cómo entra un clip en
su hueco: `speed` (factor de reproducción, se usa el clip entero) o `cut`
(velocidad normal, se corta en el largo del hueco). El chunk de ffmpeg la usa
para el `setpts` y el `trim`; el preview del editor la usa como `playbackRate`
del `<video>`. Lo que la persona ve antes de renderizar es lo que sale.

### 3. El prompt lo escribe un modelo que mira los fotogramas

ADR-0040 dejó la visión afuera «por ahora» a pedido del dueño; probado el
resultado, la pidió. El redactor (`pipeline/animation/prompt.ts`) es el
generador del marco «6 · Prompts de animación» del tablero con dos cambios:

- **Mira las imágenes.** El pedido lleva el primer fotograma y, en una fusión,
  la imagen de la última escena (la composición final). Así fija la identidad
  del personaje —pelo, cara, ropa y colores, tal como se ven— y describe la
  escena final con la precisión que hace falta cuando el proveedor de video
  no la recibe (PoYo acepta una sola imagen). Es exactamente la prueba manual
  del dueño que «quedó brutal»: una imagen subida, la segunda descrita.
- **Repite el estilo en la primera línea.** El tablero pedía no repetirlo; con
  una sola imagen el modelo de video no lo deduce y el resultado se va de
  estilo.

Del tablero se conservan las cuatro capas por bloque (CÁMARA / SUJETO /
AMBIENTE / RITMO), el modo fusión (una sola toma, la transición por movimiento
y nunca por corte, ubicada donde de verdad cambia el fragmento del guion), la
plantilla del usuario (estilo, modo, fragmentos con sus segundos y prompts de
imagen, contexto anterior y siguiente) y la salida en JSON
(`animation_prompt`, `transition_at`, `camera`). Las prohibiciones van dentro
del texto positivo: ni Kie ni PoYo tienen prompt negativo. Los segundos de cada
fragmento llegan ya escalados al clip con la misma regla de ajuste, así el
modelo pone la transición en el segundo 3 aunque el hueco mida 8.

Modelo: `Qwen/Qwen3-VL-235B-A22B-Instruct` en DeepInfra —el que la propia
documentación de visión del proveedor usa de ejemplo; US$ 0,20/M de entrada y
0,88/M de salida, unos US$ 0,001 por prompt con dos imágenes—, configurado en
`LlmConfig.visionModel` y pedido con `LlmRequest.images` (partes `image_url`
con data URIs, el formato OpenAI que DeepInfra documenta). La visión no tiene
tiers ni degradación: si el modelo falla, el redactor sigue con los tiers de
texto sin imágenes y, detrás, el respaldo determinístico de siempre. Un saldo
agotado del LLM sigue subiendo entero (ADR-0031). El tope de caracteres por
proveedor y el recorte en fin de oración no cambian.

### 4. El clip es un solo bloque en el timeline y se reproduce en el preview

- **Timeline:** un clip listo (o en curso) se dibuja como **una tarjeta del
  largo del hueco entero**, con la miniatura de cada escena que cubre en
  proporción a su duración, el borde celeste de siempre y los ids de las
  escenas (`1 · 2`). Las fronteras arrastrables quedan solo entre bloques: la
  que cae dentro de un clip no existe, igual que la escena absorbida no se
  edita sola (invariante 6 del tablero).
- **Anticipo de la decisión:** con una escena seleccionada, el panel dice en
  una línea qué haría el planificador («Cubrirá las escenas 1, 2 en un solo
  plano de 8,3 s», o el motivo del rechazo) y el timeline marca con un borde
  punteado celeste las escenas que absorbería. Es el mismo planificador puro
  que corre el sidecar: `pipeline/animation/planner.ts` no usa APIs de Node y
  la UI lo importa como valor, igual que las constantes de
  `pipeline/types/video-provider.ts`. Sidecar y editor no pueden discrepar.
- **Preview:** bajo el cursor de un clip listo, el visor reproduce el mp4 del
  clip mudo, alineado al reloj de la narración y con el `playbackRate` de la
  regla de ajuste. En pausa o al arrastrar busca el cuadro exacto; sonando,
  solo corrige la deriva grande para no trabar el video.

## Alternativas consideradas

- **Ventana fija de 6 s que cubre la escena entera y parte de la siguiente**,
  con el resto de la siguiente como imagen fija — descartada: introduce huecos
  parciales que el tablero no contempla, un corte seco del clip a la imagen
  fija a mitad de escena y una frontera imposible de explicar en el panel. La
  fusión del tablero absorbe escenas enteras y las invariantes se mantienen.
- **Pedir al proveedor un clip del largo del hueco** (PoYo acepta 4/6/8 s, Kie
  4–12) para no usar cámara lenta — diferida: el dueño fijó 6 s exactos «por
  ahora» y el costo por clip cambiaría con el largo. Es el siguiente paso
  natural si la cámara lenta a 0,75× molesta; entra como cambio de constante y
  de estimación, no de diseño.
- **Interpolar cuadros (`minterpolate`) en la cámara lenta** — diferida: la
  duplicación de cuadros de 24 a 25 fps a 0,75× es apenas perceptible en
  movimiento sutil y el filtro multiplica el tiempo de render.
- **Clips encadenados para escenas más largas de 9,2 s** (el «DIRECTO» del
  tablero para d > 8) — pendiente: hoy esa marca se rechaza con su largo real.

## Consecuencias

- Un short de escenas de ~4 s se anima **de a dos** y en cámara lenta suave; el
  panel lo dice antes de pagar y el timeline lo muestra como un solo bloque.
- Cada prompt cuesta además un pedido al modelo con visión (~US$ 0,001) y tarda
  unos segundos más. Si la visión cae, nada se pierde: el texto escribe.
- Los clips anteriores a esta ADR no tienen `strategy`: se leen como `merge` si
  cubren varias escenas y como `direct` si cubren una. Nada se migra.
- ADR-0040 queda superada en dos puntos: la regla «entre dos agrupaciones igual
  de buenas prefiere la más corta» y la alternativa «un modelo con visión —
  descartada por ahora».

## Verificación

- `scratchpad/check-planner.ts`: 35 chequeos del motor y de la regla de ajuste.
- `scratchpad/check-animation-prompt.ts`: 11 chequeos del redactor (cadena
  visión → texto → respaldo, JSON, plantilla del tablero, tramos con segundos,
  Kie con dos referencias, tope por proveedor).
- `scratchpad/check-animate-scenes-e2e.ts`: 12 escenarios del sidecar real con
  proveedores falsos (`node --import`), incluido el modelo con visión caído.
- `scratchpad/check-clip-render.ts`: ffmpeg real, clip de 6 s ajustado por
  velocidad y por corte, cuadro a cuadro contra la escena estática del mismo
  hueco.
