# Fix: cards adaptables en Transiciones y Audio

- **Fecha:** 2026-10-15
- **Rama:** `feat/flow-export-motion`

## Causa

La rejilla de Transiciones fijaba todas las cards en 128 px, incluso cuando había una sola y quedaba espacio libre en el panel estrecho. Audio/SFX usaba otra rejilla con mínimo de 135 px: cuatro cards y sus espacios necesitaban 576 px útiles, más de los 548 px disponibles al ampliar el panel hasta 590 px.

## Corrección

`EditorToolCardGrid.module.css` comparte la distribución entre Transiciones y Audio/SFX. En el panel estrecho, una única opción ocupa toda la fila. Con varias opciones, las columnas se reparten el ancho disponible; al ampliar el panel, también la opción única pasa a ocupar una columna. El mínimo de 128 px, el espacio de 12 px y el ancho máximo existente permiten cuatro cards por fila; la quinta baja a la siguiente.

`EditorTransitionsPanel` y `EditorSfxPanel` usan esa rejilla. La animación de las fotos, los controles de los efectos, el scroll fino y la respuesta inmediata del tirador de ancho conservan su comportamiento.

## Límites deliberados

- El ancho máximo del panel sigue en 590 px. No se amplía el límite para conseguir cuatro columnas.
- Los catálogos actuales siguen ofreciendo un fundido y un efecto de sonido. No se añaden opciones ficticias a la aplicación.
- No cambia la generación de música, la mezcla ni la exportación del video.

## Validación reproducible

1. Ejecutar `pnpm format`, `pnpm lint` y `pnpm build`.
2. Abrir un proyecto en el editor y abrir Transiciones con el icono lateral. Con el panel estrecho, el único fundido debe ocupar el ancho disponible.
3. Ampliar el panel: la card debe reducirse y reservar espacio para las columnas disponibles. Al llegar al máximo, el ancho debe seguir siendo 590 px y admitir cuatro cards de 128 px con espacios de 12 px.
4. Repetir con Audio/SFX. El catálogo debe seguir teniendo sólo el efecto real, con preescucha y botón Añadir operativos.
5. Buscar un texto sin coincidencias en Transiciones, limpiar la búsqueda y aplicar el fundido. La búsqueda y la aplicación no deben cerrar el panel.
6. Comprobar los temas claro y oscuro y el scroll fino en ambos paneles.

La comprobación temporal de catálogos con cinco cards crea clones únicamente en la fixture de QA, fuera del repositorio. Verifica que la quinta se envuelve después de cuatro columnas, sin modificar los catálogos de producto.

## Pruebas manuales

Formato, lint, compilación, tipos del pipeline y locales correctos. Las comprobaciones automatizadas pasaron en Chrome (182 aserciones) y WKWebView (180 en cada ventana de 1040 y 1440 px). Se inspeccionaron capturas de la card única amplia de Transiciones y de cuatro columnas de Audio/SFX. Se mantuvieron visibles el preview y la barra fina. No se declara una prueba manual de usuario por ejecutar eventos DOM automatizados.
