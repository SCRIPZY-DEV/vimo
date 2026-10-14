# Fix: diseño pastel original y aparición individual del tirador

- **Fecha:** 2026-10-14
- **Rama:** feat/flow-export-motion

## Causa

El usuario prefirió el diseño original de `editor-pastel-borde` y pidió deshacer el contorno transparente y el ocultamiento del marcador de transición de la entrega anterior. Se mantiene el problema original a corregir: dos tiradores comparten la misma frontera temporal, pero sólo el pulsado debe verse durante un arrastre.

## Corrección

Se parte del componente de `8017ff3a` y se conserva su diseño: gradiente amarillo pastel, raya central, sombras, geometría de 3 px, marcador de transición y estados de hover/foco. Se añade únicamente identidad estable por bloque y lado para el tirador activo. Durante el arrastre se suprimen hover/foco y la animación residual de opacidad de los demás tiradores. Fuera del arrastre, pasar sobre el centro del clip no muestra asas; el hover debe estar sobre el propio tirador. La transición ya no se oculta por hover, foco ni arrastre.

## Límites deliberados

Se conserva el recorte de frontera compartida, mínimos, guardado, accesibilidad de teclado y bloqueos de animación. No cambia la extensión ni el pipeline. No se reescribe historial Git ni se toca ningún proyecto del usuario.

## Validación reproducible

1. Comparar el componente con `git show 8017ff3a:src/modules/videos/components/EditorTimeline.tsx`: el cambio queda limitado a identidad del asa y aparición durante el gesto.
2. Reposo y hover sobre el centro del clip: asas ocultas. Hover sobre cada tirador: aparece el correspondiente con el diseño pastel original.
3. Arrastrar ambos lados; sólo el tirador pulsado permanece visible, incluso cruzando sobre el vecino enfocado. El marcador de transición sigue visible.
4. Repetir teclado, claro/oscuro y ancho mínimo; ejecutar formato, lint, build y firma de la app local.

Pasaron diez grupos de controles Chromium sobre los componentes y CSS reales: diseño pastel original (gradiente, raya, sombra y geometría), reposo/hover en centro, hover y drag de ambos lados con todas las transiciones visibles, vecino previamente enfocado y puntero sobre él, salida del timeline, teclado con foco estable, claro/oscuro y ancho mínimo. Sin errores de ejecución.

WKWebView pasó reposo, foco y arrastre izquierdo/derecho; el marcador de transición permanece visible en todos los casos. Se revisaron las capturas compuestas. La automatización usa escenas sintéticas y los gestos WebKit son eventos DOM en su propia ventana.

Formato, lint, TypeScript, Vite y compilación macOS completos. La copia final tiene los mismos siete archivos que el bundle y pasa firma deep/strict. Pipeline, FFmpeg y FFprobe son idénticos a editor-pastel-borde; se conserva la identidad click.vimo.portable.

Revisión independiente del diff frente a 8017ff3a: diseño y bloque completo de transiciones iguales; sólo cambia identidad del asa y visibilidad durante el gesto. Evidencia externa en Vimo-Flow-QA/2026-10-14/editor-pastel-borde-corregido/.

## Pruebas manuales realizadas

Se inspeccionaron capturas de Chromium y la ventana compuesta de WKWebView: vuelve el relleno pastel y la raya; la transición se conserva y sólo aparece el tirador utilizado durante el arrastre. Los gestos se ejecutaron por automatización aislada, no manualmente en un proyecto real del usuario.

## Entrega local

App: `/Users/sebas/Documents/Vimo-builds/Vimo-0.10.0-editor-pastel-borde-corregido.app`.

Conserva las correcciones Flow anteriores; no requiere actualizar la extensión 0.2.36. Sin publicación.
