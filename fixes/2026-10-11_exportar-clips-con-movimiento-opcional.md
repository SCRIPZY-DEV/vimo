# Exportar clips con movimiento de imagen opcional

- **Fecha:** 2026-10-11.
- **Rama:** `feat/flow-export-motion`.

## Causa

«Exportar para editar» comenzaba inmediatamente y aplicaba siempre el zoom/paneo de Vimo a las imágenes. Faltaba elegir una exportación estática antes de ejecutarla.

## Corrección

El botón abre una confirmación con «Exportar clips para editar con movimiento de imagen», activado inicialmente para conservar el comportamiento anterior. Un tooltip explica el efecto, los clips de video y la ausencia de generación/coste de IA. Cancelar o Escape no exporta; otra tarea cierra el diálogo; cambiar de proyecto reinicia su estado. El foco vuelve al botón o al contenedor si el botón está ocupado.

`ExportClipsPayload.imageMotion` es un booleano opcional: omitido/true conserva el movimiento existente, false usa imágenes estáticas. Se valida antes de limpiar `clips/`. La elección cruza el store y el API existentes; conserva exclusión de tareas. Reutiliza el render y sus ocho trayectorias subpíxel, con la identidad de cache diferenciada para false. Vale para todos los proveedores y formatos.

## Límites deliberados

- El movimiento queda integrado en los píxeles del MP4; no exporta un proyecto CapCut/XML ni keyframes editables.
- Los clips de video ya animados conservan su movimiento; el checkbox controla únicamente la cámara de las imágenes.
- Conserva el redondeo de tiempos a 25 FPS, los tramos y transiciones existentes, audio separado y la carpeta `clips/` regenerable.
- No modifica guion, imágenes, opciones del proyecto ni el render final del video. No llama a proveedores.

## Validación reproducible

- `pnpm lint`, `pnpm build`, `node scripts/test/check-locales.mjs`: correctos; seis claves nuevas en es/en/pt.
- `node /private/tmp/vimo-export-motion-20261011/check.mjs`: 46 comprobaciones con FFmpeg real sobre imágenes existentes y fixtures temporales. Ocho trayectorias activas/inactivas, frames exactos, diferencias de píxeles, progreso, limpieza de manifests, identidad de cache y video animado idéntico en ambas opciones. Comando real para Flow 16:9 y Evolink 9:16, metadatos intactos y rechazo de valor inválido sin limpiar exportaciones.
- Scripts y evidencia fuera del repo; ningún archivo de imagen ni test temporal se incorpora al commit.

## Pruebas manuales realizadas

Pendiente la revisión del diálogo y la exportación desde el artefacto nativo integrado. Las 46 comprobaciones anteriores ejercitan código real y FFmpeg, no la UI; el informe final de integración registrará la validación del ejecutable entregado.
