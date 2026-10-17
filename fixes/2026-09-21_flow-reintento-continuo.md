---
title: Fix - Reintento continuo de Flow sin regenerar imágenes listas
date: 2026-09-21
tags: [vimo, flow, recovery, downloads, fix]
---

# Fix: reintento continuo de Flow sin regenerar imágenes listas

- **Fecha:** 2026-09-21
- **Rama:** `feat/extension-vimo-automater`

## Causa

La app abierta seguía ejecutando `target/release/bundle/macos/Vimo.app` de la
compilación anterior al fix 58ca874. La lectura de ejecutables, inodes de `lsof`
y hashes confirmó que no estaba cargada `review-flow-recovery/Vimo.app`.

Los recibos del proyecto Video01-extension mantienen dos intenciones y 89 envíos:
88 originales y una regeneración explícita posterior de la escena 2 rechazada.
Las otras 87 tienen un solo ID/seed y cero reintentos; las escenas 39–51 ya están
ready/importadas. No se observaron envíos nuevos tras esa regeneración. Las 88
imágenes locales coinciden por hash con su último resultado. No se alteraron.
Esto explica la evidencia disponible; no reconstruye el instante exacto de cada
clic ni garantiza que un proveedor nunca rechace una nueva solicitud.

Había además dos defectos reproducibles en el código: reobservar un intento
volvía a leer/importar las imágenes ready y emitía inicio de generación, haciendo
que Crear desmontara y montara sus miniaturas en secuencia; y el bridge arrancaba
una recuperación de descarga dejando `download_failed` visible mientras seguía
el I/O. El cliente daba por fallida esa recuperación al siguiente sondeo. El ACK
del comando no significaba que hubiera terminado. Un doble de prueba que publicaba
`downloading` inmediatamente había ocultado el segundo mecanismo.

## Corrección

- El recibo nativo guarda opcionalmente el hash del JPEG validado. Antes de recuperar,
  se comprueban destino, revisión y archivo local; una imagen coincidente se conserva
  sin lectura remota, escritura ni progreso de generación. Un recibo antiguo sin hash
  pasa una vez por la validación normal; uno no coincidente no autoriza sobrescritura.
- Crear preserva imágenes OK con ruta conocida ante progreso y summaries pendientes
  repetidos de Flow. Fallos concretos y nuevas semillas leídas de disco conservan
  prioridad. No cambia la regeneración intencional del editor ni proveedores pagos.
- El bridge publica y guarda `downloading`/`awaiting_url` antes del trabajo asíncrono.
  El ACK no simula un resultado listo. Las lecturas de URL tienen deduplicación y
  vencimiento; medio e identidad del recibo sobreviven a desconexiones y errores.
- Un mismo job recupera hasta tres descargas por recibo, con espera, sin crear imágenes.
  Lecturas de estado/resultado y descarga toleran cortes temporales acotados. Un ACK
  perdido de admisión se concilia contra status antes de enviar otra página.
- Se mantiene el drenaje de hermanos del fix anterior. Sólo se entregan fallos por
  escena confirmados; una operación incierta nunca se duplica para completar la grilla.

Archivos: cliente/tipos/importador y carril Flow, bridge vendorizado y procedencia,
store de Crear, ADR-0038 y handoff al repositorio de la extensión.

## Límites deliberados

No se garantiza éxito instantáneo de todas las imágenes de un proveedor externo.
El scheduler conserva su cadencia, paralelismo por cuenta, pausas y límite móvil
500/24 h. No se activa automáticamente `generation.retry` para un resultado incierto,
ni se convierte un rechazo de Google en aprobación. Un archivo local modificado
se conserva ante conflicto. El hash nativo no se expone al worker y no cambia RPC.

La defensa visual de una tarea existente no puede distinguir un summary incompleto
de un archivo borrado externamente; un fallo explícito o una nueva rehidratación
siguen reemplazando el estado. La comprobación nativa de hash/revisión continúa
validando la importación real.

## Validación reproducible

```sh
pnpm format
pnpm lint
pnpm build
pnpm check:locales
pnpm exec tsc -p tsconfig.pipeline.json --noEmit
```

Usar bridge original en puerto efímero y downloader bloqueado de forma controlada:
`download` debe responder con operación en curso en memoria y disco antes de
resolver el archivo. Consultar status durante varios sondeos y después completar:
un solo clic debe recogerlo. Repetir con media.refresh lenta, URL nula, error tardío,
pérdida de socket y vencimiento; no deben crear generación ni una espera infinita.

En el subcomando real con 88 recibos y 87 JPEG importados con hash, recuperar debe
conservar bytes/mtime y no emitir started/progress ni result.read para esas 87;
sólo la solicitud aún no admitida puede enviarse con su ID original. Cambiar un
hash impide sobrescritura; borrar el archivo recupera el mismo resultado. Inyectar
cortes de status/result.read, ACK perdido y dos descargas fallidas seguidas de éxito:
se completa con una invocación, conservando IDs, prompts e imágenes listas.

**Resultados:** formato, lint, build, tipos del pipeline y las 1475 claves de
es/en/pt aprobados. Verificaciones temporales: 10 casos de restauración y cortes,
3 de reintentos de descarga, 12 del bridge real y 116 comprobaciones de UI
(35 nuevas y 81 de regresión). La prueba integrada con cliente y bridge reales
mantuvo una descarga de 2203 ms visible, importó los dos hermanos primero y
terminó con tres imágenes listas, cero fallos y cero generaciones nuevas.

La aceptación directa del SEA firmado pasó tres escenarios en seis procesos:
lote de 88 con 87 resultados y un rechazo aislado, un resultado incierto que no
contamina sus hermanos y ACK perdido que se recupera en la primera invocación.
Al volver a observar, cero submits, lecturas remotas y eventos de generación para
los archivos verificados; 94 JPEG comprobados y mtimes preservados. Fixtures y
reportes quedaron fuera del repositorio, sin llamadas a Google.

**Paquete final:** `src-tauri/target/release/bundle/macos/Vimo.app`, copiado del
bundle `review-flow-retry` aceptado y validado con `codesign --verify --deep --strict`.
SHA-256 del sidecar: `f705ece7c0868fa42c02e37f425ab65fd9e1a350e851032602abc43828a991fa`.

**Aplicación operativa:** se comprobó cero trabajos activos/inciertos, reservas
pendientes y limpiezas antes de cerrar la app anterior. La salida del padre cerró
el servicio por EOF; se confirmó puerto 43127 libre antes de sustituir el bundle.
Se conservó la copia anterior fuera del repositorio. Se lanzó la compilación
corregida en la ruta habitual y se verificaron ejecutables/hash y un único
servicio hijo dueño de 43127. Los recuentos siguen siendo 88 ready, un rechazo
histórico y 28 recibos borrados; no se reanudó ni generó ningún trabajo.

## Pruebas manuales realizadas

Auditoría agregada de procesos/archivos/recibos y reapertura de la app compilada,
sin generación ni llamadas de prueba a Google. Las verificaciones funcionales
usan transportes locales, trabajadores simulados y carpetas temporales. No se
afirma una nueva generación real ni aceptación visual nativa: Computer Use no
pudo obtener la ventana (`cgWindowNotFound`); la ejecución del paquete actualizado
se verificó por procesos, archivos abiertos y hashes. No se editó a mano la
metadata del proyecto para ocultar el error histórico.
