# El personaje de biblioteca conserva su identidad en un estilo propio

Fecha: 2026-09-19. Queja de los usuarios: «las gemas (Mi estilo) no respetan la
identidad del personaje cuando agrego uno desde la biblioteca». Tercer PR del plan
que empezó con
[style-character-video](../2026-09-19-fix-style-character-video/style-character-video.md).

## Causa

Cuatro fallas independientes, todas en el carril de estilo propio:

1. **La escena que perdía su imagen de referencia salía sin identidad.** Con un
   personaje con foto (modo `reference`) la descripción no viaja en el texto: la
   identidad va en la imagen adjunta. Si el carril de referencia falla (rechazo por
   contenido, subida a Evolink caída, sin clave), `images.ts` rescata la escena por
   el carril normal con el prompt guardado, que dice «Elena (the person from the
   attached reference image)» sin imagen y sin descripción. El generador dibujaba a
   cualquiera.
2. **Una descripción válida podía quedar vacía.** `descriptionFromUserPrompt` corta
   todo lo que sigue a «style:» y descarta las oraciones con marcas de retrato
   («portrait», «full-body», «neutral pose»). Una ficha de biblioteca escrita con
   esas palabras se recortaba hasta `''`, quedaba un aviso en el log y el video salía
   sin identidad.
3. **El candado de referencia no anclaba el tono de piel.** `buildCustomStyleReferencePrompt`
   decía «same face, same hair, same outfit». El catálogo recibió el ancla de piel en
   el [fix del 2026-09-18](../2026-09-18-fix-realistic-character-identity/realistic-character-identity.md);
   el estilo propio, no. Además nombraba solo a la primera referencia, y el editor sí
   arma grupos con dos fotos (`editorCharacterInput`).
4. **Con dos personajes de biblioteca en Create, el segundo no viajaba y nadie lo
   decía.** El carril verbatim lleva un protagonista (`verbatimCharacterFor` elige
   uno), pero el selector deja elegir dos.

## Corrección

- **Rescate con identidad en texto** (`rescueWithoutReference` en `images.ts`,
  `rescueReferencePrompt` en `subject-weaver.ts`). Solo con estilo propio: al
  rescatar una escena por el carril normal se le quita el ancla y se le pega al
  final la descripción de biblioteca de los personajes presentes en la escena, con
  los mismos recortes del modo texto, y se vuelve a sanear. El prompt rescatado viaja
  **solo en ese pedido**: el guardado conserva el ancla y no lleva la descripción,
  así que la próxima pasada vuelve a intentar con la foto y nunca se piden dos
  identidades a la vez. El hash de la tarea de Evolink sale del prompt de rescate,
  que es determinístico: un segundo rescate reusa la tarea pagada.
- **Descripción de respaldo** (`fallbackUserDescription` en `subject-weaver.ts`).
  Cuando los tres tijeretazos dejan vacío, se usa la descripción del usuario apenas
  limpia: sin markdown, sin la cola «Style:» si sobrevive texto antes de ella, con
  los recortes de retrato aplicados sin tirar oraciones enteras, y con el tope de 700
  caracteres. Una descripción que es solo cola de estilo sigue dando `''`. La usan el
  modo `text` del writer (con log que lo dice) y las muestras del estilo, que
  tenían su propia versión a mano.
- **Candado con piel y accesorios** (`character-reference.ts`), desviación declarada
  del texto portado: «same face, same skin tone, same hair, same distinctive
  accessories, same outfit». La frase «Apply the scene's art style only to the
  surroundings» no se toca. `buildCustomStyleReferencePromptMulti` nombra y protege
  a cada referencia; con un solo nombre produce el mismo texto que la simple.
  `character-lane.ts` la usa con todos los nombres.
- **Aviso con dos personajes** (`verbatimCharacterFor`): «only "Elena" travels».
  Soportar dos protagonistas con estilo propio queda fuera.
- **Aviso en Crear** (`CharacterSection.tsx`, clave `create.characters.noStylePreviewHint`
  en los tres catálogos): con estilo propio y un personaje sin foto que no tiene
  preview de ESE estilo, un texto no bloqueante dice que la identidad viajará solo
  como texto y sugiere generar su ilustración en ese estilo desde Personajes. La
  regla E20 y ADR-0021 no cambian: nunca se usa el preview de otro estilo.

## Archivos

- `pipeline/stages/scene-prompts/verbatim/subject-weaver.ts`, `verbatim-writer.ts`,
  `verbatim-lane.ts`
- `pipeline/stages/images/images.ts`, `character-lane.ts`
- `pipeline/prompts/character-reference.ts`
- `pipeline/commands/styles/sample-character.ts`
- `src/modules/videos/components/CharacterSection.tsx`, `public/locales/{es,en,pt}.json`
- `scripts/test/check-style-character-video.mjs` (6 casos nuevos)

## QA

`node --test scripts/test/check-style-character-video.mjs`, 18 casos (12 del PR
anterior más estos seis):

- una escena que pierde su referencia (rechazo por contenido en `/edit`) se rescata
  por el carril normal con la descripción de biblioteca, sin el ancla y con las
  cláusulas finales; el prompt guardado conserva el ancla y no lleva la descripción;
- una descripción que los recortes vacían («Portrait of…, full-body… Style:…») igual
  teje identidad, sin «full-body» ni «Style:», y el log lo dice;
- la descripción de respaldo conserva la identidad y saca la pose fija; una que es
  solo estilo da vacío;
- el prompt de rescate quita el ancla y pega la descripción antes de las cláusulas;
- el candado ancla piel y accesorios, con uno y con dos nombres, y con un nombre es
  idéntico a la versión simple;
- dos personajes en Create con estilo propio: viaja el primero y se avisa.

Regresiones vecinas en verde: `check-editor-character-selection` (23),
`check-preview-regressions` (32), `check-character-identity-lock` (24),
`check-image-account-failures` (15). También `pnpm format`, `pnpm lint`,
`pnpm build` y `pnpm check:locales`.

**QA manual pendiente, con claves reales**, en un estilo propio:

1. Personaje de biblioteca **con foto**: crear el video y comprobar en el log que
   las escenas con el personaje van por `/edit` (Fal) o con `image_urls` (Evolink),
   y que la cara y el tono de piel se mantienen entre escenas.
2. Forzar la pérdida de la referencia (por ejemplo, un prompt que Fal rechace por
   contenido): la escena rescatada debe salir con la descripción del personaje, no
   con cualquiera, y el log debe traer «character reference lost».
3. Personaje **sin foto** en un estilo recién creado: en Crear debe aparecer el
   aviso de que no hay ilustración de ese estilo; el video sale con la identidad en
   texto. Generar su ilustración en ese estilo desde Personajes y volver a Crear: el
   aviso desaparece y el video va con referencia.
4. Un personaje cuya descripción diga «portrait» o empiece con «Style:»: el video
   sale con su identidad igual.

## Límites conocidos

- Una escena rescatada se identifica solo por texto: no se parece tanto como con la
  foto. Es la degradación aceptada, ahora con identidad en vez de sin ella.
- Dos personajes con estilo propio en Create: solo viaja el primero. El editor sí
  regenera escenas con dos referencias.
- La descripción de respaldo puede conservar una pose fija si toda la ficha la trae:
  es preferible a un video sin identidad.
- La frase del candado que aplica el estilo «solo al entorno, nunca al personaje»
  queda como en el origen. Con una foto real y un estilo muy estilizado, el
  personaje puede salir menos estilizado que el fondo: es una decisión de producto
  pendiente, no de este fix.
