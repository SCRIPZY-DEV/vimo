# Fix: tirador único con contorno transparente

- **Fecha:** 2026-10-13
- **Rama:** feat/flow-export-motion
- **Validación y entrega:** 2026-10-14

## Causa

Los dos tiradores de una frontera compartían `activeBoundary`, por lo que el derecho de un clip y el izquierdo del siguiente se mostraban al mismo tiempo al arrastrar. Las variantes CSS de hover y foco podían revelar otros tiradores durante el gesto. El gradiente opaco y la raya central tapaban la imagen del clip.

## Corrección

Cada tirador se identifica por bloque estable y lado. Durante el arrastre sólo el que inició el gesto permanece visible; el resto no se revela por hover o foco ni conserva una animación de opacidad residual. El control usa contorno amarillo pastel de 2 px y centro transparente, sin raya ni relleno. Sólo el marcador de la frontera sobre la que se interactúa se oculta temporalmente, para mostrar la imagen a través del centro; el efecto de transición no se altera.

## Límites deliberados

Se conservan el inset de 3 px, la duración compartida de los clips, el mínimo de escena, foco, navegación de teclado, guardado y bloqueos de animación. No cambia el pipeline, las cuentas ni la extensión. No se generan imágenes ni se modifican proyectos del usuario.

## Validación reproducible

1. Arrastrar cada lado de una frontera con transición: exactamente un tirador visible durante down/move, incluso fuera del clip o con el vecino enfocado.
2. Verificar borde amarillo y centro sin fondo ni raya, con la imagen visible; la transición vuelve al terminar la interacción.
3. Repetir con flechas de teclado, tema oscuro, zoom mínimo y clips animados. El foco y los tiempos finales deben conservarse.
4. Ejecutar `pnpm format`, `pnpm lint`, `pnpm build`; compilar macOS y verificar firma/copia de entrega.

La versión anterior se reprodujo en Chromium: al pulsar el asa izquierda aparecían dos tiradores. La misma comprobación pasa con la corrección. Pasaron nueve grupos de controles sobre componentes y CSS reales: exclusividad desde mousedown, ambos lados, delta y commit, puntero sobre vecino previamente enfocado y fuera del timeline, teclado de 0,1/1 s con foco estable, restauración de marcador, temas claro/oscuro y ancho mínimo. Sin errores de ejecución.

WKWebView pasó cuatro casos: reposo, foco de teclado, arrastre izquierdo y derecho. Se inspeccionaron sus capturas compuestas y las capturas de Chromium; las métricas confirman borde de 2 px, fondo transparente, ausencia de hijos/raya, inset de 3 px, exactamente un tirador visible al arrastrar y marcador de esa frontera temporalmente oculto. WebKit usa eventos DOM sintéticos en una ventana aislada.

Formato, lint, TypeScript, Vite y compilación nativa macOS completaron correctamente. La entrega final tiene los mismos siete archivos que el bundle y pasa `codesign --verify --deep --strict`; pipeline, FFmpeg y FFprobe conservan las huellas de la entrega anterior. La automatización visual ejercita los componentes, no un proyecto real abierto en el paquete final.

La evidencia reproducible, incluidos arneses locales, métricas, capturas y huellas, se conserva fuera de Git en `Vimo-Flow-QA/2026-10-14/editor-tirador-contorno/`. El escenario con clip animado figura como paso adicional de validación manual y no se ejecutó en esta ronda.

## Pruebas manuales realizadas

Revisión visual de las capturas de ambos motores: un único contorno amarillo, imagen visible dentro del control y ausencia de asa vecina durante el gesto. Los arrastres y teclas se ejecutaron mediante automatización en escenas sintéticas, no manualmente en un proyecto del usuario.

## Entrega local

App: `/Users/sebas/Documents/Vimo-builds/Vimo-0.10.0-editor-tirador-contorno.app`.

Conserva las correcciones de Flow y la identidad habitual `click.vimo.portable`. La extensión sigue en 0.2.36. Sin publicación.
