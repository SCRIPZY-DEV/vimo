# Fix: asas interiores en amarillo pastel

- **Fecha:** 2026-10-13
- **Rama:** feat/flow-export-motion

## Causa

Las asas blancas quedaban a 2 px del extremo, invadiendo el borde de selección de 3 px. El marcador de transición de 40 px de alto se superponía con ellas y sus esquinas redondeadas producían la apariencia de una aleta exterior. El usuario pidió que el recorte quedara dentro de la tarjeta, en amarillo pastel, con una separación visual similar a la referencia de Vidrush.

## Corrección

- Las asas miden hasta 9 × 24 px, con radio de 3 px, degradado mantequilla (`#FFF1C2` → `#FFE5A3` → `#F5D582`), relieve interior sutil y una línea de agarre oscura. El foco también queda dentro del control.
- Se reserva al menos 4 px desde cada extremo y, cuando hay una transición, su semiancho más ese margen. El ancho del asa se adapta al espacio restante. Los rectángulos del control quedan dentro del borde del clip y fuera del marcador.
- La transición conserva su posición temporal real, pero usa un rectángulo gris translúcido de 28 px de alto y radio de 4 px, sin desenfoque ni sombra exterior. Seleccionarla sigue eligiendo la escena siguiente sin reproducir.
- Se limita el ancho visual del marcador a la mitad del espacio vecino. Si no caben su icono y bordes (14 px), se oculta sólo ese marcador. El fundido renderizado sigue activo. La geometría se normaliza a centésimas de píxel para que diferencias de punto flotante no oculten aleatoriamente marcadores iguales; los tiempos originales no se redondean.
- Número, estados y duración dejan un margen para las asas. Se conserva el borde blanco del clip, las líneas/cabezales rojo y azul y los ajustes de foco, guardado y arrastre del fix anterior.

Las medidas compartidas están en `src/modules/videos/constants.ts`; las aplica `EditorTimeline.tsx`. `TimelineSceneItem.tsx` y `TimelineClipItem.tsx` reservan espacio para sus etiquetas.

## Límites deliberados

No cambia la duración del fundido, los tiempos persistidos, los bloqueos de animación ni el mínimo de escena. No se agregan asas para el comienzo/final global del video. En clips muy estrechos prima poder recortar y no se fuerza un icono que quedaría cortado. Esta entrega sólo modifica la interfaz de Vimo: conserva el pipeline y la extensión 0.2.36 ya integrada.

## Validación reproducible

1. Ejecutar `pnpm --config.verify-deps-before-run=false format` y `pnpm --config.verify-deps-before-run=false lint`.
2. Abrir un video con al menos tres escenas estáticas y fundidos; seleccionar una intermedia. Ambas asas deben estar totalmente dentro del borde blanco, separadas del icono de transición. Comprobar hover y foco con teclado en temas claro y oscuro.
3. Reducir zoom hasta 20 px/s con clips de 1 s. Las asas no se pisan ni sobresalen; el marcador puede ocultarse sin eliminar el fundido. Con seis clips de 1,4 s a ese zoom deben verse los cinco marcadores completos; repetir con anchos de 24, 26 y 27 px y comprobar que se ocultan.
4. Arrastrar, soltar fuera del carril y hacer clic sobre la regla: el primer clic funciona. Repetir flechas consecutivas sobre el asa izquierda y comprobar que el guardado conserva el foco. El clip animado sigue bloqueado para recorte.
5. Compilar el frontend y la app conservando los sidecars ya validados: `pnpm --config.verify-deps-before-run=false exec tauri build --bundles app --config '{"build":{"beforeBuildCommand":"pnpm --config.verify-deps-before-run=false run build"}}'`, con firma local ad hoc. Verificar la copia mediante `codesign --verify --deep --strict` y comparar sus archivos con el bundle.

Pasaron **26 controles en Chromium aislado**: 9 visuales con la fuente final y 17 de regresión de interacción/foco. Se verificaron además tres vistas en WKWebView real (claro, oscuro y clip mínimo), midiendo rectángulos y capturando la ventana compuesta para detectar problemas de capas que Chromium no reproduce. Los scripts personales y capturas están fuera de Git, en `Vimo-Flow-QA/2026-10-13/editor-pastel/`; la evidencia final de Chromium es `visual-final/` y la nativa es `webkit/`.

Formato, lint, TypeScript, Vite y build macOS finalizaron correctamente. Los siete archivos de la app entregada coinciden con el bundle y su firma pasa la verificación estricta.

## Pruebas manuales realizadas

Se inspeccionaron las capturas del arnés con componentes y CSS reales en claro/oscuro, hover/selección, zoom mínimo y animación. Las capturas de WKWebView son de su ventana compuesta, no de un snapshot que omita capas. Los gestos se verificaron por automatización aislada. No se abrió la app sobre un proyecto del usuario ni se consumieron generaciones; esta evidencia no equivale a una prueba E2E de sus videos.

## Entrega local

App: `/Users/sebas/Documents/Vimo-builds/Vimo-0.10.0-editor-pastel.app`.

Ejecutable UI SHA-256: `cbdfe48e9d51139fc887e8cc05640cc8a5a2d88d536a922498e10ee7c173e8a5`.

SEA SHA-256: `8fcd272079760cd0568823166fa8fc70ba50410dcae2ca20be0f7c780ba3c0f5`, idéntico al de la entrega autónoma ya verificada. Conserva la identidad habitual `click.vimo.portable`, sus datos y las correcciones previas de Flow. Para este ajuste visual basta con abrir la nueva app; no requiere volver a instalar la extensión. No se publicó ni notarizó una distribución.
