# Fix: vinculación automática con autorización durable

- **Fecha:** 2026-10-13
- **Rama:** feat/flow-export-motion

## Causa

La reconexión de una credencial guardada ya existía, pero el primer vínculo sólo
podía completar un gesto efímero con el panel abierto. Si Vimo no estaba abierto
o se cerraba el panel, el anuncio caducaba y requería otro clic. Además, al
revocar una conexión se borraba su asociación local: añadir una configuración
automática sin una exclusión durable habría tratado ese perfil como nuevo.

## Corrección

- El engine de preparación guarda `automaticSetup.grant` después de comprobar
  el vínculo. `automaticLinkAllowed()` exige el mismo proyecto, cuenta y binding,
  identidad actual y ausencia de exclusiones; `ensureAutomaticLink()` inicia el
  handshake sin esperar su ACK ni admitir trabajos históricos de otro propietario.
- El anuncio usa `panelOpen` real y `automaticLink` versionado. El bridge sólo
  acepta presencia automática con origen explícitamente configurado y opt-in
  `allowAutomaticLinks` junto a `allowExtensionLinkRequests`. Vimo habilita ambos
  en su servicio privado; el puente independiente conserva opt-in por defecto.
- Solicitud y canje usan el mismo alcance de cuenta/proyecto/binding, socket e
  instalación. Cambiar el alcance invalida el nonce. Los replays mantienen el
  mismo requestId y los límites de solicitudes existentes.
- Cerrar el panel conserva exclusivamente una intención automática autorizada.
  Cancelar o desconectar deja `autoLinkBlocked` durable. Revocar conserva el
  propietario deshabilitado; una credencial rechazada jamás cae a un pairing nuevo.
- `auth.resume` conserva credencial y connectionId. La nueva capacidad no escanea
  puertos, no cambia de coordinador y no genera imágenes para probar la conexión.

## Límites deliberados

Vimo y Chrome deben estar ejecutándose. Una app con otro almacén no recibe los
trabajos ni credenciales del coordinador anterior. Identidad, permisos, CAPTCHA,
proyectos ambiguos y revocación siguen requiriendo la acción apropiada del wizard.
La preparación automática del proyecto pertenece al engine integrado por separado.
La firma pública de la extensión identifica su origen; el alcance no contiene secretos.

## Validación reproducible

Arnés temporal fuera de Git: `/private/tmp/vimo-autolink-check.mjs`.
Ejecutar `node /private/tmp/vimo-autolink-check.mjs`. **35/35 controles** con
funciones reales de conexión del worker en VM y los dos bridges WebSocket reales,
con almacenamientos temporales y cuentas ficticias. Incluye apertura con Vimo
apagado y conexión posterior sin panel, reinicio de ambos conservando credencial,
cancelación, revocación persistente, cambio de alcance, origen no autorizado,
capability ausente, pairing manual compatible e historial de otro propietario.
También verifica reconectar expresamente después de desconectar sin rotar credencial;
el ACK limpia discoveryDisabled y el reintento del wizard no elimina revocaciones.

Comprobar `node --check` de ambos bridges y del worker; para Vimo, ejecutar además
`pnpm exec tsc -b` y verificar formato del vendor y servicio privado al integrar.

### Verificación del artefacto entregado

El 2026-10-13 pasó **5/5** contra `artifacts/vimo-automate-0.2.36/background.js` y el ejecutable real de `Vimo-0.10.0-flow-autonomo.app`, SHA256 `8fcd272079760cd0568823166fa8fc70ba50410dcae2ca20be0f7c780ba3c0f5`. Se comprobó primera conexión con panel cerrado, reinicio conservando credencial, reconexión manual y revocación durable sin revinculación automática. El SEA utilizó archivos aislados y sockets loopback reales, sin red saliente ni datos del usuario.

```sh
node /private/tmp/vimo-autolink-sea-check.mjs \
  /Users/sebas/Documents/Vimo-builds/Vimo-0.10.0-flow-autonomo.app/Contents/MacOS/vimo-pipeline \
  8fcd272079760cd0568823166fa8fc70ba50410dcae2ca20be0f7c780ba3c0f5 \
  /Users/sebas/Documents/EXTENSION-RPC-FLOW/artifacts/vimo-automate-0.2.36/background.js
```

Runner, fixture e informe se conservan fuera de Git en `Vimo-Flow-QA/2026-10-13/configuracion-autonoma/link/`; hashes de archivos en `package-artifacts.json`. Esto verifica el protocolo compilado, no la interfaz real de Google Flow.

## Pruebas manuales realizadas

No se tocaron perfiles reales ni se invocó Google. La prueba usa sockets loopback,
Chrome simulado y el almacenamiento real aislado del bridge. No acredita una
prueba visual del wizard ni de generación de imágenes. La aceptación del protocolo
compilado está cubierta por los cinco controles del artefacto; Google queda pendiente.
