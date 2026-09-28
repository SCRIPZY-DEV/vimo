# Fix: restaurar lotes y conservar el control de modelos con recuperación parcial

- **Fecha:** 2026-09-28
- **Rama:** feat/animation-scenes-dev-20260922

## Causa

El cambio anterior redujo las peticiones de 20 a 10 fragmentos y añadió un límite local de 8 lotes por invocación y 45 s por intento. No eran límites del proveedor. La muestra usada para decidirlo era pequeña; nuevas respuestas completas de DeepSeek tardaron 55,62 s, por lo que ese timeout podía clasificar como fallo una solicitud que terminaba correctamente.

La recuperación parcial introdujo dos regresiones: conservaba texto pero absorbía la causa del error sin informar fallos repetidos; y los defectos locales ya no activaban la marca usada para advertir antes de rescatar con otro modelo. Los archivos del diálogo/bloqueo no habían cambiado, pero faltaban sus señales.

El ensayo también capturó una respuesta real con diez prompts identificados en una sola línea: el parser aceptaba toda la línea como prompt 1 y marcaba 2–10 faltantes. Esto podía mezclar escenas aunque el modelo hubiera devuelto sus IDs correctos.

## Corrección

- Mi estilo vuelve a **20 fragmentos por petición**. El respaldo de estimación usa el mismo valor.
- El limitador existente admite hasta **200 lotes por invocación** y encola el resto; desaparece la restricción artificial de 8. Se distinguen fragmentos por petición y peticiones simultáneas por modelo/cuenta.
- Se elimina el timeout de 45 s del redactor de escenas: vuelve al plazo histórico del cliente y conserva el watchdog de la UI. El adaptador de animación no se cambia.
- Recuperar prompts completos no borra el fallo. Los intentos pendientes se asocian a ejecutor+ID; no se transfieren a escenas nuevas ni al modelo de rescate. Se agrupan pendientes con igual presupuesto de intentos para no adelantar el bloqueo de otra escena.
- Se guardan los prompts nuevos aprobados antes del evento de problema de modelo. El segundo fallo conserva su código; los defectos persistentes vuelven a advertir antes del rescate. Se preservan clasificación de red, auth/saldo, corte por tokens, espera de 429 y cancelación.
- Los marcadores reservados `((n))` separan escenas también con espacios/tabulaciones. El prefijo recuperable excluye el último registro incompleto; no se reconstruye JSON ni se asocia por posición una identidad dudosa.

No se modifican el diálogo de elección, duración del bloqueo, comandos de cambio de modelo/reanudación, escritura incremental de proyectos, guion, fragmentador, audio, previews, Rust ni contratos NDJSON. No se agrega otra llamada al revisor.

## Límites deliberados

- DeepInfra publica 200 peticiones simultáneas por modelo y cuenta. El límite aquí es **por invocación**; no coordina otra aplicación, otro sidecar o una cuenta compartida. El 429 histórico sigue siendo necesario, incluso por saturación del proveedor bajo la cuota.
- El revisor narrativo sigue **temporal**, no se retira: 23 llamadas reales antes del revisor sobre dos guiones aún contienen errores semánticos. Esto no demuestra que el revisor actual detecte todos; no se ofrece garantía de cero errores ni de fase completa menor a 60 s.
- Evento NDJSON→cancelación IPC de UI continúa asíncrono, como en el flujo anterior. No se añade un protocolo de confirmación/bloqueo backend; esa carrera preexistente exige una decisión independiente de arquitectura, fuera del pedido de conservar el mecanismo.
- Pruebas de texto no prueban la calidad final de imágenes o video. No se generaron medios pagados ni se alteraron proyectos originales.

## Validación reproducible

Desde esta rama:

```sh
pnpm format
pnpm lint
pnpm build
pnpm exec tsc -p tsconfig.pipeline.json --noEmit
node --experimental-strip-types --test scripts/test/check-verbatim-prompt-persistence.mjs
pnpm build:sidecar
```

Usar Node 22 para el sidecar. Los scripts adicionales de comprobación local viven fuera del repo, en la evidencia del vault `Reportes/2026-09-28-batch-policy/`; no se incluyen en el commit ni constituyen un nuevo framework de testing.

Compilación frontend, TypeScript del pipeline y sidecar completadas. El SEA recompilado pasó tres ejecuciones aisladas: faltante 7, JSON inválido local en 7 y stream truncado en 10; peticiones iniciales de 20 y reintento solo del ID afectado. Audio, cortes y guion idénticos.

Casos comprobados mediante fixtures del cliente/stream real con transporte local:

- 20 fragmentos, falta 7: se guardan 19 y solo se reintenta 7. El guard de persistencia existente también cubre reanudar desde disco.

- Primera respuesta parcial y segundo fallo: persiste la primera, reintenta solo faltantes y emite el código de problema correcto. Si el segundo resultado trae otro prompt completo, se guarda antes de avisar.

- Corte por tokens, red, 429, 401/403, saldo, cancelación, historiales de intentos distintos y rescate con otro ejecutor conservan su tratamiento.
- 180 escenas arrancan 9 lotes; 4020 escenas requieren 201 lotes y el máximo observado es 200. La cola no inicia el lote pendiente después de un fallo terminal.

- Respuesta real con diez marcadores en una línea: diez IDs conservados; también reordenamientos, duplicados, stream incompleto y línea envuelta sin marcador.

La prueba pagada usa mensajes/clientes del carril productivo y salida original sin revisión ni reparación; comparación de 20 frente a 10 en 19 fragmentos de Video-1, dos repeticiones por variante, y 20 fragmentos intactos de Video-prueba-concurrencia. Se conservan request/response, recibos, hashes de fuentes y evaluación ciega. Costo total reportado: **USD 0,1408531215947008 en 23 llamadas**, separado de los ensayos anteriores.

## Pruebas manuales realizadas

Se inspeccionaron peticiones, respuestas crudas y evidencias de correspondencia narrativa. **No se hizo una prueba manual en la ventana de la app instalada ni se construyó un DMG en este bloque.** La validación del sidecar compilado usa proyectos aislados con proveedor local. Queda para QA visual comprobar el diálogo real al fallar un modelo y la selección/reanudación desde la app; no se presenta esa prueba como realizada.
