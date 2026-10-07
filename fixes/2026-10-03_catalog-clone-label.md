# Fix: la copia de un estilo del catálogo dice «Gema clonada del catálogo» con el nombre en una píldora

- **Fecha:** 2026-10-03
- **Rama:** feat/catalogo-estilos

## Causa

Al terminar «Pasar a mi estilo», el modal de la copia decía de dónde salió con una línea chica y
gris, «Basado en 2D Stickman», debajo de la descripción: se leía como un detalle y no como lo que
acababa de pasar. Mientras la copia corría, el aviso decía «Copiando a Mi estilo…», sin nombrar el
estilo.

Pedido del dueño en la QA del 2026-10-03: ese mensaje «debería decir clonando gema del catálogo, con
el nombre visible en un badge amarillo», para leer bien esa información.

## Corrección

- **Modal de la copia** (`CustomStyleModal.tsx`): la línea pasa a «Gema clonada del catálogo» en el
  color del texto, con el nombre del estilo de origen en una píldora amarilla. En pasado, porque
  cuando el modal se abre la copia ya está hecha (y se sigue leyendo cada vez que se abre).
- **Aviso de la copia en curso** (`CatalogStyleGallery.tsx`): «Clonando gema del catálogo» con el
  nombre en la misma píldora.
- **Botón de «Ver»** mientras se copia: «Clonando…» (`create.catalog.copying`).
- La píldora es una clase con nombre, `CATALOG_ORIGIN_BADGE_CLASS` (`constants.ts`): fondo `saffron`
  y texto `charcoal`, la misma pareja de los botones principales, legible en los dos temas.
- Textos nuevos `create.customStyles.clonedFrom` y `create.catalog.copyingNamed` en los tres
  idiomas, con el nombre interpolado dentro de la marca `<badge>` (`Trans`), para que cada idioma
  ubique el nombre donde le corresponde.

## Límites deliberados

- La acción se sigue llamando «Pasar a mi estilo» y el aviso de fallo no cambia.
- La tarjeta de la copia conserva su línea «Basado en …» (`create.customStyles.basedOn`): ahí no
  entra una píldora sin desemparejar la grilla.
- Que el aviso de la copia en curso quede a la vista es otro arreglo:
  `2026-10-03_catalog-copy-notices-in-view.md`.

## Validación reproducible

```bash
node scripts/test/check-locales.mjs
pnpm format:check
pnpm lint
pnpm build
```

El cambio es de texto y markup, sin lógica pura: no hay guard. En la app: Crear → pestaña Catálogo
→ «Pasar a mi estilo». Tiene que abrirse el modal de la copia con «Gema clonada del catálogo» y el
nombre del estilo en la píldora amarilla.

## Pruebas manuales

Con el formulario real de Crear montado en Chrome sin interfaz, dentro de `StrictMode` (como
`pnpm tauri dev`), con la API simulada:

- copiando desde «Ver» y desde el menú de la tarjeta, el modal de la copia dice «Gema clonada del
  catálogo», trae la píldora con el nombre y ya no dice «Basado en»;
- con una copia lenta, el aviso dice «Clonando gema del catálogo» con la píldora y el botón de
  «Ver» dice «Clonando…»;
- captura del modal revisada.

Falta el recorrido del dueño en `pnpm tauri dev`, con la copia real del sidecar.
