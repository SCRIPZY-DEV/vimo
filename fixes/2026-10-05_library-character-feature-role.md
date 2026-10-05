# Fix: las escenas nombraban «Long» a un personaje cuya descripción empieza con un rasgo

- **Fecha:** 2026-10-05
- **Rama:** feat/creador-estilo-ia-sobre-catalogo

## Causa

En el carril de Mi estilo (y del catálogo nuevo), la IA escribe cada escena con `[subject]` en el
lugar del personaje. Después Vimo cambia la etiqueta por un nombre corto, el **rol**, y pega la
descripción completa al final (`weaveSubject`). El rol sale de la primera frase de la descripción
guardada, cortada en la primera coma (`roleFromDescription`).

Muchas descripciones de la biblioteca empiezan con un rasgo y no con quién es el personaje: 5 de
los 7 personajes de texto del dueño empiezan con el pelo. Así salieron también las dos fichas de
la prueba de «Crear personaje con mi estilo» del 2026-10-04:

- «Long, dark brown hair pulled back into a practical braid…» daba el rol «Long», y cada escena
  decía «Long, wearing a white space suit, repairs…». Así pasaba con Isabel Martínez y Ariadne;
  con Luna Martínez salía «Short».
- «Short messy black hair, slightly greasy…» daba «the Short messy black hair, wearing…».

Para estos casos existía la regla E47: con un rol inusable y el nombre disponible, se pone el
nombre delante y la escena lo nombra por su nombre. Pero solo tomaba como inusable un rol de más
de seis palabras, y estos tenían una o cuatro. La descripción completa igual iba al final, así
que el generador sabía cómo es el personaje, pero el rasgo suelto quedaba como sujeto en todas
sus escenas.

## Corrección

En `pipeline/stages/scene-prompts/verbatim/subject-weaver.ts`:

- **Una palabra sola** (`roleUsableForCharacter`): un rol de una palabra solo sirve si es el
  nombre del personaje o parte de él. Con «Isabel, …» el rol «Isabel» sigue valiendo.
- **Un rasgo** (`roleUsableForWeaving`): no sirve un rol que termina en un rasgo (pelo, ojos,
  piel, barba, anteojos…) sin «with» antes. «young astronaut with brown hair» sigue siendo un rol.

En `pipeline/stages/scene-prompts/verbatim/verbatim-writer.ts`, E47 usa `roleUsableForCharacter`
con el nombre del personaje de la biblioteca. Con el rol rechazado, la descripción queda
«Isabel Martínez, Long, dark brown hair…» y la escena dice «Isabel Martínez, wearing a white space
suit, repairs…». La descripción completa sigue pegada al final.

Documentación: adenda del 2026-10-05 en la ADR-0019 e índice de guards.

## Límites deliberados

- Solo cambia el modo `text` del carril, que es el de los personajes de la biblioteca. Los
  protagonistas que diseña la gema (Fase 1) abren con el rol por consigna y no cambian, y los
  roles del catálogo (`check-catalog-gems`) tampoco.
- La lista de rasgos es corta a propósito: pelo y peinados, barba y bigote, ojos y cejas, piel,
  cara, mandíbula, pómulos y anteojos.
- Un rol de una palabra que es un oficio («Detective, …») ahora cede ante el nombre: la escena
  dice el nombre y el oficio sigue en la descripción.
- Las escenas de los videos ya generados no cambian: la regla vale para los prompts que se
  escriban desde ahora.

## Validación reproducible

- `node --test scripts/test/check-gem-verbatim-lane.mjs`: 4 casos nuevos.
  - Vistos fallar contra el código anterior: «Long, wearing…» con Isabel Martínez y «the Short
    messy black hair, wearing…» con Elías.
  - Dos fijan lo que no debe cambiar: un personaje que abre con quién es («A muscular adult man.
    …») conserva «the muscular adult man», y un rol de una palabra que es el nombre se queda.
  - Las huellas byte a byte de las gemas viejas en los cuatro modos siguen iguales.
- Guards del carril y del tejido (`check-gem-verbatim-lane`, `check-catalog-gems`,
  `check-style-character-video`, `check-gem-fixed-phrases`, `check-scene-wardrobe`,
  `check-verbatim-prompt-persistence`, `check-character-identity-lock` y los del retrato): 175 de 175.
- **Prueba real** (script local, fuera del repo). Con el código nuevo se corrió la etapa real de
  prompts sobre una copia de `video-test11` (CLAYMATION con Isabel Martínez, 5 escenas, GPT o4-mini
  TURBO): las 5 escenas la nombran «Isabel Martínez».
- **Imágenes de las dos versiones** (Evolink en calidad baja, 3,2 créditos). Se generaron las 5
  escenas con el sujeto nuevo y las mismas 5 con el que armaba el código anterior («Long»), sin
  ningún otro cambio en los prompts. En las dos aparece la misma Isabel (trenza, anteojos
  redondos, chaleco caqui y libreta), en el mismo estilo y haciendo lo mismo. El nombre no metió
  ningún cartel ni texto en las imágenes. Las diferencias son la variación normal de una imagen a
  otra.

## Pruebas manuales

Pendientes del dueño en la app de prueba: un video corto de Mi estilo con Isabel Martínez (o
cualquier personaje cuya descripción empiece con el pelo). Las escenas deben mostrarla como
siempre, y en el editor el prompt de cada escena tiene que decir su nombre y no «Long».
