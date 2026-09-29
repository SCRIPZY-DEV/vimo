# Fix: movimientos estáticos sin vibración al exportar

- **Fecha:** 2026-09-29
- **Rama:** feat/animation-scenes-dev-20260922

## Causa

No existía una variante dedicada a vibración. El catálogo contiene ocho movimientos
Ken Burns (cuatro zooms y cuatro paneos). El recorte entero de FFmpeg zoompan hacía
oscilar la posición aparente al combinar desplazamiento y escala. Se reprodujo
sobre los JPEG originales de las escenas 17 y 18 de video-rural-4 y se contrastó con
los intervalos 48–51 y 51–54 segundos de su MP4 exportado. Se excluyeron del análisis
los diez primeros cuadros para que el fundido no contaminara la medición.

## Corrección

La misma ventana, amplitud y trayectoria se transforma con el filtro perspective
en modo source, evaluación por cuadro e interpolación cúbica. Solo realiza una
transformación afín del Ken Burns existente: no añade rotaciones ni cambia el
catálogo. Se fija FPS antes de evaluar el cuadro y se conserva la resolución final,
el recorte temporal, las transiciones y los bordes de narración.

Perspective empieza a contar los cuadros en 1; se usa `(on-1)/frames` para conservar
el primer cuadro y la progresión del zoompan anterior y de la vista previa.
El primer cuadro del zoom de entrada quedó idéntico al original (error medio 0).

Se incrementa RENDER_CACHE_VERSION de 4 a 5: una reexportación no reutiliza chunks
anteriores con zoompan. El cambio común se aplica al video final y a clips para
editar, solo cuando la fuente es una imagen estática. Los clips IA siguen su ruta.

## Límites deliberados

Un MP4 ya exportado no se modifica por actualizar la app: hay que reexportarlo.
No se elimina ningún zoom/paneo solicitado ni se cambia previewCameraStyle, que
mantiene las mismas trayectorias sin el recorte entero del renderer. No se toca
ningún prompt, proveedor, voz, duraciones, lógica de escenas ni archivos de usuario.

**Coste de exportación:** en una prueba sintética de 30 imágenes / 90 segundos a
1920×1080, el render pasa de 9,09 s a 54,19 s. La memoria residente máxima aumenta
de 2,087 GB a 2,572 GB (aproximadamente 485 MB, 23,2 %); no hubo swap. Los chunks se
procesan en secuencia. La interpolación cúbica usa más CPU, sin ampliar imágenes a
8K; el supermuestreo descartado consumía más memoria y dejaba mayor temblor.
La copia del proyecto real, que mezcla animación IA e imágenes, se exportó en
17,8 s. Estas mediciones de macOS Apple Silicon no garantizan el mismo rendimiento
en otras máquinas; queda pendiente QA nativa en Windows e Intel.

## Validación reproducible

```sh
pnpm format
pnpm lint
pnpm build
pnpm exec tsc -p tsconfig.pipeline.json
pnpm check:locales
```

En esta máquina se utilizó Node 22 y `pnpm_config_verify_deps_before_run=warn`:
el fingerprint local cambió únicamente por la versión 0.8.7 incorporada desde dev;
las dependencias y el lockfile no cambiaron. No se modifica configuración del repo.

- Matriz con FFmpeg empaquetado e implementación real importada: **48/48 casos**,
  ocho movimientos × 1920×1080/1080×1920 × 3/12/0,6 segundos; 6.240 cuadros.
  Error RMS máximo frente a la trayectoria ideal: 0,02684 px. Sin inversiones
  inesperadas ni bordes negros; 25 FPS y conteos exactos.
- Seguimiento de puntos en escenas 17 y 18 con la implementación final: RMS del
  temblor de 1,734/1,299 px en el MP4 original a 0,01213/0,01586 px. Se conserva el
  zoom acumulado y no se observan inversiones de movimiento.
- Integración de clip IA, imagen, fundido y cuadro previo de chunk: 223 cuadros,
  8,92 s. Caché versión 5 aceptado y versión 4 rechazado.
- Build nativo macOS local con firma ad-hoc; `codesign --verify --deep --strict`
  completado. Se ejecutó el sidecar **extraído de esa app**, con su FFmpeg, sobre
  una copia aislada de video-rural-4: H.264 1920×1080, 25 FPS, 1.365 cuadros,
  54,6 s, sin diferencia en duración o metadatos respecto del original.
- Los paquetes AAC de la narración y scenes.json se conservaron idénticos byte a
  byte. Hashes de los 71 archivos del proyecto original sin cambios. Cero llamadas
  a APIs de generación.

Para revisión manual: reexportar un proyecto antiguo con la nueva app (la caché
anterior se invalida), observar zooms/paneos del final, comparar sincronía de voz
y repetir en 9:16. Los scripts, capturas, MP4 y evidencias locales quedan fuera del
repositorio. No se presenta esta verificación local como una suite oficial nueva.

## Pruebas manuales

Lectura del MP4 indicado y comparación de cuadros de las dos escenas estáticas.
La exportación nativa descrita se invocó por CLI del sidecar; no se operó la interfaz
nativa en esta verificación ni se probó una instalación distribuida/notarizada.
No se ejecutaron generaciones pagadas y los archivos originales siguen intactos.
