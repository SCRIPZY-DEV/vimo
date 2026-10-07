# Fix: el modal del estilo se ensanchaba con scroll horizontal al ver las secciones

- **Fecha:** 2026-10-02
- **Rama:** feat/catalogo-estilos

## Causa

Al abrir una gema de plantilla con «Ver secciones», el modal «Tu estilo» salía más ancho que la
pantalla: el aviso «Lo que la IA ajustó de tu gema», el bloque del personaje y las muestras seguían
más allá del borde derecho, cada aviso en una sola línea, y había que scrollear en horizontal.

- `DialogContent` (`src/modules/common/ui/dialog.tsx`, shadcn) es una grilla (`grid`) sin columnas
  declaradas. La columna implícita es `auto`, y una columna `auto` mide **como mínimo** el contenido
  más ancho que no se puede partir.
- Cada sección plegada muestra una vista previa de su texto en una línea (`truncate`, en
  `GemSectionBox`). `truncate` es `white-space: nowrap`: el texto no se parte, y su ancho «mínimo»
  es el texto entero, hasta 12 000 caracteres.
- Esa vista previa ensanchaba la columna de la grilla entera, y con ella todos los hermanos: el
  aviso, el personaje y las muestras. Como el diálogo tiene `overflow-y-auto`, el exceso quedaba en
  un scroll horizontal.

Reproducido el 2026-10-02 con una página mínima con la misma estructura y el CSS compilado de la
app, en Chrome sin interfaz: diálogo de 510 px de ancho visible y 31 456 px de contenido, con cada
aviso en una línea de 20 px de alto.

## Corrección

`DialogContent` suma `grid-cols-1`, que en Tailwind es `grid-template-columns: repeat(1, minmax(0,
1fr))`. Con el mínimo en 0, la columna mide el ancho del diálogo y cada hijo recorta o parte su
texto adentro: la vista previa plegada queda con sus puntos suspensivos y los avisos se parten en
líneas.

Es un cambio en el componente compartido, a propósito: el problema no es de ese modal sino de
cualquier diálogo con un contenido que no se pueda partir (una URL larga, un `nowrap`, una tabla).
Para el resto de los diálogos no cambia nada visible: la columna `auto` ya se estiraba al ancho del
diálogo cuando el contenido cabía.

## Límites deliberados

- No se tocó `GemSectionBox`: su `truncate` dentro de un ítem flex con `min-w-0` es correcto; lo que
  fallaba era la grilla de arriba.
- No se agregó `overflow-x-hidden` al diálogo: taparía el síntoma y dejaría el contenido cortado.

## Validación reproducible

Con el CSS compilado (`pnpm build` deja `dist/assets/index-*.css`), una página con la estructura
del modal (grilla del diálogo, aviso con lista y una sección plegada con un texto largo con
`truncate`), abierta en Chrome sin interfaz:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --window-size=1400,900 --virtual-time-budget=2000 --dump-dom file:///…/repro.html \
  | grep -o "<title>[^<]*</title>"
```

donde la página escribe en el `<title>` el `clientWidth` y el `scrollWidth` del diálogo:

- sin `grid-cols-1`: `client=510 scroll=31456`, el aviso en una línea;
- con `grid-cols-1`: `client=510 scroll=510`, el aviso en tres líneas.

Después: `pnpm format && pnpm lint && pnpm build`.

## Pruebas manuales

Pendiente del dueño en `pnpm tauri dev`: abrir una gema de plantilla con secciones largas y
comprobar que el modal cabe en la pantalla, sin scroll horizontal, con los avisos partidos en
líneas y las vistas previas plegadas terminadas en puntos suspensivos.
