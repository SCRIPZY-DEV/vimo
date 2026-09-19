# El personaje cambia de tono de piel entre escenas (Catálogo, estilo Realista)

Fecha: 2026-09-18. Queja del cliente: «el flujo catálogo con el estilo realista
mezcla al personaje: con identidad por prompt o por foto, si el personaje es moreno,
en algunas escenas sale blanco. Es lo único inconsistente de ese estilo».

No lo resolvía el fix de las referencias de Evolink
([style-samples-character](../2026-09-18-fix-style-samples-character/style-samples-character.md)):
aquel era «se elige a Juan y sale Tomás en todo el video» (fotos + Evolink). Este
es otro defecto: el MISMO personaje pierde un rasgo en ALGUNAS escenas, también con
identidad por prompt y con Fal.

## Causa

El estilo `normal` es el único del catálogo sin PROLOGUE ni STYLE fijos. Su system
prompt arma un párrafo `[Shot type] of [main subject from narration]…`, pide
«generic descriptors», no menciona al personaje recurrente y acota TODO el prompt a
300-800 caracteres. El redactor reescribe entonces la identidad completa en cada
escena dentro de ese presupuesto: en unas conserva «dark-skinned», en otras lo
suelta, y el generador rellena una persona sin tono de piel con piel clara. En los
estilos ilustrados pasa lo mismo, pero una paleta plana lo disimula; en
fotorrealismo salta a la vista.

Nada lo atajaba:

- El backstop de identidad (`missingHeadTraits`) solo valida pelo, barba, bigote y
  lentes, y un prompt que aun así fallaba en el último intento se aceptaba igual.
- El bloque duro del personaje (`buildMandatoryCharacterBlock`) refuerza el pelo con
  un párrafo propio; la piel figuraba solo en una lista genérica.
- Personaje con foto: la línea REFERENCE del carril con referencia anclaba «face,
  hair, distinctive features», sin la piel. Y con la descripción vacía (opcional
  para fotos, ADR-0033) el bloque decía `(keep X's established design exactly)`: el
  redactor, que no ve la foto, inventaba rasgos —a veces contrarios a la foto— y el
  generador recibía texto y referencia en conflicto.
- Las escenas que el carril con referencia no lograba entregar (429 agotado,
  timeout, content policy, subida a Evolink fallida) se reenviaban al carril de solo
  texto sin dejar rastro, y el caché por archivo lo volvía permanente.
- El diseñador de personajes pedía el tono de piel «briefly and LAST», justo donde
  corta el tope de 800 caracteres de la identidad.

## Corrección

Candado de tez en tres capas, todo por texto y sin costo extra. No aplica a
`pov_stickman` (su bloque PROHÍBE redactar la piel: dibujaría un humano junto al
muñeco) ni a Mi estilo (carril verbatim).

- **Detectar** — `pipeline/utils/character-complexion.ts`: `extractComplexionClause`
  devuelve, verbatim, la cláusula de la descripción que fija la tez (EN/ES/PT). No
  traduce: «moreno» es ambiguo y se respeta la redacción del usuario. Un color suelto
  nunca cuenta («black jacket», «brown eyes», «pelo moreno», «barba negra»): solo
  pegado a un sustantivo de persona o a una palabra de piel; «afro» suelto es peinado.
- **Pedir** — el bloque del personaje suma `SKIN TONE IS MANDATORY IN EVERY SCENE`
  (paralelo al del pelo) y el system prompt de `normal` gana la regla
  `RECURRING CHARACTER`: con bloque obligatorio el sujeto principal ES el personaje,
  con la tez primero; el largo sube a 1100 con personaje. Es una divergencia
  deliberada del texto del origen, anotada en `visual-styles.ts`.
- **Validar** — `missingComplexion` (en `identity-lock.ts`) corre junto a
  `missingHeadTraits`; si falta la tez, el reintento lleva
  `buildComplexionCorrectionBlock`. Evalúa el cuerpo SIN los bloques fijos del
  estilo: el STYLE de `cartoon` trae la palabra «skin» y daba falsos «presente».
- **Reparar** — `lockCharacterComplexion` inserta, solo si sigue faltando,
  `Identity lock — {nombre}: {cláusula}; render this exact skin tone…` tras la
  PRIMERA frase del cuerpo: nunca en la cola (ahí recortan las cláusulas finales) ni
  después del ancla de realismo. Sin comillas, porque la cláusula de texto-en-imagen
  dibujaría lo citado. Idempotente. Corre en el redactor, en la reescritura por
  content policy y en el chokepoint de `images.ts`; en los dos últimos solo si el
  prompt todavía muestra a alguien.
- **Chokepoint** — «Regenerar imagen» sin pedido nuevo reutiliza el prompt del disco,
  así que el candado del redactor no llegaba a los proyectos anteriores. Se aplica
  antes de `sanitizeFinalPrompt`, solo a escenas que de verdad se van a generar y
  nunca sobre una tarea ya pagada (ADR-0036).
- **Foto sin descripción** — el bloque ordena escribir
  `{nombre} (the person from the attached reference image)` y ningún rasgo físico;
  misma excepción en el bloque multi-personaje (exigía describir cabeza y pelo de
  cada uno) y en el bloque de la biblia. La línea REFERENCE ahora ancla el tono de
  piel «never lighter or darker, whatever the scene's lighting».
  `buildCustomStyleReferencePrompt` no se toca (port byte a byte).
- **Rescate visible** — `dispatchLanes` deja un `warn` en el log del proyecto con los
  ids que perdieron la referencia, separando content policy de fallo de proveedor.
- **Diseñador** — el tono de piel es obligatorio en humanos y va justo después del
  pelo.

## Segunda ronda: en las escenas «sin personaje» salía un desconocido

QA manual el mismo día (`test-realist`, 4 escenas, frecuencia «balanced»): dos
escenas perdían al personaje. No era la tez: el reparto por frecuencia
(`distributePresenceByFrequency`) había dejado esas dos escenas SIN personaje, y ahí
el bloque `SCENE WITHOUT THE CHARACTER` ordena no dibujar a nadie. Pero la narración
de esas escenas habla del protagonista, y el system prompt de `normal` manda que «el
sujeto DEBE ser lo que narra»: el redactor escribía igual «Close-up of Mateo's
face…» o «a young man with dark hair…», una persona sin identidad canónica y fuera
del carril con referencia. El generador la resolvía como un desconocido — que es lo
que el cliente describía como «en algunas escenas sale blanco». Las pruebas de la
primera ronda usaron frecuencia «always» y por eso no lo mostraban.

- **Detectar** — `promptDepictsPerson` (en `identity-lock.ts`): sustantivos de
  persona y oficios, pronombres, «lone figure» / siluetas, y también cuerpo y ropa
  («Mateo's face… is wearing»), porque el nombre de la narración no tiene por qué ser
  el del personaje del proyecto. Las frases defensivas que NIEGAN gente se descartan
  antes de evaluar.
- **Reintentar** — si una escena sin personaje (y sin pedido manual) dibuja a
  alguien, el siguiente intento lleva `buildNoPersonCorrectionBlock`: objeto, lugar o
  metáfora, sin presencia humana.
- **Promover** — si el redactor insiste tras los 3 intentos, la narración ES sobre el
  protagonista: la escena pasa a `charactersPresent: [0]` y se redacta de cero con el
  bloque obligatorio (identidad completa + carril con referencia). Solo en la
  generación automática (`promoteUnmarkedProtagonist`); al regenerar desde el editor
  la presencia por escena la marcó el usuario y se respeta.
- **Sellar** — `sealSceneWithoutPeople`: toda escena que sí queda sin personaje lleva
  «No people anywhere in the frame…». Sin ella el generador poblaba la cocina con
  alguien borroso al fondo aunque el prompt no describiera a nadie.
- El system prompt de `normal` suma la regla `SCENE WITHOUT THE CHARACTER`, para que
  el primer intento ya salga sin persona.

Consecuencia aceptada: con frecuencia parcial pueden salir MÁS escenas con personaje
que la densidad pedida. Se prefiere eso a un protagonista irreconocible.

## Tercera ronda: validar que el personaje ESTÉ en las escenas marcadas

La frecuencia es un contrato en los dos sentidos. «Balanced» (y las demás parciales):
el personaje sale solo en las escenas marcadas y en el resto no sale nadie (segunda
ronda). «Always»: sale en TODAS. Hasta acá «always» solo garantizaba la MARCA
(`applyFrequencyToCharacters` + `needsAlwaysCure`); nadie validaba que el prompt
redactado lo trajera, y un redactor que ignoraba el bloque obligatorio y escribía «a
cyclist…» pasaba igual.

- `missingCharacterMention`: toda escena marcada debe traer a su personaje por nombre
  o, si el redactor tradujo el rótulo, por el arranque textual de su descripción
  canónica. Si falta, el reintento lleva `buildMissingCharacterCorrectionBlock`.
- `lockCharacterPresence`: si el último intento igual lo dejó afuera, se inserta tras
  la primera frase `The main subject of this shot is {nombre}, {identidad}` (o el
  ancla de la foto si no hay descripción). Corre antes del candado de tez, que queda
  en no-op porque la identidad ya trae la piel. No se fuerza en la reescritura por
  content policy, que puede volver la escena un paisaje a propósito.
- Mismas exclusiones: stickman (nombra al muñeco, no a la persona) y Mi estilo.

## Cuarta ronda: sin el personaje, pero con la gente que narra el guion

Regla de producto confirmada para las frecuencias parciales: en las escenas sin el
personaje se muestra LO QUE NARRA EL GUION, y no sale ninguna otra persona salvo que
la narración la describa. La segunda ronda había ido más lejos (cero personas,
siguiendo el «no bystanders, crowds or silhouettes» del bloque del origen) y dejaba
sin gente un mercado lleno.

- `buildIllustrationWithoutCharacterBlock` (no stickman): nunca el personaje ni el
  protagonista de la narración como persona genérica; la gente que la narración
  describe sí, cada una escrita con la palabra `anonymous` y visiblemente distinta
  del personaje. Si el único humano de la narración es el protagonista, sin personas.
  Stickman conserva la regla del origen (su molde CONCEPTO no admite figuras).
- `promptDepictsStandIn` reemplaza a `promptDepictsPerson` como disparador del
  reintento y de la promoción: hay suplente cuando el prompt nombra al personaje, o
  cuando algún sustantivo de persona no tiene `anonymous` a ±40 caracteres. El rótulo
  vale para la persona que tiene cerca: «a lone figure…» no se blanquea porque otra
  frase diga «anonymous people».
- El sello «No people anywhere in the frame» se pone solo si el prompt no trae a nadie.

QA real (`qa-equilibrado`, 4 escenas, 1 y 4 con personaje): la 2 («piensa en todo lo
que dejó atrás») rechazó dos intentos con el protagonista colado y quedó como una
calle vacía sellada; la 3 («los vendedores gritan… una multitud llena la calle»)
salió a la primera con el mercado y su gente, sin el personaje.

## Archivos

- Nuevos: `pipeline/utils/character-complexion.ts`,
  `pipeline/stages/scene-prompts/identity-lock.ts`,
  `scripts/test/check-character-identity-lock.mjs`.
- `pipeline/prompts/scene-prompt-blocks.ts`, `character-reference.ts`,
  `reference-characters.ts`, `visual-styles.ts`, `character-designer.ts`.
- `pipeline/stages/scene-prompts/prompt-writer.ts`,
  `pipeline/stages/images/images.ts`.

## Límites conocidos

- De fondo: en Catálogo el redactor REESCRIBE la identidad en cada escena, y todo lo
  de este fix son redes sobre eso. La salida estructural —llevar los estilos del
  Catálogo al carril de Mi estilo, donde la identidad se teje por código— queda
  registrada como dirección a futuro en
  [ADR-0039](../../adr/ADR-0039-catalogo-sobre-el-carril-de-mi-estilo.md).

- Un personaje cuya descripción NO menciona la piel no tiene nada que candadear: hay
  que editar su descripción (los creados con el diseñador desde este fix ya la traen).
- Foto sin descripción que cae al carril de solo texto sigue sin identidad: sin un
  modelo de visión que describa la foto no hay de dónde sacarla. Ahora queda el aviso
  en el log.
- Un personaje por prompt sin preview en el estilo del video viaja sin imagen de
  referencia (regla E20): la cara puede variar entre escenas aunque la tez ya no.
  Mejora posible, fuera de este fix: generar una referencia ancla al crear el video.
- En proyectos ya generados los prompts del disco no se reescriben solos: un
  relanzamiento recibe el candado en el chokepoint; para una redacción nueva hay que
  regenerar con descripción.

## QA

- `node --test scripts/test/check-character-identity-lock.mjs`: 24 casos — escenas
  sin personaje (detección, reintento vacío y sellado, promoción al protagonista, sin
  promoción desde el editor) y trampas
  del detector, posición e idempotencia del candado, stickman y Mi estilo intactos,
  STYLE con «skin», bloques del personaje, línea REFERENCE, reintento con corrección
  y reparación en el tercer intento, prompt viejo candadeado en el chokepoint y aviso
  del rescate.
- Sin regresiones en `check-catalog-prompts`, `check-character-profile`,
  `check-editor-character-selection` y `check-preview-regressions`.
- Con claves reales por CLI (`scripts/run-pipeline-harness.mjs`, DeepInfra +
  Evolink): 12 escenas con frecuencia «always», personaje por prompt y por foto sin
  descripción — 12/12 con la tez correcta en ambos; «Regenerar imagen» sobre un prompt
  viejo sale con el candado; y el `test-realist` clonado con las escenas 1 y 4 sin
  personaje — la 1 queda vacía y sellada, la 4 se promueve al protagonista.
- Pendiente: Fal (sin clave en el harness) y video Realista de ~12 escenas con (a) personaje por
  prompt «dark-skinned…» y (b) foto de una persona morena sin descripción, con Fal y
  con Evolink; revisar `scenes.json` escena por escena y probar «Regenerar imagen»
  sobre un proyecto anterior al fix.
