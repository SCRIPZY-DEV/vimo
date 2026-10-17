# Fix: la narración citada ya no llega al prompt de video

- 📅 **Fecha:** 2026-10-15
- 🌿 **Rama:** `feat/demo-actualizacion`
- **Área:** el redactor del primer pase de la animación (`pipeline/animation/prompt.ts`), el limpiador nuevo
  (`pipeline/animation/narration-quotes.ts`) y el escritor del movimiento del avatar
  (`pipeline/avatar/motion-prompt.ts`). No cambia el contrato con la app, las fases, los modelos de texto ni los
  proveedores de video.
- **Relacionado:** el error conocido `video-ia-dibuja-como-subtitulos-las-frases-citadas-en-el-prompt` (registro
  global de errores, 2026-10-15) y la ADR-0042 (redactor y revisor de la animación por intervalos), que no cambia.

## Causa

Grok Imagine 1.5 (Kie) dibuja como texto en pantalla lo que el prompt de video cita entre comillas, aunque el
mismo prompt termine con «add no text or watermarks».

El redactor recibe por escena las `narration_cues` (cada palabra con su tiempo) y su prompt del sistema lo
invitaba a citarlas: «Spoken-word quotes may anchor timing…». El modelo escribía, por ejemplo,
`At cue 'hasta lo alto' (2.3s), …`, y `parseAnswer` copiaba tal cual los seis campos del plan (`visual_style`,
`primary_subject`, `primary_action`, `camera`, `secondary_motion` y `continuity`) al prompt que se manda a Kie.
Grok pintaba «hasta lo alto» como subtítulo.

Medido el 2026-10-15 al generar la demo v4: 13 de los 790 clips salieron con frases de la narración pintadas
(8 de ellos en 9:16), y las frases coincidían con las citas del prompt. El «rehacer» del editor, que esa vez
redactó sin citas, salió limpio en los 8 clips rehechos. Leídos después los 802 prompts guardados en los 79
proyectos de la demo (`~/Documents/Vimo-demo-v4`, solo lectura): 552 llevaban alguna cita, con 2471 citas de la
narración. Entre ellas había rótulos armados con palabras de la voz, como
`the glowing schematic lines reading 'horizonte de sucesos'`, una de las frases que salió pintada.

## Corrección

**1. Una garantía que no depende del modelo.** `stripNarrationQuotes` (`narration-quotes.ts`) saca de un texto
escrito por un modelo toda cita que reproduce la narración:

- **Qué es una cita:** el texto entre comillas rectas o tipográficas, simples o dobles (también `„…“` y
  `‚…‘`), angulares (`«…»`, `‹…›`) o japonesas (`「…」`, `『…』`). Las rectas y las tipográficas también son
  apóstrofo o pulgadas: abren solo pegadas al principio de una palabra y cierran solo al final de una
  (`the boy’s hands`, `rock 'n' roll` y `5"` no son citas). Las angulares y las japonesas tienen dirección y
  admiten blancos adentro, como en francés (`« alto »`). Una comilla que ya cerró una cita no abre otra, y
  adentro de una cita que se queda se sigue buscando.
- **Qué es narración (decisión):** una cita cuyas palabras están **todas** en lo que leyó el redactor: el guion
  completo, la narración del clip y la de las escenas vecinas. Se compara sin acentos, mayúsculas ni
  puntuación, palabra por palabra (en las escrituras sin espacios, como el japonés, como texto). También es
  narración, diga lo que diga, una cita que el texto presenta como algo que dice la voz: una marca (`cue`,
  `beat`), el verbo del habla detrás (`is spoken`, `lands`, `se dice`), el narrador delante
  (`the narrator says`), o `word` y `phrase` con una preposición de tiempo (`at the word 'X'`). Así cae también
  una marca traducida o mal copiada.
  Se eligió palabra por palabra y no la frase exacta porque el modelo de video pinta igual una cita con elipsis
  (`'sabios...grecia'`) o un rótulo armado con palabras de la voz (`'TORRE TERMINADA'`); y se compara con todo el
  guion porque el redactor lo lee entero y puede citar cualquier parte.
- **Cómo queda:** una referencia a la voz queda solo con su tiempo:
  `At cue 'hasta lo alto' (2.3s), he climbs` → `At 2.3s, he climbs`. Si el tiempo no está escrito, sale de las
  marcas, las de su escena primero: donde la voz empieza a decir la frase o, si la frase no está entera, su
  primera palabra larga (`as “trepa” is spoken` → `at 0.8 s`). Si no hay tiempo, la referencia se va entera,
  con su preposición. Las preposiciones quedan como corresponde (`on`, `when`, `as` → `at`; `by`, `from`,
  `through`, `between` se conservan; en un campo escrito en español, `al decir «X»` → `a los 2.3 s`), y dos
  citas seguidas llevan cada una su tiempo (`between «X» and «Y»` → `between 3.2 s and 5.5 s`). Un rótulo que
  repite la narración se va con su verbo (`the banner reading 'X'` → `the banner`) o solo, si el nombre del
  rótulo va detrás (`the 'X' panel` → `the panel`). Cualquier otra cita de la narración se va sola, y con su
  preposición débil si era su objeto (`a flag with 'X'.` → `a flag.`). Después se ordenan los blancos, la
  puntuación y los paréntesis vacíos, y una oración que empezaba con la cita empieza en mayúscula.
- **Qué se queda:** lo que no es narración (un rótulo de la imagen que no repite la voz, como `"100 monedas"` o
  `"+10%"`; el nombre del estilo, como `"Pixel Art"`) y los apóstrofos. Un texto sin citas de la narración vuelve
  idéntico, byte por byte.

**2. El redactor (`parseAnswer`).** Cada campo pasa por el limpiador antes de armar el prompt, con lo narrado y
las marcas de su escena primero. Los mínimos de largo se validan sobre lo que queda, que es lo que recibe el
video: si un campo era casi todo narración citada y queda corto, la respuesta vuelve al redactor con
`animation_prompt_invalid_structure` y un pedido preciso
(`Scene 1: primary_subject is too short once its quoted narration is removed …`). No se completa con nada
inventado: si los tres redactores de la escalera insisten, termina en `animation_prompt_failed` y no se compra
video. Lo mismo vale para un `visual_style` que era solo una cita.

**3. Revisor y reparación ven el plan limpio.** El revisor recibe el plan ya limpio (el mismo texto que llega al
video) y, si lo rechaza, la reparación del redactor parte de ese plan: el modelo no recibe de vuelta sus citas
como si fueran parte de lo aprobado.

**4. Las instrucciones del redactor.** El prompt del sistema ahora dice que las marcas son anclas de audio y no
subtítulos, que una marca se nombra solo por su tiempo en segundos (`for example at 2.3 s`) y que nunca se
copian, citan ni traducen palabras de la narración en ningún campo, porque el generador dibuja como texto lo
citado. La frase `Spoken-word quotes may anchor timing but do not authorize depicting their absent referents`
pasó a `Narrated words do not authorize depicting their absent referents`, que conserva su intención. Los
mínimos de `primary_subject` (2) y `camera` (12) pasaron a constantes con nombre; los valores no cambian.

**5. Los otros caminos que mandan texto de un modelo a un generador de video:**

- **«Rehacer» del editor** (`animate-scenes` con reemplazo): usa el mismo `buildAnimationPrompt`. El prompt
  anterior no se le manda al redactor (solo `rewrite_existing_animation: true`), así que queda cubierto.
- **Correcciones del revisor:** vuelven al redactor como `review_feedback` y nunca llegan a Kie directo; la
  respuesta nueva del redactor pasa por el limpiador.
- **`pipeline/animation/lane.ts`:** solo transporta `animation.prompt` a Grok y, tras un fallo confirmado de
  Grok, a Seedance; no escribe texto. `generate.ts` vuelve a redactar el prompt cada vez que no hay recibo (ver
  límites).
- **Movimiento del avatar** (`motion_prompt` de HeyGen con Avatar IV y V): el modelo lee lo que dice la
  aparición y podía citarlo. Ahora la cita se saca antes de validar el prompt; si no queda un prompt que sirva,
  va la plantilla de esa escena. El movimiento que escribe la persona en el editor no se toca.
- **Sin cambios:** PoYo recibe el mismo `animation.prompt`; la simulación de la demo no llama a ningún modelo de
  video; los prompts de imagen van a modelos de imagen, donde el texto citado se usa a propósito para los
  rótulos.

## Límites deliberados

- **Una paráfrasis o traducción de la narración sin comillas** no se detecta: no hay forma determinística de
  reconocerla. Tampoco una cita traducida que no se presenta como marca de la voz (`'to the top'` suelta). Lo
  cubre la instrucción del redactor, no el limpiador.
- **Un rótulo armado solo con palabras de la narración se saca del prompt aunque esté en la imagen.** La imagen
  de referencia lo conserva y el prompt sigue diciendo `Preserve existing lettering`; dejarlo citado es justo lo
  que pintó «horizonte de sucesos».
- **Lo que no delimita no es una cita:** una comilla sin cerrar, o rectas y tipográficas con espacios adentro
  (`' alto '`). Las angulares con espacios sí lo son.
- **La gramática después de sacar una cita es lo mejor posible, no perfecta:** una cita usada como objeto deja la
  frase sin él (`reveals 'X' rising` → `reveals rising`), y una preposición desconocida en otro idioma queda con
  `at` por defecto.
- **Los prompts guardados antes de este fix no se reescriben.** Si un clip ya tiene recibo (tarea pagada o en
  vuelo), el carril reusa su prompt, también para el intento con Seedance después de un fallo de Grok; solo los
  prompts nuevos pasan por el limpiador. Un clip viejo se rehace desde el editor.
- **El prompt del sistema del movimiento del avatar no cambia:** su guard lo fija línea por línea y no se midieron
  subtítulos en HeyGen; ahí basta con la limpieza.
- **El cierre fijo del prompt de video no cambia** (`add no text or watermarks`): no se agregan palabras como
  `subtitles`, que podrían sugerir lo que se quiere evitar.
- **La segunda pasada del limpiador es una red de seguridad:** repite hasta que nada cambia (cada pasada que
  cambia algo saca al menos un par de comillas y no agrega ninguna, así que termina). No se encontró una entrada
  realista que la necesite.

## Validación reproducible

1. `node --test scripts/test/check-animation-prompt-quotes.mjs` (18 tests, sin red ni claves). Con el redactor
   y el escritor del avatar de antes del fix (`7aabe58c`) fallan 12: los seis campos, el plan completo, el
   revisor y la reparación, el campo que era solo una cita (lo aceptaba y no pedía reparación), el que nunca
   compra video (lo compraba), las instrucciones del redactor y el avatar. El control «a clean plan reaches the
   video prompt unchanged» pasa antes y después. Las reglas del limpiador se probaron con 17 mutaciones (sin
   limpiar en `parseAnswer`, el prompt viejo, el revisor con el plan crudo, sin mínimos después de limpiar, el
   apóstrofo que abre, la comilla que cerró y vuelve a abrir, sin marcas de la voz, sin tiempo de las marcas,
   sin conector, sin escrituras sin espacios, sin nombre ni verbo de rótulo, la preposición débil, el avatar sin
   limpiar, solo frase exacta, sin ordenar y sin mayúscula): cada una hace fallar al menos un test.
2. Los guards que cargan este código siguen en verde: `check-animation-fallback.mjs` (7),
   `check-animation-resolution.mjs` (4), `check-avatar-motion-prompt.mjs` (27), `check-avatar-stage.mjs` (60),
   `check-avatar-lane.mjs` (97), `check-avatar-blocks.mjs` (45), `check-avatar-resize.mjs` (38),
   `check-avatar-create-project.mjs` (75), `check-avatar-planner.mjs` (31),
   `check-avatar-scenes-skip-images.mjs` (15), `check-scene-pins.mjs` (43), `check-stage-runner-alongside.mjs`
   (26), `check-app-avatar-blocks.mjs` (15), `check-diagnostic-module.mjs` (5), `check-catalog-list.mjs` (6),
   `pnpm check:demo` (379 chequeos), `check-export-header-ui.mjs` (12 casos) y `check-avatar-progress-ui.mjs`
   (252 chequeos).
3. `pnpm format`, `pnpm lint` y `pnpm build`.
4. **Sobre los prompts reales de la demo v4.** Un script local y descartable (no se commitea) lee
   `scenes.json`, `words.json` y `script.txt` de cada proyecto de `~/Documents/Vimo-demo-v4`, rearma las marcas
   de cada clip con `animationNarrationWithin` y `normalizeClipToSlot` (como `generate.ts`), separa los campos
   del prompt guardado y los pasa por `stripNarrationQuotes`. Resultado sobre 802 prompts y 8797 campos: de las
   2471 citas de la narración no queda ninguna entre comillas (verificado con otro tokenizador y otro criterio);
   cambian 1009 campos y ninguno queda por debajo de su mínimo, así que ninguno de esos prompts habría pedido
   otra redacción. Se leyeron a mano unas 50 parejas antes/después.

## Pruebas manuales realizadas

- **No se corrió ninguna generación real** (ni el redactor de DeepInfra ni Kie): sin claves y sin gasto. Lo
  verificado es el texto que se le manda al generador, no el video que devuelve.
- **Cómo verificarlo con una generación real:** en la app de prueba de la rama, animar el primer minuto de
  historias de la demo en 9:16, mejor las de los 13 clips afectados («hasta lo alto», «desde allí», «horizonte
  de sucesos», «dentro de una cámara de cristal»). En `scenes.json`, el `prompt` de cada clip nuevo no tiene
  palabras de la narración entre comillas y nombra los tiempos en segundos. Sobre los clips, el chequeo del error
  conocido: OCR de 3 o 4 cuadros de cada clip (tesseract `-l spa+eng --psm 11`) menos el OCR de las imágenes de
  origen, cruzado con las palabras de la narración de 4 letras o más; con este fix no debería marcar ningún clip
  fuera de los estilos que traen rótulos propios (infografías, planos técnicos), que se descartan mirando el
  cuadro.
