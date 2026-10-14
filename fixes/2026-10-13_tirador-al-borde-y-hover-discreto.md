# Fix: tirador al borde y aparición discreta

- **Fecha:** 2026-10-13
- **Rama:** feat/flow-export-motion

> **Actualización 2026-10-13:** la visibilidad por frontera compartida y el relleno pastel quedan reemplazados por `2026-10-13_tirador-unico-con-contorno-transparente.md`. Se conserva la geometría al borde y la evidencia histórica de esta entrega.

## Causa

La separación anterior sumaba medio ancho del marcador de transición al margen del tirador. Por eso el agarre amarillo quedaba desplazado hacia el centro de la tarjeta. Además, mostrar ambas asas por selección o por hover sobre cualquier parte del clip añadía demasiado relleno. El usuario pidió el borde interior y, después, la referencia de CapCut: transición visible en reposo y tirador accesible al pasar por su zona, aunque se superponga al efecto.

## Corrección

- `TIMELINE_TRIM_INSET` pasa a 3 px: el agarre queda pegado a la cara interior del borde blanco de 3 px. Su posición no depende del marcador de transición.
- Se mantiene el área interactiva del tirador por encima del marcador (`z-40` frente a `z-30`), aunque su relleno esté transparente. Al pasar por esa zona el tirador recibe el puntero y aparece en amarillo pastel. La superposición es intencional y prioriza el recorte.
- En reposo no se muestra el relleno amarillo, incluso con el clip seleccionado. Tampoco aparece por hover en el centro de la tarjeta. Sólo se revela al pasar por el propio tirador, enfocarlo con teclado o arrastrar su frontera. Durante el arrastre sigue visible aunque el puntero salga de la zona inicial.
- Número, estados y duración vuelven a un margen de 16 px, coherente con la nueva posición del agarre. Se conservan el borde de selección, el estilo pastel y las líneas roja y azul.

## Límites deliberados

Se mantienen los mismos tiempos, recorte compartido, mínimo de escena y bloqueos de animación. La transición conserva su duración; la superposición del control no modifica el efecto. No se modifica el pipeline ni la extensión. La visibilidad por selección/hover general y la prohibición de solapamiento del informe anterior quedan superadas por esta petición explícita.

## Validación reproducible

1. Seleccionar una escena intermedia con transición. En reposo y al pasar por el centro de la tarjeta, el marcador debe verse completo y no debe aparecer relleno amarillo.
2. Mover el puntero al borde interior izquierdo o derecho: el asa pastel aparece en esa zona. Medir que está a 3 px del exterior de la tarjeta, sin sobresalir.
3. Arrastrar desde la parte superpuesta a la transición. Debe cambiar la frontera, sin activar la transición ni reproducir. El control permanece visible durante el movimiento. Acortar una escena alarga su vecina y viceversa.
4. Enfocar con teclado y usar las flechas: el tirador aparece, conserva foco y permite el ajuste. Repetir con zoom mínimo y en claro/oscuro.
5. Correr formato, lint y build macOS; verificar la copia final con `codesign --verify --deep --strict` y comparar sus archivos con el bundle.

Pasaron **7 controles focales** en Chromium con los componentes y CSS finales: reposo/hover, agarre prioritario, arrastre, teclado/foco, geometría, tema oscuro y clip mínimo. `elementFromPoint` devuelve el tirador sobre la transición; un arrastre cambia la frontera de 3 a 3,5 s y el teclado continúa a 3,6 s sin perder foco. La evidencia final está fuera de Git en `Vimo-Flow-QA/2026-10-13/editor-pastel-reposo/`.

En WKWebView real también se comprobó que las áreas de agarre transparentes siguen recibiendo el puntero en reposo y que el foco de teclado muestra exactamente un tirador pastel por encima del marcador. La evidencia nativa final se guarda en `editor-pastel-borde/webkit-final/`; no corresponde al paquete abierto sobre un proyecto real.

Formato, lint, TypeScript, Vite y build macOS completaron correctamente. La copia entregada contiene los mismos siete archivos que el bundle compilado y pasa la firma estricta.

## Pruebas manuales realizadas

Se revisaron capturas claras/oscuras de reposo y hover con escenas sintéticas, sin datos ni generaciones del usuario. Los gestos se probaron mediante automatización aislada. La revisión nativa usa WKWebView en su propia ventana, no una sesión real de edición del usuario.

## Entrega local

App: `/Users/sebas/Documents/Vimo-builds/Vimo-0.10.0-editor-pastel-borde.app`.

Ejecutable UI SHA-256: `c8a6c7c03f72c189d50ac50eddb9e90f3f2d8187614f0ad57832007527ffd2cb`.

SEA SHA-256: `8fcd272079760cd0568823166fa8fc70ba50410dcae2ca20be0f7c780ba3c0f5`, idéntico a la entrega autónoma ya validada. Conserva la identidad habitual `click.vimo.portable`. No requiere actualizar la extensión 0.2.36. No se publicó una distribución.
