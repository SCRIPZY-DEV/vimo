# ADR-0047 — Animación de escenas: el clip canjea huecos, no los crea

> Identificador reasignado el 2026-09-29 al integrar dev: antes ADR-0040. Se conserva el contenido histórico; ADR-0040 pertenece a la política de beta de dev.

- **Estado:** Reemplazada en duración, proveedores y planificación por [ADR-0042](ADR-0042-animacion-kie-por-intervalos-y-recibos.md) el 2026-09-14. Se conserva el principio de ocupar intervalos existentes.
- **Fecha:** 2026-09-12
- **Área:** pipeline | providers | app
- **Extiende a:** [ADR-0013](ADR-0013-modulo-create-runner-de-stages-y-binarios.md)
  (las 6 fases y el corte por tiempo), [ADR-0014](ADR-0014-modulo-library-edicion-sobre-stages.md)
  (la edición es cirugía sobre un proyecto ya generado) y
  [ADR-0031](ADR-0031-saldo-por-proveedor-precheck-y-pausa-retomable.md)
  (saldo por proveedor y pausa retomable).

## Problema

Un video de Vimo es una sucesión de imágenes fijas con un paneo encima. Se ve
bien, pero se lee como una presentación de diapositivas. Convertir una imagen en
un clip de video con un modelo de imagen-a-video la vuelve una toma de verdad.

El obstáculo no es llamar al proveedor: es el reloj. **El audio manda.** La
narración ya está grabada, transcrita palabra por palabra y cortada en escenas
con tiempos exactos; el video dura exactamente lo que dura el audio. Si una
escena de 3 segundos pasa a durar los 6 que exige el modelo, todas las escenas
siguientes se corren y el video termina más largo que la narración.

Y el mínimo existe: los dos proveedores elegidos no generan clips de menos de
varios segundos, mientras que el corte por defecto de la app deja escenas de
unos 3 segundos.

## Decisión

**Un clip nunca se inserta: canjea huecos que ya existían.** Se le pide al
proveedor un clip de duración fija y al renderizar se lo normaliza al largo
exacto del hueco que ocupa. La suma de duraciones no cambia, así que el timeline
es invariante _por construcción_ y no hace falta ningún chequeo de desfase.

Las piezas:

1. **Planificador puro** (`pipeline/animation/planner.ts`). Recibe las escenas
   del proyecto y los ids marcados, y devuelve unidades: qué escenas cubre cada
   clip. Agrupa escenas **contiguas** hasta acercarse lo más posible a la
   duración del clip, y entre dos agrupaciones igual de buenas prefiere la más
   corta, porque absorber de más cuesta un plano. Si no hay escena siguiente
   —animar la última— toma la anterior. Si ni sola ni agrupada entra en la
   ventana de duración, la marca se rechaza con su motivo y su largo real.
   _(Superado por [ADR-0041](ADR-0041-animacion-motor-del-tablero-prompt-con-vision-y-clip-como-bloque.md):
   el criterio es el costo de deformación del clip con castigo al corte, que
   con escenas de 4 s elige la fusión y no la escena sola.)_
2. **Se apoya en los tiempos reales de cada escena**, nunca en una duración
   nominal. Por eso vale igual para el corte del catálogo (la duración del audio
   repartida en ventanas iguales, ≈3 s) y para el carril de segundos por escena
   de «Mi estilo» (ADR-0019), donde una ventana muda puede quedar absorbida y la
   última escena medir distinto.
3. **Duración fija de 6 segundos** en esta versión. Los dos proveedores aceptan
   más, pero un solo valor deja una sola forma de planificar y 6 s es lo que
   cubre dos escenas de 3 s. Subirlo o hacerlo variable es un cambio de
   constante, no de diseño.
4. **Dos proveedores, elegidos por la persona en cada proyecto**: Kie.ai con
   Seedance y PoYo con Veo 3.1 Lite, los dos a 720p y sin audio nativo. El
   modelo es una **constante del proveedor**, no un selector (mismo criterio que
   ADR-0015 con gpt-image-2): agregar un modelo es agregar un proveedor.
5. **La escena absorbida no se borra.** Conserva su imagen y su prompt y solo
   gana `absorbedBy`. Deshacer la animación la devuelve intacta.
6. **El costo real lo dicta el proveedor.** Las dos APIs devuelven los créditos
   efectivamente cobrados por cada tarea; ese número se persiste. La tabla de
   precios local solo sirve para estimar ANTES de gastar.
7. **Respaldo sin costo:** una escena cuyo clip falla después de los reintentos
   se queda estática. Como toda escena estática ya lleva paneo, el respaldo no
   hay que construirlo — es el comportamiento actual.

### Contrato con la app

- **Dos subcomandos** en el dominio `videos`: `animate-scenes` (marcas, proveedor
  y `force` para rehacer) y `get-video-credits` (saldo de los dos proveedores,
  con la forma de `get-image-credits` para reusar la alerta de saldo de
  ADR-0031). El proveedor elegido se persiste en `options.videoProvider`.
- **Eventos por escena**, espejo de los de imagen: `scene-animation-started`,
  `scene-animation-progress`, `scene-animation-ready` y
  `scene-animation-failed` (con el motivo técnico del proveedor, que es lo que
  el modal de fallo muestra), más `animation-provider-trouble` cuando el
  cortacircuitos da un proveedor por caído dentro del job.
- **En disco**: el clip vive en `animations/scene_<id>.mp4`, la animación en la
  escena que encabeza (`Scene.animation`) y las cubiertas llevan `absorbedBy`.
  Solo se persisten tres estados —pendiente, listo, error— y ninguno
  transitorio, para que un job muerto no deje un «generando» huérfano.
- **Guard de tareas pagas**: la tarea del proveedor se persiste apenas se acepta
  y cualquier reintento la consulta antes de crear otra; una tarea viva al vencer
  el plazo NO se re-encarga, queda pendiente y se cosecha en la siguiente
  corrida. Rehacer un clip reescribe el prompt (huella nueva), salvo que haya
  una tarea pendiente que cosechar.
- **En el render**: un clip listo reemplaza al bloque de escenas que cubre y se
  normaliza al tramo con `setpts` (estira o comprime), `fps` del proyecto,
  `tpad` del último cuadro y `trim` exacto; sin Ken Burns. Cualquier clip que no
  esté impecable —archivo ausente, duración no medible, escenas cubiertas que ya
  no son contiguas— se ignora y sus escenas salen estáticas. Los manifests de
  cache de las escenas estáticas quedan byte-idénticos: no hace falta subir
  `RENDER_CACHE_VERSION`.

### Lo que NO se decide acá

No hay fase nueva en el runner de Create: animar es **cirugía de editor** sobre
un proyecto ya generado, como `regenerate-scene-images` (ADR-0014). Por eso
`STAGE_IDS` no cambia y ningún `project.json` existente se toca.

## Alternativas consideradas

- **Alargar la escena animada y correr las siguientes** — descartada: rompe la
  sincronización con el audio, que es la única garantía dura del pipeline
  invertido (voz primero, corte por tiempo).
- **Recortar siempre: generar el clip completo y usar solo los segundos de la
  escena** — descartada como regla general porque con escenas de 3 s se tira la
  mitad de lo que se paga. Sobrevive como caso particular: cuando la agrupación
  más cercana mide menos que el clip, el sobrante se recorta.
- **Volver a cortar el tramo animado a la duración del clip y regenerar sus
  imágenes y prompts** — descartada para esta versión: da mejor narrativa pero
  cuesta texto e imágenes de más, y solo sirve al animar rangos, no una escena
  suelta. Queda anotada como mejora.
- **Un modelo con visión para escribir el prompt de animación** — descartada por
  ahora por pedido del dueño: primero se prueba con el contexto de la escena y
  su prompt de imagen, que ya están en disco. La entrada del generador está
  aislada para poder sumarle visión sin tocar el resto. _(Superado: probado el
  resultado, el dueño pidió la visión y entró en
  [ADR-0041](ADR-0041-animacion-motor-del-tablero-prompt-con-vision-y-clip-como-bloque.md).)_
- **Esperar al servidor de Vimo de [ADR-0032](ADR-0032-proveedores-en-servidor-y-creditos-de-vimo.md)**
  — descartada: esa ADR es una propuesta sin fecha y la animación se necesita
  antes. Los dos proveedores entran con clave propia como todos los demás, y
  detrás del mismo contrato, así que migran con el resto cuando llegue.

## Consecuencias

- Animar **cuesta un plano**: donde había dos imágenes queda una sola toma. Es
  el precio de no mover el timeline y hay que decirlo en la interfaz.
- **Ningún proveedor publica si un modelo está caído.** Se verificó: Kie.ai
  referencia una página de estado que no existe y el campo de estado por modelo
  de PoYo dice «estable» en los 196 modelos de su catálogo. La app tiene que
  detectarlo sola, contando fallos terminales seguidos y sin contar los rechazos
  atribuibles a la persona (saldo, validación, moderación).
- **El límite de ritmo es por cuenta**, 20 tareas nuevas cada 10 segundos en los
  dos, y el exceso devuelve 429 sin encolar: se pierde el turno. La concurrencia
  se limita con margen.
- **Las URLs del resultado expiran a las 24 horas**: el clip se descarga apenas
  termina, como ya se hace con las imágenes.
- Un proyecto sin escenas animadas renderiza **byte-idéntico** a hoy: los campos
  nuevos de `Scene` son todos opcionales y ausentes.

## Verificación

- `pipeline/animation/planner.ts` es una función pura y se verifica con casos
  ejecutables que cubren: el caso del tablero (escenas de 3 s, la marca absorbe
  la siguiente), la última escena (absorbe la anterior), dos marcas contiguas
  (la segunda queda cubierta y no se cobra dos veces), escenas de 2 y de 5
  segundos, escenas más largas que el máximo (rechazo con motivo), un corte real
  con duraciones no redondas (el hueco es la suma exacta) y un video más corto
  que el mínimo animable.
- **La invariante del timeline no necesita chequeo**: el planificador no crea ni
  destruye segundos, solo agrupa escenas existentes, y el clip se normaliza al
  hueco. Cualquier cambio que rompa esa propiedad se ve como una diferencia de
  duración entre el video y el audio, que el render ya detecta.
- Los ids de proveedor están declarados en tres lugares que deben coincidir
  (`pipeline/config/api-keys.ts`, `src/modules/api-keys/providers.ts` y
  `src-tauri/src/api_keys/provider.rs`); el compilador de Rust obliga a cubrir
  cada proveedor nuevo en la validación de claves, así que un alta a medias no
  compila.
