# Revisión de compatibilidad con vimo-automate 0.2.9

- **Fecha:** 2026-09-17
- **Vimo:** `cd2daf5`, rama `feat/extension-vimo-automater`.
- **Extensión:** `664909d3b2cc77e431e86d724874472c24a0dfe9`, rama `feat/flow-extension`.
- **Alcance:** revisión de código y artefactos; no se recargaron perfiles, movieron
  almacenes ni generaron imágenes. El repositorio externo quedó sin modificar.

## Resultado

No se necesita actualizar el código del coordinador incorporado en Vimo para
usar 0.2.9. Los ocho archivos JavaScript incorporados coinciden con la extensión
actual después de aplicar únicamente Prettier y retirar el arranque CLI, las dos
adaptaciones documentadas. La comprobación de identidad al canjear ya está en
Vimo. El nuevo módulo `bridge/extension-identity.js` sólo exporta constantes
públicas equivalentes al origen fijado por Rust.

El cambio 0.2.9 hace idempotente el vínculo del mismo proyecto: conserva
`bindingId`, credencial, conexión, cola y pausas; permite renombrar sin volver a
vincular. El panel distingue Proyecto vinculado, Guardar nombre, Cambiar proyecto
y Vincular esta pestaña, y bloquea dobles clics mientras guarda. Invalida una
comprobación tardía si cambian la pestaña, el documento o la cuenta. No añade
comandos nativos ni cambia el contrato de imágenes.

## Pendiente operativo: cuentas del puente de prueba

**Los tres perfiles ya vinculados al puente independiente no se anunciarán
como nuevos candidatos ante un almacén vacío de Vimo.**

La extensión conserva `pairing` después de un `auth.resume` rechazado.
`ensureProfileVisibility` reutiliza esa credencial siempre que exista;
Reconectar/Mostrar perfil no la convierten en un anuncio nuevo. Desconectar
sólo deshabilita el vínculo. Este comportamiento conserva la identidad previa,
pero necesita una transición explícita al cambiar de coordinador.

Lectura agregada, sin exponer credenciales:

- El almacén del ensayo de identidad estable conserva tres vínculos, cero
  trabajos y pausa activa.
- El directorio privado `flow` de Vimo todavía no existe en este equipo.
- No había un listener en el puerto43127 al realizar la revisión.

Para conservar el vínculo automático hay que trasladar o copiar íntegramente el
almacén confirmado hacia los datos privados de Vimo, con ambos coordinadores
detenidos, comprobación de destino, copia de seguridad y validación posterior.
No se realiza ese traslado durante esta revisión. No copiar sólo `state.json`,
revocar enlaces como atajo ni exportar tokens al portapapeles.

La alternativa de producto es que la extensión ofrezca un cambio explícito de
coordinador que preserve presupuesto, recibos y trabajos. Existe también código
manual temporal, pero no cumple la experiencia automática solicitada para este
traspaso. La pausa del ensayo se conserva y necesita reanudación explícita;
Vincular proyecto no debe levantarla.

## Verificación independiente realizada

- Versión de manifiesto y paquete:0.2.9.
- ZIP, carpeta descomprimida y fuente:17 archivos idénticos byte a byte.
- ZIP:90018 bytes; SHA-256
  `b6353f1f266a20c104015914067452ab4c75b626183f3d617d949682b952963b`.
- Sintaxis de los14 módulos JavaScript del paquete aprobada con `node --check`.
- 46 comprobaciones simuladas aprobadas contra el código final:29 del worker y17
  del panel. Repetición/renombre conservan identidad y pausa; trabajos unknown
  fijan proyecto; navegación/cierre/cambio de cuenta invalidan probes tardíos.
  Harness con Chrome/WebSocket/IndexedDB en memoria, sin perfiles ni Google.
- SPKI RSA2048 canónico; ID derivado
  `bjpjjnjiikhccbjlkgmfpfhenbdpikbm`, igual al origen fijado en Vimo.
- SHA-256 público:
  `19f99d988a72219ba6c5f574d13f8a1c82bc1703026291f46b5e46c92d036d7e`.

La documentación de la otra sesión informa vinculación y reconexión reales de
las tres cuentas con0.2.8, sin generación. Para0.2.9 informa controles de
panel/worker y Chrome aislado; no afirma recarga en los perfiles reales. Esta
revisión distingue esa evidencia reportada de las verificaciones propias.

Paquete local revisado:
`/Users/sebas/Documents/EXTENSION-RPC-FLOW/artifacts/vimo-automate-0.2.9/`.

## Acción para la sesión de la extensión

La identidad estable y el parche de canje pedidos en el prompt anterior ya están
resueltos. Conservar clave e ID. No hace falta generar otro token manual ni
cambiar el protocolo para Vimo. Coordinar el traspaso del almacén de prueba y la
recarga0.2.9 con el mismo ID, sin desinstalar, reanudar trabajos ni cerrar procesos
sin comprobar antes su estado. La aceptación final debe hacerse contra el
coordinador empaquetado de Vimo, separada del ensayo del puente independiente.
