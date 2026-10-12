# Fix: regeneración selectiva y cola del editor Flow

- **Fecha:** 2026-09-19
- **Rama:** `feat/extension-vimo-automater`

## Causa

La etapa de imágenes evaluaba todos los huecos del proyecto tras una regeneración
selectiva. Una escena importada correctamente terminaba en `images_incomplete`
por otra escena faltante; el store atribuía ese error global a todos los objetivos.
El carril pago además podía despachar faltantes fuera de la selección.
El panel bloqueaba el botón por cualquier regeneración activa aunque ya existía
una cola por proyecto. La continuidad de un lote terminado dependía de un diálogo
extra de autorización, en vez de identificar la solicitud explícita del editor.

## Corrección

- Despacho, recuperación, validación final y omisión de prompts consideran sólo
  los objetivos del editor. Create conserva su gate global.
- Eventos y handles pertenecen a una operación concreta; los tardíos no afectan
  al siguiente lote. Ready limpia el error por escena y no hereda fallos ajenos.
- Selector múltiple para Flow; se pueden encolar otras escenas mientras trabaja.
  Pendientes y activas se deduplican. Cada entrada captura proveedor y borrador;
  el guardado espera el turno exclusivo del proyecto antes de generar.
- `flowRegenerationRequestId` identifica la acción Regenerar y su recuperación
  durable. Se elimina el diálogo extra del editor. Los estados inciertos siguen
  impidiendo un nuevo POST; el clic no ejecuta `retry.generate`.
- Se conservan los límites del worker, según la elección explícita del usuario.
  No hace falta cambiar ni recargar la extensión para este fix.

## Límites deliberados

Un sidecar escritor por proyecto; cada selección múltiple forma su propio lote.
Solicitudes posteriores esperan al lote activo. La cola aún no despachada vive en
memoria. No se ejecuta una nueva generación Google para verificar este cambio,
no se resetean contadores ni se modifican imágenes reales del usuario. La calidad
semántica de los prompts continúa siendo un tema independiente de este fix.

## Validación reproducible

1. `pnpm format`, `pnpm lint`, `pnpm build`.
2. `pnpm exec tsc -p tsconfig.pipeline.json --noEmit` y `pnpm check:locales`.
3. Fixture aislado con escenas 2 y 5 sin imagen: regenerar sólo 2 con proveedores
   simulados, comprobar éxito de 2 y ausencia de cambios en 5; repetir Flow/pago
   y Catálogo/Mi estilo. Create debe seguir reportando el hueco global.
4. Simular lote de tres escenas, dos ready y una fallida: sólo la fallida retiene
   error. Encolar otra selección, emitir callback/handle tardío del primer lote y
   verificar que no altera el segundo. Rechazar update-scenes y comprobar cero
   llamadas de generación de ese lote.
5. Coordinador simulado: UUID repetido, respuesta perdida, resultado pendiente
   de importar, nueva selección y estado unknown. Exigir IDs conservados al
   recuperar y cero nuevos POST mientras el resultado sea incierto.

Los scripts locales de estas comprobaciones permanecen fuera del repositorio.

## Pruebas manuales

Se observó el fallo en la app anterior: escena 2 con imagen y aviso rojo mientras
el único faltante real era la escena 5. Tras compilar y abrir el bundle nuevo se
revisó el mismo proyecto: escena 2 visible sin el aviso rojo y banner amarillo
conservado para la 5. Se marcaron escenas 2 y 5: selector, capacidad y botón
mostraron dos imágenes. Se limpió la selección sin pulsar Regenerar y la app
quedó abierta en el editor. Las tres cuentas recuperaron su conexión.

Resultados reproducidos sin servicios reales:

- 14 escenarios de selección (Flow/pago, Mi estilo/Catálogo).
- 29 controles del store (cola, guardado, callbacks tardíos y fallos parciales).
- 24 controles SSR con React, Query e i18n reales (panel, selección y timeline).
- 22 escenarios de intención/recuperación (incluye durabilidad antes de submit).
- 2 escenarios adicionales sobre el SEA empaquetado: primer clic y recuperación
  con UUID nuevo más `rewritePrompt:true`, mismos IDs, prompt intacto y cero
  envíos nuevos al proveedor simulado.
- Revisión independiente: caída entre archivo histórico/current seguida de
  replay antiguo conserva el contador de envíos; un fallo seleccionado conserva
  la imagen anterior y la metadata global.

`pnpm format`, `pnpm lint`, `pnpm build`, tipos del pipeline y paridad de 1394
claves i18n pasaron. `pnpm tauri build --bundles app` produjo el bundle local con
firma ad-hoc; `codesign --verify --deep --strict` y los entitlements del SEA
pasaron. SHA-256 del SEA empaquetado:
`165f2208a0abb9f44790ceadab269abd7eb1b78b2e32768acb428aee900488a3`.

La validación visual real no volvió a generar imágenes. Los casos de concurrencia,
fallos y recuperación se verificaron con transporte/proveedores simulados, no
constituyen aceptación nueva de Google.
