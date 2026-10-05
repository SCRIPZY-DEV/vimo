# Fix: la etiqueta «Personaje fijo» del catálogo va en amarillo

- **Fecha:** 2026-10-05
- **Rama:** feat/catalogo-estilos

## Causa

Siete gemas del catálogo traen un personaje propio (sección `character`) y llevan la etiqueta
«Personaje fijo». Se veía en gris, igual que «2D» o «Humor», así que nada avisaba que en esos
estilos conviene usar su personaje o uno propio en el estilo. En la QA del 2026-10-05 el dueño pidió
ponerla en amarillo, en la tarjeta y en «Ver».

## Corrección

- `src/modules/videos/components/CatalogStyleTags.tsx`: «Personaje fijo» va en el amarillo de la
  app (`bg-saffron text-charcoal`, el de los botones amarillos) y las demás siguen grises. La tarjeta
  y «Ver» usan este mismo componente, así que cambia en los dos lugares.
- `src/modules/videos/utilities/catalogTags.ts` (nuevo): `isFixedCharacterTag` reconoce la etiqueta
  por su texto en español. Es un espejo de `CATALOG_TAGS.fixedCharacter`
  (`pipeline/prompts/catalog-gems/tags.ts`), porque `src/` solo importa tipos de `pipeline/`
  (ADR-0010).
- Docs: enmienda del 2026-10-05 en la ADR-0039 e índice de guards.

## Límites deliberados

- Solo cambia el color: no hay texto ni tooltip nuevos, y el orden de las etiquetas es el mismo.
  Las 7 gemas la tienen primera o segunda (detrás de «Dinamismo»), así que siempre entra en la fila
  única de la tarjeta.
- Se reconoce por el texto en español de la paleta. En la Entrega 3 la app pone y saca esa
  etiqueta según las secciones (plan E3, P7), así que siempre es la de la paleta.

## Validación reproducible

- `node --test scripts/test/check-app-catalog-style.mjs`: el caso nuevo (el espejo reconoce
  «Personaje fijo» y ninguna otra etiqueta de la paleta) falló antes de crear `catalogTags.ts`
  (módulo inexistente) y pasa después: 33 de 33.
- Copia estática de tres tarjetas y del encabezado de «Ver» con el CSS compilado de la app,
  dibujada con Chrome headless en tema claro y oscuro: «Personaje fijo» se ve amarillo con letra
  oscura y legible, y el resto en gris.
- `pnpm format`, `pnpm lint` y `pnpm build` pasan.

## Pruebas manuales

Pendiente del dueño en la próxima app de prueba: en la pestaña Catálogo, 2D Básico Explicativo, 2D
Bola, 2D Mono, 2D Personaje, 2D Stickman, POV Stickman y Stickman Cinemático muestran «Personaje
fijo» en amarillo en la tarjeta y en «Ver».
