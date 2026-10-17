# Fix: Recuperación persistente de imágenes Flow en el coordinador nativo

- **Fecha:** 2026-10-13
- **Rama:** `feat/flow-export-motion`

## Causa

Restaurar la disponibilidad de una cuenta no bastaba para completar una escena pendiente: el coordinador agotaba cuatro sustituciones y no podía volver a un perfil que ya almacenaba ese identificador lógico. El receptor debía distinguir un nuevo intento autorizado de un replay o un recibo incierto. Una ampliación sólo del scheduler habría producido falsos verdes con workers simulados que sobrescribían filas automáticamente.

## Corrección

Se porta selectivamente el contrato de recuperación persistente de la extensión 0.2.36 a `pipeline/providers/flow/vendor/bridge/server.js`, `bridge/automatic-recovery.js` y `extension/generation-errors.js`, conservando API HTTP nativa, autenticación local, permisos, descarga y vinculación del sidecar.

- `session.status.capabilities.persistentRecoveryVersion:1` confirma un receptor compatible. El primer envío almacena esa versión y el resumen `autoRecovery.persistentRecoveryVersion:1` informa a Vimo de la continuidad tras cuatro reemplazos.
- Sólo una cadena completa de recibos `failed` temporales con auditoría válida y `uncertain=0` habilita períodos adicionales. Se admite actividad explícitamente rechazada con POST observado, subida rechazada antes de generar y fallos técnicos que confirman no envío. No se convierten SDK ambiguos, resultados, CAPTCHA, sesión, contenido inválido o cuota en evidencia de rechazo seguro.
- Después del período inicial se espera al menos dos minutos; los períodos posteriores amplían la espera hasta treinta. Se respetan plazos del proveedor, disponibilidad, capacidad física, cancelación y pausa global/humana. Los demás perfiles disponibles pueden continuar.
- Al volver a un perfil, el nuevo `job.submit` conserva imagen, hash, prompt, referencias y plan; identifica el recibo local previo mediante `previousLocalAttemptId`. Si la cuenta está comprobando se exige un permiso nuevo de un solo uso. La extensión valida el archivo completo y guarda el recibo anterior junto al nuevo intento antes del ACK.
- El coordinador conserva todos los recibos e intentos. Al restaurar valida contadores, secuencia, enlaces globales entre intentos/dueños y fences locales. La promoción legítima de un resultado histórico conserva su excepción de orden; no se fabrica un ganador ni se elimina un unknown.
- Una cola auto1 antigua agotada sólo migra con evidencia completa segura y receptor actualmente reconciliado y compatible. Pausa, cancelación, resultado, cambio de proyecto o historial incierto impiden migrar.
- Replays y reinicios conservan identidad física y permisos consumidos. Los estados desconocidos mantienen cuatro sustituciones y ocupación física. El nuevo resumen se interpreta mediante el guard documentado en `2026-10-13_estado-recuperacion-persistente-flow.md`.

La espera de disponibilidad de cuenta (2/4/8/15/30 minutos) y el motivo SDK tipificado pertenecen al worker; el coordinador no fuerza aceptación ni modifica su certeza. La explicación del usuario distingue recuperación automática de desafíos que requieren intervención.

## Límites deliberados

No se promete que Google acepte una generación ni ejecución remota exactamente una vez. La incertidumbre conserva recibos y plazas físicas; una cuenta sin plazas no recibe otra imagen de comprobación. CAPTCHA/login, cancelación y pausa elegida requieren sus acciones explícitas. El cierre del computador retrasa las comprobaciones; al reiniciar se conserva el plazo. La política no restaura concurrencia degradada por incidentes ni transforma cupos del proveedor. No se añadieron endpoints externos, claves, servicios o tarifas.

## Validación reproducible

```sh
node /private/tmp/vimo-persistent-vendor-20261013.mjs
node /private/tmp/vimo-persistent-sea-20261013/check.mjs \
  8fcd272079760cd0568823166fa8fc70ba50410dcae2ca20be0f7c780ba3c0f5 \
  /Users/sebas/Documents/EXTENSION-RPC-FLOW/extension
```

- **25/25 vendor**, con WebSocket/coordinador reales y `accept()`/`normalizeJob()` reales: cinco rechazos → espera → reinicio → sexto intento de la misma imagen con perfil reutilizado y resultado; doce intentos seguros; migración legacy; protección de unknown, pausas, contenido, historial y permiso.
- **3/3 SEA final** de `/Users/sebas/Documents/Vimo-builds/Vimo-0.10.0-flow-autonomo.app/Contents/MacOS/vimo-pipeline`, SHA256 `8fcd272079760cd0568823166fa8fc70ba50410dcae2ca20be0f7c780ba3c0f5`: cinco rechazos seguros migran y llegan al receptor real como sexto intento, reinicio conserva ese único envío y cinco unknown no reciben autoridad adicional. Repetido **3/3 con receptor del paquete final 0.2.36**, con 21 archivos cotejados contra fuente y manifiesto de hashes en `sea/package-sha256.txt` (hash de árbol `b2babea82b67c49d9de23db3ca285fe038026b0d6387add163bf347f339da1ab`).
- La ejecución SEA se aísla con `sandbox-exec`, prohíbe salida de red y los puertos 43127/43137/5173, usa datos/credenciales ficticios y exige SHA explícito. El handshake privado no se guarda; el reporte se redacta.
- **92/92 worker**, **25/25 extensión**, **31/31 preenvío**, **18/18 admisión escalonada**, **11/11 bridge**. Revisión independiente de corrupción y permisos: **8+4+5+2** casos.
- Evidencia fuera de Git: `/Users/sebas/Documents/Vimo-Flow-QA/2026-10-13/persistent-recovery-0.2.36/`; incluye scripts, reportes y hashes. Los arneses locales no forman parte del commit.

## Pruebas manuales

No se realizaron generaciones reales ni se alteraron perfiles o datos habituales del usuario. El proveedor de imágenes se simula y no consume créditos. Se ejecutó el binario SEA compilado, con transporte local real y receptor real; la aceptación visual y de Google se valida por separado.
