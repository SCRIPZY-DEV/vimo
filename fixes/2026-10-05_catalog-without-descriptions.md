# Fix: las gemas del catálogo ya no muestran ni guardan una descripción

- **Fecha:** 2026-10-05
- **Rama:** feat/catalogo-estilos

## Causa

Cada gema del catálogo traía una descripción corta en tres idiomas («Personaje 3D estilizado con
acabado CGI: luz cálida volumétrica, mucho detalle y textura.»). Se veía debajo de las etiquetas en
la tarjeta y como subtítulo en «Ver». En la QA del 2026-10-05 el dueño dijo que no la ve necesaria
y pidió sacarla de los dos lugares.

## Corrección

Se sacó la descripción de las pantallas y también de los datos, porque nada más la usaba:

- `CatalogStyleCard.tsx`: el pie de la tarjeta queda con el nombre y las etiquetas.
- `CatalogStyleModal.tsx`: «Ver» queda con el nombre, las etiquetas, el modo de personaje y las
  muestras. Sin `DialogDescription`, el diálogo lleva `aria-describedby={undefined}` para que Radix
  no avise por la descripción que falta (como `AnimationDialog`).
- `pipeline/types/catalog.ts`: `CatalogGem` ya no tiene `description`, y las 38 gemas de
  `pipeline/prompts/catalog-gems/` quedaron sin el bloque. Una gema que la trajera no compila.
- Guards: `check-catalog-gems.mjs` fija que ninguna gema traiga descripción. Las gemas de ejemplo de
  `check-app-catalog-style.mjs`, `check-app-custom-style-payload.mjs` y
  `check-app-catalog-payload.mjs` siguen la forma nueva.
- Docs: enmienda del 2026-10-05 en la ADR-0039; el plan de la Entrega 3 (`plan-e3.md`) ya no pide
  escribir ni traducir la descripción; índice de guards.

## Límites deliberados

- Las copias que ya se pasaron a Mi estilo no cambian: «Pasar a mi estilo» nunca copió la
  descripción.
- No se pone otro texto en su lugar.

## Validación reproducible

- `node --test scripts/test/check-catalog-gems.mjs`: el caso nuevo «no gem carries a description»
  falló con las 38 gemas antes de sacarlas y pasa después.
- Guards del catálogo (`check-catalog-gems`, `check-app-catalog-style`,
  `check-app-custom-style-payload`, `check-app-catalog-payload`, `check-catalog-list`,
  `check-catalog-copy`, `check-gem-project-snapshot` y `check-catalog-prompts`): 192 de 192.
- `pnpm format`, `pnpm lint`, `pnpm build` y `pnpm check:locales` pasan.

## Pruebas manuales

Pendiente del dueño en la próxima app de prueba: en la pestaña Catálogo, las tarjetas muestran el
nombre y las etiquetas sin la frase de abajo, y «Ver» abre sin el subtítulo.
