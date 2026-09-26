# Fix: imágenes alineadas con su fragmento narrado

- **Fecha:** 2026-09-26
- **Rama:** feat/animation-scenes-dev-20260922

## Causa

Video-1 conservaba tiempos correctos pero imágenes 14–18 adelantaban acontecimientos de la voz. Se validaban IDs/formato sin comprobar significado. Además, recortar prompts después de revisarlos podía eliminar su foco, y un rescate sin referencia podía introducir otro recorte. El reformato de una respuesta parcialmente inválida podía olvidar un rechazo válido.

## Corrección

- Fragmento/intervalo como autoridad en Mi estilo y Catálogo, con vecinos limitados a referentes y frases partidas.
- Revisor aislado V4 Pro, temperatura 0, evidencias numeradas y cuatro checks obligatorios: foco, acontecimientos, lugar y causalidad. No cambia modelos del redactor, guiones ni previews.
- Revisión del texto final ya saneado, congelación del candidato aprobado y reintentos por ID; conserva negativos válidos al reparar otros errores de formato.
- Saneado idempotente en diagramas de época e identidad con primera oración larga, respetando 3.000 caracteres.
- Revisión de la variante final de rescate sin foto antes de comprar; preserva el prompt original.
- Compatibilidad entre destino narrado y detalles de entorno/vistas, comprobada con el regreso a casa de QA3-22.
- Error recuperable localizado en es/en/pt. Auth, saldo y cancelación no producen rellenos de imagen.

## Límites deliberados

No cambia cortes, reloj, timeline, render, guiones, previews ni voz: no se encontró deriva allí. No regenera assets históricos pagados automáticamente ni incorpora visión. La revisión semántica es probabilística: V4 Pro acertó 11/12 casos adversos/positivos y mantuvo un falso aprobado de causalidad; queda documentado, sin afirmar garantía universal. Ver ADR-0043.

## Validación reproducible

1. Formatear los archivos modificados con Prettier; ejecutar `pnpm lint`, `pnpm build`, `pnpm exec tsc --noEmit -p tsconfig.pipeline.json` y `pnpm check:locales`.
2. `node --test scripts/test/check-preview-regressions.mjs scripts/test/check-scene-wardrobe.mjs scripts/test/check-character-identity-lock.mjs scripts/test/check-catalog-prompts.mjs`: 107 comprobaciones existentes aprobadas.
3. `pnpm tauri build --bundles app` en esta rama/worktree; compilación local sin publicación ni firma de distribución.
4. Crear dos proyectos con la misma grabación de 75,820 s y duración confirmada de escenas 3/4 s. Generar prompts/imágenes, exportar estático, animar pareja 1+2 en QA3 y escena 15 en QA4, volver a exportar.
5. Con `ffprobe`, comparar duración, fps y cuadros antes/después. Decodificar ambas pistas de voz con `ffmpeg -map 0:a:0 -c:a pcm_s16le -f hash -hash sha256 -`: los hashes deben ser iguales. Clips animados sin audio, con 150/100 cuadros a 25 FPS.
6. Revisar fotogramas alrededor de 60 s contra palabras temporizadas: tormentas 58,77–59,75; auroras 61,89–62,69.

Los harness y capturas locales no se agregan al repositorio. Evidencias y reporte en el vault: `Proyectos/VIMO-TAURI/Reportes/2026-09-26-narrative-sync/`. También se verificaron 21.750 intervalos en duraciones 3–12, 64 casos de saneado, 6 casos de integración y 2 rescates sin referencia.

## Pruebas manuales realizadas

Se revisaron los 44 prompts e imágenes reales. QA4 muestra tormentas 15, auroras 16 y regreso/caminar en Tierra 17/18; QA3 muestra tormentas 20, auroras 21 y regreso 22. El primer QA3-22 tenía una vista orbital incorrecta: se conservó evidencia, se reforzó la regla y se reescribió/regeneró solo 22 por comando real, sin prompt manual.

Ambos MP4 finales duran 75,840 s / 1.896 cuadros a 25 FPS antes/después de animar, con audio PCM idéntico. Se inspeccionaron fotogramas de los límites estático/animado; el reproductor nativo abrió y reprodujo QA4. Clips 6 s / 4 s mudos, Kie 14,4 / 9,6 créditos. Video-1 original conserva hashes. No se afirma haber escuchado una revisión humana completa del audio ni aprobación universal de todos los fotogramas generativos.
