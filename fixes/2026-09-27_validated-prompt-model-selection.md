# Fix: ofrecer únicamente redactores validados

- **Fecha:** 2026-09-27
- **Rama:** feat/animation-scenes-dev-20260922

## Causa

El selector conservaba modelos que en la comparación real devolvieron escenas con acontecimientos equivocados o no entregaron el lote. Ocultar `inUi` por sí solo no bastaba: el sidecar seguía ejecutando esos IDs desde proyectos/preferencias guardados. La UI también exponía bloqueos históricos y el botón de reintentar el modelo antiguo. Marcar todos retirados globalmente habría roto candidatos internos de previews.

## Corrección

Oferta central V4 Pro/Haiku, con V4 Pro predeterminado. El resolvedor de redacción elegible y los rescates respetan la oferta; el listado no reinserta defaults ocultos. Ajustes, Crear y recuperación filtran según catálogo. Los avisos describen sustitución por indisponibilidad para ese carril. Se fija el Ultra previo del protagonista de previews para conservar ese servicio al cambiar el default.

## Límites deliberados

No se retiran perfiles técnicos internos, no se cambia razonamiento/tokens ni las políticas de previews/Catálogo. No se modifican Rust, guiones, fragmentador, audio, duraciones, timeline, prompts de animación ni el revisor. No se sobrescriben proyectos, preferencias o `promptModelUsed` históricos. La evaluación real fue de un guion: no acredita cero errores generales. Si un futuro PR mantiene el validador, su carácter temporal debe quedar explícito según ADR-0044 y la nota del vault.

## Validación reproducible

Completado el 2026-09-27:

- `pnpm format`, `pnpm lint` y `pnpm build`, en ese orden: correctos (tipos y bundle de interfaz).
- `pnpm build:sidecar`: binario SEA macOS arm64 reconstruido y ejecutado.
- `node --experimental-strip-types --test scripts/test/check-preview-regressions.mjs scripts/test/check-catalog-prompts.mjs`: 67/67 comprobaciones existentes.
- Guard local `node --experimental-strip-types /private/tmp/vimo-approved-models-20260927/check-model-policy.mjs`: 18/18. Incluye cuerpo de petición real del cliente, todos los IDs ocultos/desconocidos, rescate cruzado y preservación de perfiles técnicos/previews.
- `node /private/tmp/vimo-model-selection-render-20260927.mjs`: 11 escenarios de render/acción, con componentes y utilidades reales; hooks/primitivas interceptados. Tarea antigua, ambos bloqueados, catálogo vacío y seguir esperando incluidos.
- `node /private/tmp/vimo-approved-models-20260927/check-packaged-model-policy.mjs`: 10/10 contra el SEA. Catálogo exacto y nueve preferencias: siete ocultas/desconocidas redirigidas a V4; dos admitidas sin sustitución. Proveedor local devuelve 401 deliberadamente para capturar el modelo y detener la prueba antes de comprar assets. Audio, guion, transcripción, escenas/tiempos y auditoría histórica conservados.
- `git diff --check`: correcto. Archivos de Rust, guiones, cortes, políticas internas y configuración de transporte sin cambios.

Son controles de contrato y regresión, no una certificación de calidad narrativa. Esta última se fundamenta en las 22 llamadas reales anteriores (ADR-0044), sin validador. No hubo nuevas llamadas pagadas. Los guards adicionales viven fuera del repo y no se incluyen en el commit. Evidencia persistente en el vault: `Reportes/2026-09-27-approved-model-selection/`.

Para reproducir sin los scripts temporales: ejecutar `list-prompt-models` con el SEA y verificar dos IDs/default V4; crear un proyecto sintético con preferencia antigua y proveedor HTTP local que capture `model`, cancelar antes de generar medios; comparar audio, escenas y `promptModelUsed` antes/después. Nunca usar proyectos reales para fixtures.

## Pruebas manuales realizadas

No se realizaron clics en una app Tauri instalada ni se instaló un nuevo DMG. Se inspeccionó el diff, se verificó el render estructural y se ejecutó el binario del sidecar reconstruido. Queda para la prueba visual de la app: comprobar Ajustes, Crear compacto/expandido y recuperación; seleccionar Haiku y reiniciar para verificar persistencia; abrir un proyecto histórico y confirmar que conserva su contenido.
