# Fix: inicio inmediato, progreso, recuperación y deshacer animaciones

- **Fecha:** 2026-09-29
- **Rama:** feat/animation-scenes-dev-20260922

## Causa

1. El formulario esperaba comprobar voz y saldo antes de crear el estado visible del pipeline; durante parte de esa espera el botón parecía no responder.
2. El progreso contaba solo prompts validados/persistidos y mostraba borradores recibidos, por lo que 19 respuestas podían convivir con 0%. La revisión de 19–20 textos en lotes de seis requería dos oleadas de dos llamadas.
3. El log de `video-rural-3` registró el 2026-09-29 a las 17:08:52 UTC un contrato inválido de revisión de continuidad, antes de llamar al proveedor de video. No hay evidencia suficiente para atribuir ese log individual a la pareja 5+6. La UI no diferenciaba reintentos y la fase automática no renovaba un presupuesto remoto agotado al reanudar.
4. Era posible regenerar una imagen fuente de un clip listo sin retirar antes su representación animada. No existía una operación explícita para regresar a las fuentes estáticas.

## Corrección

- El estado de creación se publica al enviar. Las verificaciones de voz/saldo corren en paralelo, antes de crear el proyecto o generar medios. Rechazos conservan el formulario; las respuestas tardías se descartan por identidad de tarea.
- Redacción muestra porcentaje del stream. Al 100% mantiene spinner y «Validando prompts» hasta que termina realmente la fase. No muestra texto de borradores. El mensaje del tramo completamente animado indica solamente clips de6s y ajuste del último al audio.
- La revisión de imágenes conserva modelo y reglas. Cada lote de 19–20 prompts revisa sus cuatro grupos de hasta seis en paralelo; todos los lotes del job comparten un techo de 200 revisiones simultáneas. No se impone un cuello de cuatro consultas para un proyecto entero: 200 prompts pueden ocupar 40 revisiones. Mismas llamadas/tokens nominales; no se promete tiempo constante del proveedor ni coordinación entre otras aplicaciones que compartan la cuenta.
- El revisor de animación repara contratos hasta tres veces, con feedback específico y respaldo textual. El carril de video conserva dos intentos Grok y uno Seedance. Se muestra «Reintentando» durante reparación y espera. Fallos finales mantienen la pausa con reintento desde checkpoint o editor.
- Reanudar permite renovar únicamente intentos definitivamente fallidos. Se conservan clips terminados y se consultan tareas pendientes antes de cualquier compra.
- `undo-scene-animation` archiva los bloques que cubren una escena, incluidas parejas, y restaura sus imágenes sin cambiar audio, prompts ni bordes. La UI lo ofrece en panel y galería. Regenerar imágenes animadas requiere deshacer primero; el backend hace cumplir la regla.
- Deshacer retira de esas fuentes el encargo automático de 6 s. Esto restaura las reglas normales del editor: pareja 3+3 cuando corresponda, o generación mínima con ajuste de velocidad. Solo reanudar explícitamente el pipeline automático repone su encargo y sus tarjetas; los recibos listos evitan recompras.

## Límites deliberados

No cambian el planificador, sincronización de reproducción, fragmentación, guiones, previews ni modelos seleccionables. Se mantiene el revisor narrativo temporal porque los ensayos anteriores detectaron incoherencias sin él. Autenticación, saldo insuficiente, moderación o una compra ambigua no se repiten a ciegas. Deshacer conserva archivos y no devuelve créditos. Si falta una fuente o hay una tarea pagada pendiente, se bloquea la operación. Una reanudación explícita del pipeline automático puede animar nuevamente intervalos deshechos; exportar desde el editor no lo hace.

## Validación reproducible

Desde este worktree, con Node22:

```sh
pnpm format
pnpm lint
pnpm build
pnpm exec tsc -p tsconfig.pipeline.json
pnpm check:locales
```

Comprobaciones locales fuera del repo:

- `/private/tmp/vimo-ux-20260929/verify-form.cjs`: 9 casos del store con respuestas diferidas/rango de animación y 7 renderizados del progreso.
- `/private/tmp/vimo-ux-20260929/verify-undo.cjs`:20 casos de handlers reales con proyectos temporales, sin red; pareja, legado, cortes parciales, historial, idempotencia, fuente faltante, tareas pendientes, exclusión y fallo entre invalidación del render y publicación.
- `/private/tmp/vimo-ux-20260929/check-review-limit.mjs`: 19 prompts en 4 consultas paralelas; 200 prompts en 40 consultas paralelas; 4000 prompts respetan el techo compartido de 200 revisiones. Cancelar impide consultas en cola. Usa latencia simulada, no es benchmark real del proveedor.
- `/private/tmp/vimo-animation-retries-20260929/check.mjs`:20 casos de proveedor y revisor simulados.
- `/private/tmp/vimo-animation-retries-20260929/integration.mjs`:4 escenarios de fase y persistencia; reanuda faltantes, conserva clips listos y no recompra tareas ambiguas.

- `/private/tmp/vimo-animation-retries-20260929/malformed.mjs`: 30 respuestas de revisión malformadas; se agotan tres oportunidades sin errores de tipo no controlados.
- `/private/tmp/vimo-animation-retries-20260929/undo-resume-results.json`: 14 comprobaciones de políticas del editor, reanudación automática, clips listos, tramos parciales, límite heredado y formatos heredados.
- `/private/tmp/vimo-undo-ui-20260929/`: 37 comprobaciones locales de render, mutación asíncrona y limpieza selectiva de estado.

- `/private/tmp/vimo-ux-20260929/prefix-card-checks.json`: 13 casos de tarjetas con límite automático, cola decimal y fuente heredada que cruza el minuto.
- `/private/tmp/vimo-ux-20260929/native-final-results.json`: resultado del sidecar empaquetado real, sin red; `native-final-plan.json` contiene la replanificación del detalle devuelto.

Formato, lint, compilación web, tipos del sidecar, paridad de traducciones y build nativo local pasaron. También `codesign --verify --deep --strict` sobre el bundle ad hoc. No se publicó ni notarizó esta compilación.

No se agregan scripts locales al repo ni se presentan como una suite oficial.

## Pruebas manuales

Verificado en la aplicación nativa compilada localmente con firma ad hoc, sobre una copia independiente de `video-rural-3` llamada `QA Codex — deshacer animacion`:

- Panel: un clip listo muestra «Rehacer clip» y «Deshacer animación», con sus créditos; oculta la regeneración de la fuente.
- Deshacer desde el panel restauró las imágenes 1 y 2 de una pareja, de 3 s cada una.
- Galería: deshacer seleccionando la segunda imagen de otra pareja restauró las imágenes 3 y 4.
- Selección mixta: una imagen estática y una animada bloquearon la regeneración grupal con la explicación correspondiente.
- Cerrar y reabrir el proyecto conservó las cuatro imágenes restauradas y los demás clips.
- Comparación de archivos: IDs, texto y límites de las 19 escenas permanecieron idénticos; el proyecto original no cambió (hashes de todos sus archivos).

La inspección detectó el marcador heredado de 6 s en las imágenes restauradas y motivó la corrección adicional documentada arriba. Esa corrección se recompiló y verificó adicionalmente con el sidecar SEA final: restauró la pareja 5–6, retiró el marcador únicamente de esas fuentes y repetir la operación no duplicó el historial. Su detalle proyectado al planificador real del editor vuelve a dar 3+3→6 s. Se conservaron los 70 archivos de medios/artefactos de la copia y los 72 del proyecto original. La copia de QA se retiró de la biblioteca y quedó fuera del repo. Esta última comprobación fue por el protocolo real stdin/NDJSON, adicional a la inspección visual anterior. No se compraron animaciones ni se enviaron guiones a proveedores en estas validaciones; los fallos remotos y sus reintentos se ejercitaron con respuestas simuladas.

## Checklist de aceptación

- Enviar formulario: aparece inmediatamente el pipeline; falla de saldo/voz devuelve datos intactos; doble clic no duplica proyecto.
- Llegar a100% de prompts: aparece «Validando prompts» con spinner; solo termina cuando la fase se confirma.
- Animar un video de menos de60s: mensaje simplificado, parejas y fin del audio intactos.
- Fallo transitorio: «Reintentando» visible; tras agotar intentos, elegir checkpoint y comprobar que solo procesa faltantes.
- Abrir un clip listo: no aparece regeneración de imagen; «Rehacer clip» y «Deshacer animación» disponibles.
- Deshacer pareja desde panel o galería: vuelven ambas imágenes y sus duraciones originales. Reabrir proyecto y exportar no resucita clip archivado.
- Seleccionar escenas estáticas y animadas en galería: regeneración de imágenes bloqueada hasta deshacer las animadas; no se compra un subconjunto silenciosamente.
- Regenerar imágenes restauradas y volver a animar; comprobar sincronización antes/después y exportación.
