# Integración: Flow y exportación opcional en Vimo habitual

- **Fecha:** 2026-10-11
- **Rama:** `feat/flow-export-motion`
- **Base:** `origin/dev` `4e79cfbdf92e37db7d02aa8c641abdcc03903810` (0.10.0), obtenida por fetch el 2026-10-11.
- **Exportación:** commit `f30edb90`.
- **Flow validado:** port del árbol final QA `2e7d484d`, cuyo ejecutable aceptado corresponde a `0bc3e3f4`; extensión externa 0.2.31.

## Causa

La rama dev habitual todavía no contiene el coordinador y las vistas Flow validadas en QA. Copiar o fusionar todo QA también cambiaría OAuth, identidad, keychain, raíz de proyectos, updater y puerto local. La nueva exportación con movimiento opcional debe convivir con Flow y con todos los proveedores anteriores.

## Corrección

Se integra como un único bloque coherente el comportamiento final Flow: coordinador, persistencia de intentos, recuperación automática acotada para nuevos lotes, importación al reabrir, personajes, estilos, regeneración por selección y guía de preparación. Los cambios compartidos del editor y los tres catálogos conservan `imageMotion` y el diálogo de confirmación.

La integración nativa mantiene `click.vimo.portable`, `vimo://`, keychain, ajustes, proyectos y updater habituales. El servicio usa su puerto predeterminado 43127. Se excluye toda configuración ejecutable exclusiva de QA: autenticación localhost, almacén WebKit aislado, puerto 43137, raíz QA y desactivación de diagnósticos/updater. Los informes QA fechados se conservan como antecedentes, no como instrucciones de configuración habitual.

## Límites deliberados

- No se publica, no se abre PR y no se modifica dev.
- No se incorporan los cambios concurrentes de la rama de avatares; su app anterior queda conservada. La selección por defecto comunicada fue última dev + Flow + exportación.
- No se reemplaza ni fusiona a ciegas el estado de Flow. Lectura de comprobación: habitual conserva 117 trabajos/8 lotes/4 conexiones; QA conserva 459 trabajos/7 lotes/5 conexiones, incluidos tres inciertos históricos. No comparten identificadores.
- Las cinco cuentas preparadas pertenecen todavía al coordinador QA/43137. Esta compilación NO acredita su migración a habitual/43127. El worker bloquea cambiar propietario con historia previa (`previous_history_requires_owner`); no se deben borrar registros ni revincular para saltar esa protección. El traslado seguro es trabajo pendiente separado de la exportación.
- Los MP4 contienen el movimiento renderizado, no keyframes editables del programa externo. Videos previamente animados conservan su animación con ambas opciones.
- No se prometen generaciones infalibles: recuperación acotada, cuotas, pausas explícitas y errores del proveedor conservan sus límites.

## Validación reproducible

1. `pnpm install --frozen-lockfile --prefer-offline`.
2. `pnpm --config.verify-deps-before-run=false lint`, `pnpm --config.verify-deps-before-run=false format`, `pnpm --config.verify-deps-before-run=false build`, `node scripts/test/check-locales.mjs`, `git diff --check`: correctos; 2135 claves alineadas.
3. Con Node oficial 22.23.2 y `APPLE_SIGNING_IDENTITY=-`, `pnpm exec tauri build --bundles app`: correcto. Las variables de notarización no se utilizaron. Identidad y scheme verificados en Info.plist.
4. `codesign --verify --deep --strict --verbose=2 src-tauri/target/release/bundle/macos/Vimo.app`: correcto.
5. Harness temporal externo `/private/tmp/vimo-export-motion-20261011/check.mjs`: 46 controles de duración, ocho trayectorias, clips animados, caché, proveedores, formato y payload inválido antes de limpiar exportaciones. Se ejecutó antes del port; el renderer permanece idéntico después.
6. `node /private/tmp/vimo-export-motion-20261011/check-packaged.mjs`: cuatro exportaciones con el SEA/FFmpeg reales del bundle; Flow horizontal y Evolink vertical, movimiento activado/desactivado, 26 frames = 1.04 segundos por clip; diferencia de píxeles distingue movimiento/estático; proyecto y escenas intactos. Proceso con red saliente denegada, cero llamadas a proveedores.
7. `node /private/tmp/vimo-export-motion-20261011/check-import-only.mjs`: 5/5 controles contra el SEA empaquetado: importa recibo exacto al reabrir, conserva metadatos/video, ignora intención histórica, no reescribe ni genera al reiniciar. Fixture de cinco workers y red saliente denegada.

SEA empaquetado SHA-256: `b59451b50fc4bd6d3656177a8df7a0e37a35f38f83337109a2041954e7661d37`.
Los scripts y las evidencias permanecen fuera del repo.

## Pruebas manuales realizadas

La verificación visual nativa no se completó: el control de computadora rechazó acceso a Vimo. También se rechazó por permiso del usuario la prueba visual aislada en localhost; se detuvo el intento sin vías alternativas. No se presenta el análisis del fuente ni el build como aceptación visual.

La prueba real de generación anterior en QA cerró 5/5, una imagen por cuenta, y antes 100/100; son antecedentes del comportamiento portado, NO una prueba nueva de generación en esta app habitual. El usuario hará la validación manual solicitada.

## Pasos para la validación del usuario

1. Cerrar la app habitual anterior y abrir la entrega Vimo 0.10.0 Flow Export; conserva los ajustes y proyectos habituales.
2. Abrir un proyecto con imágenes y tiempos de escenas; entrar en Editar y pulsar Exportar para editar.
3. Revisar el checkbox y el tooltip. Cancelar debe volver sin exportar. Confirmar marcado debe producir movimiento en cada imagen con la duración de su segmento.
4. Guardar una copia de esos clips antes de repetir desmarcado: cada exportación reemplaza la carpeta regenerable `clips`. La segunda debe quedar estática. Repetir con un proyecto sin Flow.
5. Para Flow: Extensión → comprobar cinco cuentas preparadas y disponibles → Crear → Flow → Multimagen/Nano Banana 2 Lite → elegir estilo/personaje/guion → generar. No iniciar hasta comprobar el vínculo con ESTE coordinador. Las cinco QA siguen en su app; su traslado seguro pendiente impide declarar lista esta parte en habitual.
