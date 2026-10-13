# Fix: regeneración concurrente y estado por escena

- **Fecha:** 2026-10-13
- **Rama:** `feat/flow-export-motion`

## Causa

El store del editor tenía una única `activeRegen`; aceptar más clics sólo añadía elementos a su cola. El sidecar también reservaba todo el proyecto y Flow utilizaba un único scope. Por ello un proveedor pago podía esperar a Flow. `pending` cubría tanto cola como preparación del prompt, sin distinguirlos. El tiempo exacto de los diez segundos indicados por el usuario no está atribuido a un evento de producción: el código sí tiene cadencia local Flow de 2–6 s, 3–7 s al drenar, además de preparación y sondeo.

Habilitar varios escritores sin cambios adicionales perdería actualizaciones de `scenes.json`/metadata. También un recibo tardío podía verificar hash antes de una publicación paga y renombrar después. Los refetches de otra escena descartaban borradores de calidad/personajes.

## Corrección

La política inicial de cinco solicitudes locales queda superada por [la corrección de cupos del 2026-10-13](2026-10-13_regeneraciones-flow-sin-tope-local.md): Flow delega su concurrencia al coordinador y los jobs pagos conservan cinco carriles separados. Se mantiene propietario exacto por request/escena, proveedor y configuración capturados. Estado `preparing` separado de cola; selección múltiple incluye imágenes existentes. Scope estable por escena para Flow nuevo, con prioridad a pendientes históricos y veto de duplicación desde el pipeline global.

Leases nativos de proyecto/escena, preparación global serializada, checkpoint de escenas y metadata fresca bajo mutex separado. El importador participa en las mismas reservas y preserva una imagen posterior. Los borradores de descripción, calidad y personajes sobreviven al refetch de otra escena y viajan también desde galería.

Arquitectura y contratos: [ADR-0055](../docs/adr/ADR-0055-regeneracion-concurrente-por-escena.md).

## Límites deliberados

No se migran ni se eliminan recibos históricos. Un lote histórico pendiente con varios destinos no se sustituye por una nueva intención individual; se conserva para su recuperación. Se mantiene la exclusión con render, audio, exportación, animaciones y modificaciones estructurales. Cinco es únicamente el máximo de jobs pagos locales del editor; Flow no comparte ese tope y respeta los cupos remotos por cuenta. La preparación de contexto compartido es secuencial; la generación remota de distintas escenas es paralela.

## Validación reproducible

Desde el worktree:

```sh
pnpm --config.verify-deps-before-run=false lint
pnpm --config.verify-deps-before-run=false build
pnpm --config.verify-deps-before-run=false exec tsc -p tsconfig.pipeline.json --noEmit
node --test scripts/test/check-editor-character-selection.mjs
```

Las pruebas temporales se conservan fuera de Git en `Documents/Vimo-Flow-QA/2026-10-13/editor-generation/`; ejecutar los archivos `.mjs` de ese directorio con Node. No son tests oficiales añadidos al repositorio.

- Store real con frontera API simulada: **6/6**, entre ellos Flow+Fal+Evolink simultáneos, mismo ID rechazado, eventos tardíos, cinco Flow independientes y cancelación antes de recibir handle.
- Función de borradores de producción: **3/3**; mantiene configuración durante refetch ajeno, libera baseline cuando el disco confirma y aísla proyectos.
- Comandos nativos completos y proveedores HTTP simulados: **12/12**; dos Flow + un GPT Image 2 antes del primer resultado, mismas escenas bloqueadas, replay sin POST, importador nuevo, carrera con publicación paga, barrera por batch, coexistencia histórica y escrituras concurrentes.
- Regresión existente de personajes: **23/23**.
- SEA empaquetado por stdin/NDJSON y sandbox: **7/7**. Dos procesos Flow concurrentes; tercero pago alcanza falta de clave sin esperar; render y duplicados bloqueados; importa JPEG mediante FFmpeg empaquetado; conserva metadata y replay sin envío nuevo. Red externa prohibida, sin credenciales heredadas. El SHA y la ruta exactos se guardan en el reporte externo de cada ejecución.

La contraprueba que elimina exclusivamente los leases del importador hace fallar el escenario de publicación paga: la aserción exige `pending: 1` y el mutante entrega `pending: 0`.

## Pruebas manuales realizadas

No se hicieron clics manuales en la app ni generaciones reales con las cuentas del usuario en este bloque. La validación del ejecutable fue automatizada sobre proyectos temporales. El éxito pago usa respuestas simuladas; no se consumió saldo. La aceptación visual y una generación real del usuario se realizan sobre la compilación entregada, sin confundir estos controles con pruebas del servicio de Google.
