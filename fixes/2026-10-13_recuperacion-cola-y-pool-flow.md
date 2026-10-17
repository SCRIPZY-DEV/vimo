# Fix: recuperación de cola y admisión con cuentas temporalmente ocupadas

- **Fecha:** 2026-10-13
- **Rama:** feat/flow-export-motion

## Causa

La extensión dejaba como cola remota un trabajo confirmado no enviado al pausar una cuenta; un permiso de comprobación nuevo ya no podía autorizarlo. El coordinador conservaba el dueño y esperaba progreso. Separadamente, exigir cinco cuentas disponibles para cada regeneración independiente bloqueaba las cuatro sanas después de consumir un permiso de comprobación.

## Corrección

Se porta la elegibilidad estricta de `SCHEDULE_CANCELED` y de trabajos nunca iniciados en un perfil temporalmente indisponible. La extensión entrega un fallo durable y el coordinador recupera mediante su política existente. Los recibos inciertos conservan su tratamiento anterior.

La capacidad para lotes automáticos distingue cinco perfiles configurados de los disponibles en ese momento. Se asigna sólo a estos últimos, conservando cuotas, reservas y límite físico. `configuredProfiles` llega también al estado. El preflight Tauri permite y valida `autoRecoveryVersion:1` para consultar la misma política que usa el envío; el formato histórico permanece compatible.

La UI y el editor usan el resultado de capacidad. Véase también `2026-10-13_regeneraciones-flow-sin-tope-local.md` para las solicitudes simultáneas del editor.

## Límites deliberados

No se reactivó el lote cancelado observado ni se modificaron sus 24 resultados. No se cambian pausas manuales/globales, identidades, proyectos, límites físicos ni evidencia de envíos inciertos. Sin generación externa durante la verificación.

## Validación reproducible

`pnpm format`, `pnpm lint`, `pnpm build`, typecheck del pipeline y `cargo test --manifest-path src-tauri/Cargo.toml --lib`. Los tests Rust de `flow/tests/commands.rs` prueban el transporte del plan y recuperación y el rechazo de versiones/campos inválidos.

Las comprobaciones temporales de worker y puente viven fuera de Git en `/private/tmp/vimo-recovery-regression-20261013/`; emplean cinco clientes WebSocket, directorio temporal y resultados simulados. Prueban la recuperación tras no envío y la admisión con una cuenta temporalmente fuera, sin perder mínimos estructurales ni reserva por perfil.

## Pruebas manuales

Inspección de sólo lectura del registro real: lote de 25 con 24 listas y escena 7 cancelada después del atasco; su auditoría registra un intento no enviado. No se mutaron datos del usuario. Queda pendiente la aceptación en la app con generaciones reales.

## Evidencia final y entrega local

- Worker 31/31, puente 11/11 y admisión 13/13 tanto en extensión como en vendor. Versiones anteriores reproducen el atasco y el veto de 19 de 20 solicitudes con una cuenta comprobando. Regresiones previas 66/66 y 33/33.
- Store del editor 13/13 con veinte Flow junto a cinco pagos; preflight/helpers/API reales con transporte simulado 11/11. Catálogos alineados con 2156 claves. Format, lint, build y `tsc -p tsconfig.pipeline.json --noEmit` pasaron. Rust 63/63, incluidos dos tests del contrato de capacidad.
- Ejecutable empaquetado exacto: 10/10 controles del coordinador por HTTP/WebSocket más 7/7 de regeneración nativa/importación JPEG. Tres escenarios terminan veinte solicitudes cada uno; máximo de 3 reservas por perfil normal y de 1 en comprobación. Reasignación conserva prompt/hash y reiniciar no reenvía resultados completos. El mínimo de espera es 5 segundos; el scheduler real revisa hasta cada 20 segundos.
- App: `/Users/sebas/Documents/Vimo-builds/Vimo-0.10.0-flow-cola-recuperada.app`, identidad habitual `click.vimo.portable`, firma local verificada con `codesign --verify --deep --strict`. Los siete archivos de la copia son idénticos al bundle. SEA SHA-256 `e154faf32d21144d6b43a3119682cc5302bffe8f08295a5db79e052199def761`.
- Extensión complementaria: carpeta `artifacts/vimo-automate-0.2.34` del repo EXTENSION-RPC-FLOW, mismo ID/permisos, 31/31 controles sobre el paquete. App y extensión se actualizan conservando cuentas/proyectos.

Reportes y arneses temporales fuera de Git: `/Users/sebas/Documents/Vimo-Flow-QA/2026-10-13/cola-recuperada/`, más `editor-unlimited/` para UI/store. Los procesos de QA del artefacto restringen red y escrituras a fixtures. No se generó en Google ni se consumieron créditos; queda pendiente la aceptación real del usuario.
