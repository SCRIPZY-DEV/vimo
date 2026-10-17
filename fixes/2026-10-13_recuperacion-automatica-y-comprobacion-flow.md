# Fix: recuperación automática y continuidad durante comprobación de Flow

- **Fecha:** 2026-10-13
- **Rama:** feat/flow-export-motion
- **Extensión requerida:** 0.2.35

## Causa

El coordinador sólo asignaba sustituciones a cuentas listas. Si las cinco esperaban su próxima imagen de comprobación, ninguna podía recibir el trabajo que necesitaba para recuperarse. La capacidad de un lote nuevo también confundía el límite de un envío de comprobación con el tamaño total de su cola. Cancelar una intención que aún no se había despachado podía dejar la reserva sin titular útil.

## Corrección

El coordinador incorporado conserva su frontera privada y ahora asigna autoridad automática durable a un trabajo real pendiente. Reserva y consume el permiso junto al intento antes de enviar por WebSocket. El lote puede reservar 25 o más imágenes con cinco cuentas comprobando, sujetas a presupuesto e historial; sólo el primer trabajo asignado a cada perfil usa su permiso, y el resto espera confirmación o una nueva autoridad segura. Paginación, replay y reinicio conservan esa exclusividad.

Cancelar un plan que no recibió ningún trabajo libera sólo su reserva sin consumo. Cuando el primer titular terminó cancelado o fallido sin ningún intento físico, el siguiente trabajo del mismo lote puede usar la reserva existente. Un resultado, owner, intento, envío, retry o archivo de intento previo impide esa reasignación. No se borra ni reactiva el trabajo cancelado.

La extensión 0.2.35 (commit local `96056f398866a11760f8e066ac86710f99dfe406`) revalida automáticamente el contexto técnico con esperas de 30/60/120 segundos, abre y prepara en una acción y permite revisar una sesión recargada. Vimo presenta guías específicas para actividad inusual, CAPTCHA, sesión e identidad, y distingue espera de un trabajo de generación en curso. Detalle de UI en `2026-10-13_guia-recuperacion-cuentas-flow.md`; detalle worker en el repositorio de extensión.

## Límites deliberados

No se evaden desafíos de Google ni se garantiza que todo proveedor responda siempre. Pausas voluntarias, bloqueos, cuotas y capacidad física prevalecen. Los intentos inciertos conservan reservas y recibos; con todos los espacios ocupados se necesita reconciliar alguno antes de enviar. No hay imágenes artificiales sólo para comprobar cuentas. Se mantiene el modelo por defecto Nano Banana 2 Lite y la política de sustituciones ya autorizada.

## Validación reproducible

- `pnpm --config.verify-deps-before-run=false format`
- `pnpm --config.verify-deps-before-run=false lint`
- `APPLE_SIGNING_IDENTITY=- pnpm --config.verify-deps-before-run=false exec tauri build --bundles app` en entorno sin otras variables Apple; incluye `tsc -b && vite build` y sidecar nuevo.
- `node /private/tmp/vimo-automatic-checking-vendor-20261013.mjs`: 18/18 escenarios con puente real y cinco clientes WebSocket simulados.
- `node /private/tmp/vimo-staged-capacity-vendor-20261013.mjs`: 25/25 controles de capacidad, presupuesto, permisos, identidad y ocupación física.
- Ejecutable de la app entregada: 5/5 controles aislados. Reserva25 con cinco cuentas comprobando, primer envío único por cuenta, 25 recibos simulados, espera real antes de sustituir cinco inciertos, conserva sus cinco intentos anteriores y reinicia sin repetir envíos. No se ejercitó descarga/importación de esos recibos simulados.
- `codesign --verify --deep --strict` correcto sobre fuente compilada y entrega; siete archivos idénticos, bundleID `click.vimo.portable` y entitlement JIT del sidecar conservados. Firma local ad-hoc, sin publicación ni notarización.
- Entrega: `/Users/sebas/Documents/Vimo-builds/Vimo-0.10.0-flow-recuperacion-automatica.app`. SHA-256 del SEA: `3f89bd0895be042c50b5ce50daf5b5a0eaac4a20d286abbe766b7b8d867fde73`.
- Repetir controles de artefacto: `node /Users/sebas/Documents/Vimo-Flow-QA/2026-10-13/preparacion-automatica/native/sea/check.mjs 3f89bd0895be042c50b5ce50daf5b5a0eaac4a20d286abbe766b7b8d867fde73`. Usa sólo fixtures/puertos efímeros y niega red externa/escritura fuera del fixture; no abre datos de usuario.
- Pruebas temporales e informes viven fuera de Git en `/Users/sebas/Documents/Vimo-Flow-QA/2026-10-13/preparacion-automatica/`. No se incorpora un framework oficial de tests.

## Pruebas manuales realizadas

Panel de extensión renderizado en Chrome aislado: preparación pendiente/completada, actividad, CAPTCHA y revisión después de login. Se inspeccionó la captura de la guía de actividad y su botón de comprobación. El control de Vimo se hizo mediante renderizado aislado y su ejecutable compilado, sin tocar perfiles reales, datos habituales ni enviar solicitudes a Google. Queda pendiente validar esta entrega con las cuentas del usuario.
