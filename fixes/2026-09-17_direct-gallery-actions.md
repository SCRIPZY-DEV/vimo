# Fix: regenerar y animar directamente en la galería

- **Fecha:** 2026-09-17
- **Rama:** feat/animation-scenes

## Causa

El recorrido de revisión llevaba cada acción al editor y obligaba a confirmar,
avanzar o saltar escenas. Para revisar muchas imágenes agregaba pasos innecesarios.
La galería necesitaba enviar selecciones completas y representar los mismos jobs
que el editor, sin ser dueña de su ejecución.

## Corrección

La tarjeta ofrece **Regenerar imagen** y **Animar clip** (Rehacer/Reanudar cuando
corresponde). Regenerar abre una descripción opcional dentro de la tarjeta:
vacía reutiliza el prompt de imagen existente; con texto guarda esa descripción y
solicita reescritura por el generador existente. No se borra un userPrompt histórico
por dejar un input vacío. La selección múltiple abre todos los inputs y confirma
un solo lote, permitiendo combinar descripciones nuevas y campos vacíos.

Solo una aceptación del lote limpia selección y campos enviados. Un fallo de
validación o guardado conserva ambos. Cerrar el modal no cancela trabajos ni
redirige el cursor: galería, panel y timeline leen el mismo store. Las tarjetas
muestran progreso y errores aunque ya no estén seleccionadas. Se conserva
Animando desde 0 %, sin el estado visual Preparando.

`useGalleryActions` valida claves, referencias, saldo total y disponibilidad.
`useLibraryEditor.regenerateGalleryImages` guarda descripciones en una mutación
antes de enviar un lote a la cola existente. Una reserva transitoria `savingScenes`
en el store bloquea generaciones, audio y exportación competidores durante el
guardado, incluso si se cierra la galería. Se libera siempre, también ante fallo.
Los botones y el adaptador tienen protección síncrona contra doble envío.

La selección de animaciones se planifica conjuntamente: seleccionar las dos
mitades de una fusión no compra el mismo clip dos veces ni extiende la selección
por sumar previews individuales. Un único request usa concurrencia, cuota y
recibos existentes. Los grupos históricos y reemplazos pendientes conservan su
cobertura. Un lote inválido se bloquea antes del envío. Recuperación local sin
clave se permite solamente si todo el lote es recuperable localmente y no hay
segundos nuevos por comprar; recuperación mixta sigue validando saldo/clave.

Se retira el recorrido guiado y los controles de saltar/revisar. Las acciones de
imagen y animación son independientes: mientras se editan descripciones se pide
regenerar primero o cerrar los campos para animar las imágenes actuales. No hay
una segunda generación automática ni compras por seleccionar tarjetas.

## Límites deliberados

No cambia backend, sidecar, prompts, guiones, previews, proveedores, tarifas,
límites, generación inicial, timing, reproducción, transiciones ni exportación.
El store conserva su concurrencia existente. Los lotes de imágenes respetan la
exclusión mutua del editor; el paralelismo dentro del lote lo maneja el sidecar.
Las animaciones de otros grupos siguen disponibles durante un job de animación.

Los borradores de galería sobreviven al cierre del modal dentro del proyecto, no
al cerrar la app/cambiar de proyecto. La consulta de saldo fallida no inventa saldo;
se mantiene la política existente de dejar la decisión al proveedor.
El porcentaje estimado no se presenta como telemetría real del proveedor.
Los fixes de previews pendientes de otra rama no se integran en esta corrección.

## Validación reproducible

```sh
pnpm format
pnpm lint
pnpm build
pnpm check:locales
```

1. Abrir la galería, seleccionar una imagen, Regenerar imagen; escribir descripción
   o dejarla vacía. Confirmar y comprobar que permanece abierta con estado Generando.
2. Marcar varias, abrir Regenerar imágenes, cambiar una descripción y dejar otra
   vacía. Confirmar una vez: un lote, selección limpia y progreso por tarjeta.
3. Forzar fallo al guardar: no inicia generación, conserva inputs y selección.
   Doble clic no compra dos lotes. Cerrar durante guardado mantiene la reserva.
4. Animar varias escenas incluyendo las dos de una fusión: un request conjunto,
   sin duplicados. Falta de imagen, clave, saldo o grupo ocupado bloquea el envío.
5. Cerrar/reabrir durante jobs: mismo estado en galería y timeline, sin cancelación
   y sin cambiar escena/cursor. Verificar fallos conservando el resultado previo.
6. Confirmar que descripción abierta bloquea animación hasta regenerarla/cerrarla,
   que un recibo pendiente pide recuperación antes de regenerar la imagen y que
   cambiar proyecto no transfiere selección ni borradores.

Resultados: formato, lint y build aprobados; 1.347 claves alineadas en es/en/pt.
Aprobadas 32 comprobaciones de UI en Chrome, 43 de planner/store, 14 específicas
de grupos pendientes, 22 de reserva y 150 regresiones previas de animación.
Se verificaron también cambios de proyecto durante guardado y consulta de saldo.
Los conjuntos cubren áreas superpuestas; no se presentan como casos independientes.

Las comprobaciones usan componentes/hooks/store reales y proveedores simulados;
no consumen créditos. Scripts temporales y capturas quedan fuera del repositorio,
en `Reportes/2026-09-17-gallery-direct-actions/` del vault. App macOS reconstruida;
asset definitivo del editor verificado dentro del ejecutable y sidecar byte a byte
idéntico a la entrega anterior. Esto no equivale a aceptación nativa o del proveedor.

## Pruebas manuales

Se inspeccionaron cuatro capturas de los componentes reales con datos simulados:
acciones compactas, inputs de selección, progreso y ventana de 1.024 px. Sin
solapamientos ni desborde horizontal; cinco columnas y footer visibles.
Pendiente aceptación por el usuario en la aplicación nativa con su proyecto y
proveedores reales. No se afirma una generación pagada a partir de fixtures.
