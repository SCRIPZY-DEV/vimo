---
title: Flow - historial, pausa y capacidad visibles
date: 2026-09-20
tags: [vimo, flow, bugfix, editor]
---

# Fix: controles y disponibilidad de Flow

- **Fecha:** 2026-09-20
- **Rama:** feat/extension-vimo-automater

## Causa

1. Chrome ejecutaba 0.2.9 en los tres perfiles aunque la carpeta instalada y su ZIP ya contenían 0.2.12. Los workers anunciaban 400; Vimo mostraba correctamente ese límite recibido.
2. La respuesta a `queue.pause` acredita que el coordinador guardó y envió la orden, no que cada worker ya la aplicó. Invalidar una sola consulta hacía reaparecer el botón con un snapshot anterior.
3. El borrado individual existía dentro del lote expandido; faltaban selección, acción visible y borrado de todo el historial elegible.
4. «Cuentas listas» nombraba perfiles con capacidad de reserva, incluyendo una cuenta `checking` limitada a una imagen. «Capacidad local» no distinguía saldo móvil, reservas ni espacio del historial.

## Corrección

- Selector traducido a «Flow (Gratis)» en español; equivalentes en inglés y portugués.
- Pausa/reanudación compartida en todas sus superficies; una orden por gesto, confirmación por snapshot fresco de cada cuenta y feedback durante la espera. Las respuestas tardías no autorizan reenvíos. Renombrado a «Pausar/Reanudar generaciones Flow».
- Papelera visible por lote, selección y borrado masivo con lista fija revisable. Sólo elimina IDs confirmados, revalida elegibilidad y respeta el guard de `batch.delete`. Muestra resultados parciales y limpieza pendiente.
- El aviso del editor separa imágenes solicitadas, disponibles para reservar y cuentas con capacidad. Desglose por cuenta del saldo de 24 horas, espacios de historial y capacidad; explica `checking` sin simular una generación.
- Un worker antiguo conserva su límite real y muestra instrucciones para actualizarlo cuando no haya trabajo pendiente.

## Actualización operativa comprobada

Antes: tres workers de 400 con consumo 7/3/3 y capacidad **791 = 393 + 1 + 397**. Fuente, carpeta y ZIP 0.2.12 tenían paridad de 17 archivos; ID público estable `bjpjjnjiikhccbjlkgmfpfhenbdpikbm`.

Se recargó únicamente la extensión existente en cada perfil desde el administrador de Chrome y se reabrió su panel. No se desinstaló, revinculó ni copió ningún token. Heartbeat del 2026-09-20 a las 12:12:56: **tres workers de 500**, consumo 7/3/3, saldo 493/497/497, disponibilidad ready/checking/ready y capacidad **981 = 488 + 1 + 492**. Conservó los 28 trabajos: 25 ready y 3 failed conocidos; cero trabajos activos, inciertos o reintentos pendientes. No se generaron imágenes.

Los conteos y asociaciones visibles se preservaron. No había hash previo de todos los IDs: no se afirma una comparación criptográfica de identidad completa. La capacidad 981 está limitada por historial y revisión; no equivale al saldo de 24 horas agregado.

## Límites deliberados

- No cambia cuotas, cadencia, concurrencia, fórmulas conservadoras de admisión ni pausas del proveedor. La política vigente sigue siendo 500 por perfil/24 h; el número de historial es independiente.
- Borrar historial elimina copias del bridge y compacta sus recibos, conservando auditoría e idempotencia. No toca imágenes ya importadas en proyectos Vimo, originales de Google ni exportaciones; no devuelve consumo. La confirmación avisa que las imágenes aún no importadas pierden su copia recuperable local.
- Un perfil en comprobación no se fuerza a listo. La siguiente imagen autorizada podrá comprobar su disponibilidad según la extensión; este arreglo no llama `connection.test`.
- No se eliminó historial real del usuario para validar el botón. Las pruebas destructivas usan directorios temporales y workers simulados.
- No se publican scripts temporales, imágenes, releases ni cambios en la fuente de la extensión.

## Validación reproducible

Comprobaciones ejecutadas y correctas:

```sh
pnpm format
pnpm lint
pnpm build
pnpm check:locales
pnpm exec tsc -p tsconfig.pipeline.json --noEmit
APPLE_SIGNING_IDENTITY=- pnpm tauri build --bundles app
codesign --verify --deep --strict src-tauri/target/release/bundle/macos/Vimo.app
```

Para el build local se retiraron las variables `APPLE_*` heredadas salvo la identidad ad hoc; no se usaron credenciales ni notarización de distribución. El sidecar conserva los entitlements SEA y el SHA-256 `165f2208a0abb9f44790ceadab269abd7eb1b78b2e32768acb428aee900488a3`, sin cambios de pipeline. SHA-256 del ejecutable principal: `b7d2ec453cf880db49eeecbdd05a410f08a9e23efb7e54e653e76b2a0b8a323d`.

47 comprobaciones locales temporales, fuera del repositorio, ejecutadas con Node 22:

- 27 de pausa con hooks React/Query y reloj simulados: ACK temprano, snapshot viejo, respuesta tardía, timeout de cada await, doble clic entre consumidores, remontaje y rechazo tardío.
- 11 de API real y bridge aislado: snapshot fijo, guard de estados activos/inciertos, fallos parciales, idempotencia, limpieza pendiente y protección de archivos importados aunque el recibo apunte a ellos.
- 9 de SSR real React/Query/i18n: acciones visibles sin expandir, selección elegible, resultado parcial y desglose 981 con cuenta checking.

No son tests oficiales ni pruebas reales contra Google. Los fixtures usan directorios temporales. Los catálogos es/en/pt tienen 1431 claves alineadas.

Para repetir manualmente: abrir Extensión, revisar 500 por cuenta, seleccionar uno o varios lotes y abrir/cancelar la confirmación. Con la cola vacía, pausar una vez y reanudar una vez; observar feedback hasta confirmar sin segundo clic. En el editor elegir Flow (Gratis) y abrir «Cómo se calcula la disponibilidad».

## Pruebas manuales

- Chrome: versión 0.2.9 → 0.2.12 de la instalación fija; paneles y heartbeat confirman 500, consumo conservado y 28 trabajos.
- Vimo nativo: selector «Flow (Gratis)» en Crear y en el editor; tres cuentas reconectadas mostrando 7/500, 3/500 y 3/500.
- Galería: seis lotes con papelera visible, apertura y cancelación de confirmaciones para uno y todos; cero borrados reales. Se corrigió concordancia singular detectada en esta revisión.
- Editor: solicitadas 1, disponibles 981, cuentas con capacidad 3; desglose 488/1/492 y explicación de la cuenta checking, sin ejecutar regeneración.
- Pausa/reanudación se validó con 27 escenarios simulados, sin cambiar las pausas reales de los perfiles ni ejecutar una imagen de comprobación.
- Tras reiniciar Vimo, los tres perfiles volvieron a conectar automáticamente. El control de seguridad del navegador bloqueó un intento de abrir su página interna; no se buscó evadirlo ni hizo falta ese paso para recuperar la conexión.
