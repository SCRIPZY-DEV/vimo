# Fix: «Pasar a mi estilo» lleva a Mi estilo con la copia abierta

- **Fecha:** 2026-10-03
- **Rama:** feat/catalogo-estilos

## Causa

Al terminar la copia, la galería del catálogo mostraba un aviso («quedó copiado en Mi estilo»)
debajo de la grilla de 38 tarjetas, con un botón «Ir a Mi estilo». Para llegar a lo que acababa de
pedir, la persona tenía que encontrar el aviso, tocar el botón y después abrir la tarjeta.

Pedido del dueño en la QA del 2026-10-03: «tiene que llevarlo a mi estilo con el modal de ese estilo
abierto», sin el botón.

## Corrección

- **Galería del catálogo** (`CatalogStyleGallery.tsx`): se quita el aviso con su botón. Cuando la
  copia termina con la galería a la vista, un efecto la mete en la lista de Mi estilo y llama a
  `onCopied`. Es un efecto y no la continuación del `await` de `copy` por dos razones:
  - corre con el formulario de ese momento. La copia tarda (lee y manda las muestras), y con el
    cierre del clic `goToCopiedStyle` calcularía el retiro de personajes y la selección de la otra
    pestaña con datos viejos;
  - no corre si la galería ya se desmontó: a quien salió de la pestaña no se lo arrastra a Mi
    estilo.

  Una referencia recuerda la última copia anunciada, así cada copia navega una sola vez.

- **Formulario** (`CreateForm.tsx`): `goToCopiedStyle` deja la copia en uso, como antes, y guarda
  su id en `arrivingStyleId`.
- **Galería de Mi estilo** (`CustomStyleGallery.tsx`, props `arrivingStyleId` y `onArrivalOpened`):
  al montarse abre el editor de esa gema y avisa, para que no se vuelva a abrir. Lo pide la galería
  ya montada y no el formulario al cambiar de pestaña: en desarrollo, `StrictMode` corre una vez de
  más la limpieza del efecto que cierra el editor al desmontar, y cerraría un pedido hecho antes.
- Textos `create.catalog.copied` y `copiedAction` eliminados de los tres idiomas.

## Límites deliberados

- Si la persona sale de la pestaña Catálogo mientras se copia, no se la lleva a Mi estilo. La copia
  aparece igual en esa pestaña, porque `useCatalogStyles` invalida la lista.
- Los avisos «Copiando a Mi estilo…» y «No se pudo pasar…» siguen como estaban. (Más tarde, el
  mismo día, cambiaron de texto y de lugar, y «Basado en …» del modal pasó a «Gema clonada del
  catálogo»: ver `2026-10-03_catalog-clone-label.md` y
  `2026-10-03_catalog-copy-notices-in-view.md`.)
- El estado de la copia sigue en la galería: quien vuelve a la pestaña mientras se copia puede
  lanzar otra copia del mismo estilo (límite ya anotado en el traspaso de la Entrega 2).

## Validación reproducible

```bash
node scripts/test/check-locales.mjs
pnpm format:check
pnpm lint
pnpm build
```

El cambio es de montaje y efectos, y el repo no tiene framework de tests de componentes: no hay
guard. En la app: Crear → pestaña Catálogo → «Pasar a mi estilo» desde los tres puntos de una
tarjeta o desde «Ver». Tiene que quedar la pestaña Mi estilo con el modal de la copia abierto.

## Pruebas manuales

Con el formulario real de Crear montado en Chrome sin interfaz, dentro de `StrictMode` (como
`pnpm tauri dev`), con la API simulada:

- desde «Ver» y desde el menú de la tarjeta: queda la pestaña Mi estilo, la copia en uso y un solo
  modal abierto, con «Basado en …»;
- no aparece «quedó copiado» ni «Ir a Mi estilo»;
- cerrar el modal, ir a Catálogo y volver a Mi estilo no lo reabre;
- cambiar de pestaña durante una copia lenta no navega, y la copia queda guardada.

Falta el recorrido del dueño en `pnpm tauri dev`, con la copia real del sidecar.
