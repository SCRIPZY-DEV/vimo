# Fix: integrar animaciones sobre dev sin perder correcciones recientes

- **Fecha:** 2026-09-22
- **Rama:** `feat/animation-scenes-dev-20260922`
- **Base de integración:** `origin/dev` en `277effb2769204ca7d0a562164c4a47c96d5257b` (0.8.6).
- **Origen de animaciones:** `feat/animation-scenes` en `ca514c1`, con base común `01384ae1b7e638c15c0e61d0d1e47f5f2cb8851a`.

## Causa

La implementación de animación y los cambios recientes de dev evolucionaron en paralelo. Copiar los archivos del editor o del pipeline desde la rama anterior habría eliminado correcciones de descripción pendiente tras blur, rollback de personajes, diagnósticos y escenas de silencio con imagen propia. Las dos ramas también asignaban significados distintos a ADR-0034, ADR-0035 y ADR-0036.

La galería asumía que una descripción vacía siempre reutilizaba el prompt aplicado. Dev registra por separado la descripción pendiente y debe aplicarla aunque el usuario haya abandonado el input. La integración debía mostrar esa intención persistida, incluidas eliminaciones pendientes, sin cambiar el contrato de regeneración de dev.

Durante la revisión de la incorporación de Kie se detectó que HTTP 200 con cuerpo vacío o sin saldo podía aceptar una clave como válida.

## Corrección

- Rama nueva desde dev; aplicación de tres versiones únicamente del delta de animación, galería, créditos, transiciones y sus documentos. Se conserva intacta la rama anterior para comparación.
- Resolución manual de ocho conflictos. Se preservan los cambios upstream de descripciones, invalidación de estilo/personajes, guardados y rescate del editor. Las mutaciones llevan el proyecto de origen para que una respuesta tardía no altere otro proyecto.
- Las escenas nuevas de silencio conservan su imagen independiente. Para proyectos históricos se admite el alias visual solamente si no existe imagen propia; detalle, render y referencias de animación usan la misma prioridad.
- La galería precarga y señala el cambio de descripción pendiente. Un borrador local tiene prioridad sobre esa precarga. Vacío sin cambios pendientes reutiliza el prompt; vacío con cambio pendiente conserva el comportamiento de dev, advertido en el input.
- Validación de Kie exige éxito del proveedor y saldo numérico finito no negativo. Cero es válido; respuestas vacías o malformadas ya no validan una clave. Se añaden siete casos a las pruebas oficiales Rust.
- Las ADR históricas de animación pasan a 0040/0041 y la vigente a 0042. No se sustituyen las ADR actuales de dev.
- Se excluyen las modificaciones antiguas a convenciones de contribución/firma, los scripts de verificación local y el soporte LLM de visión que ya no usa el redactor de animación. Se mantienen los archivos de proveedor LLM y su telemetría exactamente como dev.

## Límites deliberados

- Sin push, PR, release, cambio de versión o firma de distribución. No se modifican proyectos del usuario ni la instalación de Aplicaciones.
- Generación de guiones, redacción de imágenes/previews, identidad de personajes, voz, dependencias y configuración de distribución conservan los cambios de dev.
- Las verificaciones de proveedor de esta integración usan simulaciones, no créditos reales. La calidad visual y narrativa de nuevas generaciones Kie sigue requiriendo aceptación con el proveedor real.
- No se declara validación nativa de Windows ni Intel desde este equipo Apple Silicon.
- Los scripts temporales, capturas, binarios y evidencias locales no se incorporan al commit.

## Validación reproducible

Ejecutar desde el worktree de integración, con Node 22 y dependencias instaladas:

```sh
pnpm format
pnpm lint
pnpm check:locales
pnpm build
pnpm exec tsc -p tsconfig.pipeline.json --noEmit
pnpm test:tauri
node scripts/test/check-silent-scene-images.mjs
node scripts/test/check-provider-failure-events.mjs
```

En esta integración el comando de formato se limitó mediante un archivo ignore local a los archivos cambiados; así no se reformatearon archivos ajenos de dev.

Resultados verificados: compilación web, tipos frontend/pipeline, lint y paridad de 1368 claves; 51 pruebas oficiales Rust; 10 verificaciones existentes de silencios y diagnósticos. Las verificaciones locales adicionales cubrieron 36 casos de tiempos/normalización/fundidos, 13 de coordinación entre procesos, 13 de integración backend, 10 de hooks/galería y 30 del sidecar SEA real. Los casos SEA incluyen FFmpeg real, render/export, conservación de duración/audio y publicación concurrente sin perder clips. Los proveedores externos fueron simulados.

Compilación nativa Apple Silicon 0.8.6 completada con firma ad hoc; `codesign --verify --deep --strict` aprobado. Se repitieron los 30 casos contra el sidecar extraído de la app final (SHA-256 `76b3521148b93ab8565cf1b86ad2aa9311588427634b7c96c49d52f26b2d606c`), todos aprobados. No se ejecutó la interfaz nativa.

Se auditó por comparación contra dev que no hubiera cambios en guiones, previews, voz, proveedor LLM, scripts, dependencias o flujos de distribución. No basta un build correcto para autorizar producción.

## Pruebas manuales

- Inspección de conflictos y del diff de integración; comparación de ambas ramas y de áreas protegidas de dev.
- No se ejecutó una generación pagada ni una revisión visual completa de la aplicación nativa en esta integración.
- Pendiente del usuario: abrir esta compilación, comprobar `video-3.3.3` y un short con escenas de 3 segundos, comparar tiempos antes/después, revisar regeneración individual/fusionada, galería por lotes, recuperación tras interrupción y MP4/CapCut exportados.
- Bloquean salida: cualquier desplazamiento de narración/escenas, pérdida de resultados pagados, duplicación involuntaria de tareas, pérdida de cambios de dev o corrupción de proyecto.
