# Fix: Motivo explícito de bloqueo de Multimagen sin perder incertidumbre

- **Fecha:** 2026-10-13
- **Rama:** feat/flow-export-motion

## Causa

El SDK verificado de Multimagen rechaza su promesa con un mensaje del host. El ejecutor conservaba correctamente el intento como `TOOLS_SUBMISSION_UNKNOWN`, pero eliminaba el motivo de actividad inusual, verificación o sesión. La guía de cuentas podía mostrar recuperación técnica genérica aunque Google hubiera comunicado una restricción concreta.

## Corrección

- `flow-tools-2026-10-13.1` reconoce únicamente mensajes explícitos y guarda `error.recoveryReason` con `ACTIVITY_BLOCKED`, `CAPTCHA_REQUIRED` o `SESSION_REQUIRED`. No publica texto crudo del host.
- El código `TOOLS_SUBMISSION_UNKNOWN`, el identificador de invocación y `submission: unknown` no cambian. El campo describe la restricción, no demuestra que la imagen haya sido rechazada ni autoriza otro envío.
- Aplica también a referencias subidas. Su generación sigue sin enviar y la certeza de la operación de subida continúa en `operationSubmission: unknown`.
- La caché permite obtener el motivo cuando llega después del timeout. Repetir la invocación o hacer lookup devuelve el mismo intento; no llama nuevamente al SDK.
- Los coordinadores de extensión y Vimo conservan sólo el enum permitido en errores inciertos de Tools. Los recibos de managers anteriores siguen disponibles; solicitudes nuevas necesitan una herramienta preparada con la versión actual.
- Los avisos de Vimo muestran causa e incertidumbre juntas; la guía de actividad atribuye la suspensión de nuevos envíos a la extensión, sin inventar rechazo definitivo del proveedor.

## Límites deliberados

Un 403 genérico, `permission denied`, errores de red, validación de metadatos y texto ambiguo no prueban actividad inusual ni CAPTCHA. No se automatizan comprobaciones humanas ni se convierten envíos inciertos en fallidos. La recuperación de disponibilidad y el enriquecimiento durable de motivos tardíos se integran con la política de cuentas; no liberan recibos ni cupos inciertos.

## Validación reproducible

Fuera del repositorio:

```sh
node --experimental-vm-modules /private/tmp/vimo-tools-reasons-check.mjs
```

45 casos / 246 aserciones verdes sobre la función real serializada, hashes de SDK/app observados, métodos SDK simulados y ambos normalizadores del coordinador. Incluye generación, referencia, timeout con fallo tardío, replay único, metadatos, redacción pública, enums malformados y lectura de recibos del manager 12.1. Informe y script archivados en `Vimo-Flow-QA/2026-10-13/configuracion-autonoma/tools/` fuera de Git.

Para el artefacto puede pasarse `VIMO_TOOLS_SOURCE=/ruta/artefacto/flow/tools.js` al mismo comando. No es una prueba real de generación en Google.

### Presentación de Vimo

`node /private/tmp/vimo-tools-reason-ui-check.mjs`: 8/8 casos verdes; las tres razones distinguen generación y referencia inciertas en los tres idiomas. Un recibo completado no muestra el aviso anterior. Typecheck de app y pipeline y catálogos alineados (2182 claves) correctos.

### Artefacto 0.2.36

El 2026-10-13 se repitieron **45/45 casos y 246 aserciones** con `VIMO_TOOLS_SOURCE=/Users/sebas/Documents/EXTENSION-RPC-FLOW/artifacts/vimo-automate-0.2.36/flow/tools.js`. SHA256 del manager empaquetado: `a073d55a0cdc36989defe674a04e33e4982b8337880f5a05228b69029758e7a0`. Informe final fuera de Git: `Vimo-Flow-QA/2026-10-13/configuracion-autonoma/tools/package-report.json`. No se invocó Google ni se alteró la certeza de los recibos.

## Pruebas manuales

No se enviaron generaciones a Google ni se usaron perfiles o credenciales reales en esta comprobación. La aceptación visual y con el proveedor queda para la validación del usuario sobre la entrega compilada.
