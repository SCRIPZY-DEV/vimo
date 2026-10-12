# Fix: vinculación iniciada desde la extensión sin copiar token

- **Fecha:** 2026-09-20
- **Rama:** `feat/extension-vimo-automater`

## Causa

La extensión0.2.12 sólo anunciaba `discovery.hello` al seleccionar el proyecto.
El canje sin copiar código existía, pero exigía otro clic en Vincular dentro de
Vimo. Además, el listener nativo se arrancaba de forma perezosa al primer
comando Flow: tener Vimo abierto en otra pantalla no garantizaba que escuchara.
La UI presentaba el código temporal como bloque principal y podía interpretarse
como un requisito para la primera asociación.

## Corrección

- `src-tauri/src/flow.rs` y `lib.rs`: arranque en segundo plano al abrir la app,
  mismo mutex/proceso/puerto/almacén. El cierre impide arranques tardíos y recoge
  al hijo durante el handshake; errores se registran con mensaje fijo seguro.
- `pipeline/providers/flow/service.ts`, `vendor/bridge/server.js` y `.d.ts`:
  opt-in `allowExtensionLinkRequests`, capability y solicitud preauth explícita
  `discovery.link.request`. Sólo el socket del candidato puede pedir su propio
  vínculo; UUID idempotente, nonce30s, guard de origen/instalación/identidad.
  Presence/hello no vincula ni autoriza; ledger acotado sin expulsar replays.
- `server.js` y `profiles.js`: invalidar canjes ante identidad/preparación
  cambiante y reservar `linkedAccountKey` antes del ACK para que otra conexión
  no reclame la misma cuenta durante la espera del primer snapshot.
- `FlowManualPairing.tsx`, `FlowManualPairingForm.tsx` y catálogos es/en/pt:
  código manual dentro de opciones avanzadas, cerrado y sin pedir códigos por
  defecto; desmontar el formulario descarta el secreto y respuestas tardías.
- ADR0038 y handoff específico describen el DTO, persistencia, compatibilidad y
  trabajo necesario de worker/panel en la sesión de la extensión.

## Límites deliberados

No se modifica el repositorio externo de extensión, los perfiles reales,
las credenciales del usuario, el presupuesto500/24h, cadencia, concurrencia ni
el pipeline de imágenes. No se ejecutan generaciones, `connection.test` ni
revocaciones. Una cuenta con otro dueño requiere transición explícita segura.
El ledger de solicitudes de enlace es por proceso, no durable; la extensión
debe descartar intención al desconectar/reiniciar y exigir un nuevo gesto.

**El gesto único no queda disponible para la extensión0.2.12 hasta implementar
el [emisor descrito en el prompt](../docs/handoff/2026-09-20-flow-auto-link/prompt-extension.md).**
La selección desde Vimo sigue siendo compatible y no requiere copiar token.

## Validación reproducible

Desde la rama de trabajo, con Node22:

```sh
pnpm format
pnpm lint
pnpm build
pnpm check:locales
pnpm exec tsc -p tsconfig.pipeline.json --noEmit
cargo check --manifest-path src-tauri/Cargo.toml --lib --offline
cargo test --manifest-path src-tauri/Cargo.toml --lib --offline
```

Los harnesses temporales no se versionan. La reproducción contractual usa
`createBridge` con un directorio temporal nuevo, puerto0 y WebSocket real de
un perfil simulado; nunca el almacén/puerto de Vimo. Verificar hello pasivo,
capability opt-in, request→pair→auth.paired, origen/socket/identidad ajenos,
vencimiento/replay, cuenta duplicada y cero mensajes de generación. La prueba
del SEA debe repetir el contrato contra el binario empaquetado, con stdin
privado y puerto efímero, sin imprimir su token ni escribirlo en argumentos.

## Pruebas manuales realizadas

- `pnpm format`, `pnpm lint`, `pnpm build`, tipos de pipeline y paridad de las
  1.431 claves es/en/pt pasaron. `cargo check --lib --offline` y las tres pruebas
  Rust existentes también pasaron.
- 24 casos adversariales de bridge real por WS: hello pasivo, opt-in apagado,
  origen/socket/cuenta/instalación, nonce/UUID vencidos, replay tras reconexión,
  A→B→A, cuenta reservada antes del snapshot y límite128. Se reprodujo la
  carrera del primer heartbeat antes de aplicar `profiles.identityConflict`.
- 12 comprobaciones sobre servicio compilado con esbuild y otras 12 sobre el
  SEA incluido en `Vimo.app`: stdin privado, HTTP autenticado y WS reales en
  directorio/puerto temporales. Vinculación simulada, cero jobs, tokens ausentes
  del estado público y ledger, cierre limpio.
- 8 comprobaciones temporales Rust del lifecycle original: cierre durante
  handshake, cierre previo/tardío, mutex envenenado, timeout y recolección de
  hijos. Usan procesos locales sin listener Flow.
- 16 comprobaciones React temporales: SSR real confirma bloque cerrado y cero
  llamadas al abrir; lifecycle controlado confirma desmontaje, timers y
  respuestas tardías. Esta evidencia se distingue de las comprobaciones UI.
- UI nativa del **bundle final**: cierre de versión anterior y apertura de
  `src-tauri/target/release/bundle/macos/Vimo.app`; en Crear (sin visitar aún
  Extensión) se observó un único listener127.0.0.1:43127. Después se comprobaron
  tres cuentas conectadas, consumo7/3/3 sobre500 conservado, cero en curso y seis
  lotes existentes. Opciones avanzadas cerradas inicialmente; abrir/cerrar
  mostró/ocultó Crear código temporal, sin pulsarlo ni crear códigos.
- `pnpm tauri build --bundles app` correcto con firma local ad-hoc y
  `codesign --verify --deep --strict` aprobado. No publicación ni notarización.
  SHA256 ejecutable principal:
  `10cbcd576a8ebe461d07e7e0c2f1b31d4d22ebe8dbbd2e4aaf1445a65de88842`;
  SHA256 SEA:
  `bd890c4115d6d1b0fb48e3eec05e152ae264cd8b4c8bb295030d3836ca8bd013`.

No se hizo una vinculación real nueva desde la extensión: su emisor sigue
pendiente del traspaso. No se borró historial ni se generó ninguna imagen.
