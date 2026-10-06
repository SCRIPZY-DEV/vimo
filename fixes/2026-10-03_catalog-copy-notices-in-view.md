# Fix: los avisos de «Pasar a mi estilo» quedan a la vista

- **Fecha:** 2026-10-03
- **Rama:** feat/catalogo-estilos

## Causa

Los avisos de la copia (en curso y fallida) se dibujan después de la grilla del catálogo, que tiene
38 tarjetas. Para que se vieran, al montarse llamaban a
`scrollIntoView({ block: 'nearest', behavior: 'smooth' })` (`revealNotice`).

Ese scroll no llegaba a ocurrir cuando la copia se pedía desde el menú de una tarjeta. Medido en el
navegador, con una traza de las llamadas a `scrollIntoView` y a `focus`:

- 580 ms: el aviso se monta y pide el scroll suave;
- 585 ms: el menú (Radix) enfoca su contenido para cerrarse;
- 712 ms: el menú le devuelve el foco al botón de los tres puntos.

Un `focus()` sin `preventScroll` hace su propio «traer a la vista si hace falta» y corta el scroll
suave que estaba en marcha. El contenedor que scrollea (`<main>`) no se movía y el aviso quedaba
unos 3000 px debajo de lo visible: el clic en «Pasar a mi estilo» no mostraba nada hasta que la
copia terminaba. Lo mismo le pasaba al aviso de fallo cuando la copia fallaba enseguida, o cuando
«Ver» se cerraba y devolvía el foco.

Se encontró al probar el aviso «Clonando gema del catálogo» (`2026-10-03_catalog-clone-label.md`),
y es el mismo problema que el dueño señaló en la QA del 2026-10-03 para Mi estilo: un mensaje al
final de una lista larga no se ve.

## Corrección

- `src/modules/videos/components/CatalogStyleGallery.tsx`: los dos avisos van dentro de un
  contenedor `sticky bottom-4`, con fondo opaco y sombra. Mientras la galería está en pantalla,
  quedan pegados al borde de abajo de lo que se ve; al llegar al final de la grilla ocupan su lugar
  de siempre. Se elimina `revealNotice`: ya no hay scroll que el foco pueda cortar, y la página no
  salta.
- El aviso de fallo suma una X para cerrarlo (`create.catalog.copyFailedDismiss` en los tres
  idiomas): al quedar siempre a la vista, tiene que poder sacarse.
- `src/modules/videos/hooks/useCatalogStyles.ts`: `dismissCopyFailure`, que olvida la última copia
  (`reset` de la mutación).

## Límites deliberados

- Pegado solo mientras la galería está en pantalla: si la persona ya scrolleó más abajo del
  catálogo, el aviso queda al final de la grilla.
- El aviso de fallo sigue hasta que se cierra con la X, se pide otra copia o se sale de la pestaña.
- No se toca el menú de la tarjeta ni adónde devuelve el foco (accesibilidad de Radix).
- La pestaña Mi estilo no usa este mecanismo: sus avisos van arriba de las tarjetas
  (`2026-10-03_gem-migration-notice-on-top.md`).

## Validación reproducible

```bash
node scripts/test/check-locales.mjs
pnpm format:check
pnpm lint
pnpm build
```

El cambio es de posición y foco en el navegador, y el repo no tiene framework de tests de
componentes: no hay guard. En la app: Crear → pestaña Catálogo → los tres puntos de una tarjeta de
las primeras filas → «Pasar a mi estilo». El aviso «Clonando gema del catálogo» tiene que verse
abajo de la ventana sin que la página se mueva.

## Pruebas manuales

Con el formulario real de Crear montado en Chrome sin interfaz, dentro de `StrictMode` y del mismo
contenedor que scrollea en la app (`<main>` con `overflow-y-auto`), con la API simulada:

- con una copia lenta pedida desde el menú de una tarjeta, el aviso queda dentro de lo visible y el
  scroll de `<main>` no cambia (antes: fuera de lo visible);
- una copia que falla al instante deja el aviso de fallo a la vista, sin mover la página, y la X lo
  cierra;
- una copia que falla pedida desde «Ver» cierra el modal y deja el aviso a la vista;
- capturas de los dos avisos revisadas.

Falta el recorrido del dueño en `pnpm tauri dev` (WebKit), con la copia real del sidecar.
