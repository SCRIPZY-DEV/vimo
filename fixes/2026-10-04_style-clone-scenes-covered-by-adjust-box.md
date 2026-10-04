# Fix: la caja «¿Qué ajustamos?» tapaba las escenas de prueba

- **Fecha:** 2026-10-04
- **Rama:** feat/creador-estilo-ia-sobre-catalogo

## Causa

En el paso de las escenas de prueba del creador de estilo con IA, la caja «¿Qué ajustamos?» y el
botón «Aprobar y guardar» iban pegados al borde de abajo del modal (commit `7e34c31c`, de esa misma
mañana, para que el comentario quedara a la vista). Arriba de las escenas había tres filas (el
título del modal, «Escenas de prueba» y el nombre con la descripción), así que la franja pegada
tapaba la segunda fila de escenas: para comparar la escena 3 y la 4 había que desplazarse, y
«Descartar» quedaba todavía más abajo.

## Corrección

El paso se reordenó para que todo entre en el modal sin desplazarse y nada tape las escenas:

- **`StyleCloneScenesStep.tsx`:** la primera fila es «Nombre del estilo» con su campo editable, en
  el lugar del título. Debajo, «Escenas de prueba» como etiqueta verde (`bg-mint`) con su ayuda; la
  nota del personaje, si hay, va en esa misma fila. La descripción que propone la IA ya no se
  muestra acá. Siguen las 4 parejas, la caja «¿Qué ajustamos?» en el flujo normal (ya no pegada) y
  una fila con «Descartar» a la izquierda y «Aprobar y guardar» a la derecha.
- **`StyleCloneModal.tsx`:** en este paso el título queda solo para los lectores de pantalla y el
  pie con «Descartar» no se dibuja (lo trae el paso). Los demás pasos no cambian.
- **`StyleCloneCommentBox.tsx`:** la caja va compacta: la pregunta, qué hace y el contador en una
  línea, y «Rehacer» al lado del texto. También se usa en el paso del personaje.
- **`StyleCloneComparePair.tsx` y `STYLE_CLONE_SCENE_FRAME_CLASS` (`constants.ts`):** la cabecera
  de cada pareja es más baja y cada imagen tiene un alto máximo calculado con el alto de la
  ventana. En una ventana cómoda la imagen mide lo que su 16:9; en una baja pierde alto y se sigue
  viendo entera, centrada. Las dos mitades de una pareja miden siempre lo mismo.

No hay textos nuevos: se reusan las claves que ya estaban en los tres catálogos.

## Límites deliberados

- El paso del personaje conserva su «Descartar» en el pie del modal: no se pidió moverlo.
- Con una ventana de menos de unos 600 px de alto útil, las imágenes ya no se achican más (5 rem)
  y el modal se desplaza. La ventana mínima de la app (1024 × 640) queda por encima.
- Si una escena falla, su pareja suma una línea con el motivo y, en la ventana mínima, el modal
  puede desplazarse unos píxeles.
- Agrandar a mano la caja de texto (se puede estirar) empuja la fila de botones hacia abajo.

## Validación reproducible

No hay framework de tests del frontend. Se recorrió el modal en Chrome con los componentes reales
de la app y el sidecar y el servidor simulados (script local, fuera del repo), mirando la captura
del paso de escenas en cada tamaño:

| Ventana                     | Resultado                                                               |
| --------------------------- | ----------------------------------------------------------------------- |
| 1280 × 773 (la del dueño)   | Las 4 escenas a tamaño completo, la caja y los botones: sin desplazarse |
| 1440 × 900, con personaje   | Igual; la nota del personaje va en la fila de la etiqueta               |
| 1024 × 612 (ventana mínima) | Entra todo; las imágenes miden unos 84 px de alto, enteras y centradas  |

`pnpm format`, `pnpm lint` y `pnpm build` pasan.

## Pruebas manuales

- El recorrido de arriba, en tema claro y oscuro: abrir el paso de escenas, cerrar el modal y
  volver a abrirlo desde la tarjeta, reintentar una escena fallida, abrir la comparación en grande
  y aprobar.
- Pendiente del dueño: verlo en la app con el build de prueba nuevo.
