# Fix: un estilo clonado que no muestra personajes quedaba en «Personaje genérico»

- **Fecha:** 2026-10-04
- **Rama:** feat/creador-estilo-ia-sobre-catalogo (la mitad del servidor vive en `vimo-landing`,
  rama `feat/creador-estilo-sin-personajes`, commit `cb15627`, sin publicar)

## Causa

Al guardar una clonación, `style-clone-save` solo tenía dos salidas para el personaje del estilo:
«Mi personaje» si la clonación replicó uno, o «Personaje genérico» en cualquier otro caso. En
genérico Vimo diseña un protagonista para cada video.

El dueño clonó un canal de diagramas explicativos («URL vs URI: The Most Confused Topic Finally
Makes Sense»). El estilo quedó en «Personaje genérico», y así Vimo le sumaría un personaje que el
estilo no tiene. Tiene que quedar en «Sin personaje».

No se podía deducir en la app. Nada de lo que devolvía el servidor decía si el video muestra
personajes: en esa clonación la ficha describió el ícono de usuario de los diagramas como la
anatomía de las personas («People, only when the scene names them, have this anatomy: minimalist UI
profile icons…») y ninguna escena dijo «No people in the scene.».

## Corrección

En el servidor (`vimo-landing`):

- **El análisis lo dice.** El instructivo suma, debajo de la variedad del canal, la línea
  «PERSONAS EN ESCENA: SÍ» o «NO». Cuentan las personas, los animales y las criaturas que hacen
  algo en la escena, aunque sean de palitos o distintos en cada escena. Un pictograma (el ícono de
  usuario de un diagrama, un emoji) no cuenta. La línea solo mide: no cambia la ficha ni los
  prompts.
- **Al aprobar,** si la línea dijo NO y no se replicó un personaje, la respuesta suma
  `suggestions: { characterMode: "none" }`, con la forma que ya usa el reconstructor de gemas.

En este repo:

- **`styleCloneTurn.ts`:** lee `suggestions.characterMode` de la respuesta de `aprobar`. Solo acepta
  `none` o `generic`; lo demás no es una sugerencia.
- **`styleCloneSessions.ts` y `types/styleClone.ts`:** la sesión guarda ese modo junto con el estilo
  final (`characterMode`) y lo manda al guardar solo si no hay personaje clonado. Un guardado que
  falla se reintenta con el mismo modo, sin pagar otro turno.
- **`style-clone-save.ts` y `pipeline/types/style-clone.ts`:** el payload acepta `characterMode`
  (`generic` o `none`) y el estilo se guarda con ese modo. Sin el campo queda en genérico. Un
  personaje clonado sigue ganando: el estilo queda en «Mi personaje» con el suyo.
- **Catálogos (es, en, pt):** la ayuda de la respuesta «No» a «¿Replicamos el personaje?» dice que
  el estilo queda con personaje genérico, o sin personaje si el original no muestra ninguno.

## Límites deliberados

- **Es el valor inicial del interruptor.** El usuario lo cambia desde el estilo, como en cualquier
  otro.
- **Si no se sabe, queda en genérico**, como antes: un servidor que todavía no manda la sugerencia,
  una sesión analizada antes de este cambio, o una línea que no dice ni SÍ ni NO. Nunca se adivina y
  no se le reclama al modelo (sería otra llamada).
- **Los estilos ya guardados no se tocan.** El que el dueño clonó antes de este arreglo sigue en
  genérico: se cambia con el interruptor o se clona de nuevo.
- **Un canal con pocas personas cuenta como «con personajes».** La línea dice NO solo si ningún
  fotograma, o casi ninguno, muestra un personaje.
- Medido con tres videos. Un canal de otro tipo (fotos reales, mapas) no se midió.

## Validación reproducible

Guards (sin red):

```
node --test scripts/test/check-style-clone-save.mjs \
  scripts/test/check-app-style-clone.mjs \
  scripts/test/check-app-style-clone-sessions.mjs
```

Cubren: el estilo guardado en `{ mode: 'none' }` o `{ mode: 'generic' }` según el modo recibido; un
modo que no es de una clonación (`own`) rechazado antes de tocar el disco; el personaje clonado por
encima de la sugerencia; la lectura de `suggestions.characterMode` (y lo que no se entiende, que no
es una sugerencia); y el store, que manda el modo al guardar y lo conserva al reintentar.

En `vimo-landing`: `pnpm test` (834 tests). Los del arreglo son
`tests/functions/creadorEstiloPersonas.test.ts` y los casos nuevos de `creadorEstiloTurno`,
`creadorEstiloMaestro` y `crearConIa`, con las cabeceras reales copiadas en
`creadorEstiloFichasMedidas.ts`.

Análisis reales (por `ejecutarTurno`, el código del endpoint, con el material que prepara
`style-clone-prepare`) sobre los tres videos que el dueño clonó ese día:

| Video                                  | PERSONAS EN ESCENA     | Estilo final            |
| -------------------------------------- | ---------------------- | ----------------------- |
| Canal de diagramas, sin personaje      | NO, en 3 corridas de 3 | Sugiere «sin personaje» |
| Figuras de palitos, sin personaje fijo | SÍ                     | Sin sugerencia          |
| Cómic con protagonista, con personaje  | SÍ                     | Sin sugerencia          |

- El resto de cada análisis quedó como antes: la cabecera, la variedad del canal, las 4 escenas con
  su origen (o los 3 diseños) y la ficha con la anatomía en condicional.
- Dos corridas de control con el instructivo anterior y el mismo material eligieron los mismos
  orígenes para las escenas: la línea nueva no cambió esa elección.
- La respuesta real del servidor para el canal de diagramas, leída por la app y guardada por el
  sidecar en una carpeta temporal, dejó el estilo con `character: { mode: "none" }`.
- Costo: 7 corridas, 0,70 USD de Gemini a precio de lista. Sin imágenes.

Para repetirlo: clonar un video de diagramas desde la app una vez publicado el servidor, o correr
el servidor en local como explica `SETUP_CREADOR_ESTILO_IA.md` de `vimo-landing`.

`pnpm format`, `pnpm lint` y `pnpm build` pasan.

## Pruebas manuales

- El recorrido de punta a punta de arriba, sin red.
- Pendiente del dueño: clonar un video sin personajes desde la app, con el servidor ya publicado, y
  ver el interruptor del estilo en «Sin personaje».
