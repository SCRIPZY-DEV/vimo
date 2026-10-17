---
title: Fix - Fallos Flow por escena y recuperación de lotes parciales
date: 2026-09-21
tags: [vimo, flow, pipeline, recovery, fix]
---

# Fix: fallos Flow por escena y recuperación de lotes parciales

- **Fecha:** 2026-09-21
- **Rama:** `feat/extension-vimo-automater`

## Causa

El cliente dejaba de observar el lote al encontrar su primer recibo fallido,
incluso si otros trabajos seguían en cola o generándose. El `catch` del carril de
imágenes emitía después `scene-image-failed` para todos los destinos no importados.
Un error agregado de revisión se propagaba como si cada escena hubiera fallado.
Además, `canRestart` se evaluaba para todo el lote cuando aún había hermanos
activos; por eso un rechazo seguro acababa presentado como `flow_review_required`.

Auditoría de sólo lectura de Video01-extension: el intento original tenía 88
recibos coincidentes, **87 ready y un rechazo ACTIVITY_BLOCKED/RPC7 en la escena 2**.
La regeneración posterior de esa escena ya estaba lista e importada. Los 88 JPEG
canónicos del proyecto coinciden por hash/bytes con sus recibos y decodifican a
1376×768. Hay 89 envíos confirmados entre ambos intentos, sin reintentos ni
resultados inciertos. La metadata de error precede a esa regeneración; no se
modificó. Esta evidencia no significa que Google no pueda rechazar futuros envíos.

## Corrección

- El cliente sigue recogiendo e importando resultados después de un fallo aislado;
  admite páginas pendientes del mismo intento con sus IDs y reserva originales.
- Un callback por recibo informa sólo la escena afectada. Errores de descarga o
  importación también se aíslan; no se rehacen prompts, semillas ni solicitudes.
- Se conserva revisión para trabajos inciertos o pendientes. Una pausa global con
  fallo deja drenar las operaciones en vuelo y conserva la cola para recuperación.
- Si se cierra el observador, los hermanos sin fallo confirmado quedan pendientes
  de sincronizar, sin error rojo ni spinner. Crear y editor reconocen esa espera;
  la recuperación externa permite reabrir progreso sin perder deduplicación.
- Crear y Biblioteca muestran recuperación contextual del lote y enlace a Extensión.
  El editor conserva el UUID existente cuando recupera una selección. No hay una
  autorización adicional para importar resultados del mismo intento.
- El reinicio de una generación fallida sigue exigiendo cierre seguro de todos los
  recibos. No se rebajan los guards de incertidumbre ni la validación del resultado.

Archivos principales: `pipeline/providers/flow/client.ts`, contrato interno
`types.ts`, `pipeline/stages/images/flow-lane.ts`, reducers de Crear/editor,
controles de error, celdas de escenas, constantes y catálogos es/en/pt.
La explicación de flujo está en ADR-0038, con su espejo en el vault.

## Límites deliberados

No se modifican perfiles, pausas, consumo, proyectos, tokens, recibos ni archivos
reales del usuario. No se generan imágenes ni se ejecuta `connection.test` para
validar este cambio. Se conservan 500 envíos por perfil/24 h y los límites actuales
de concurrencia/cadencia. No cambia el contrato RPC de la extensión, el scheduler,
los proveedores pagos ni el sistema de prompts. Un rechazo real de Google sigue
siendo un fallo de esa imagen; no se promete que el proveedor nunca vuelva a fallar.
El historial de error del proyecto no se reescribe manualmente para ocultarlo.

## Validación reproducible

```sh
pnpm format
pnpm lint
pnpm build
pnpm check:locales
pnpm exec tsc -p tsconfig.pipeline.json --noEmit
```

QA temporal fuera del repo con el cliente original y HTTP loopback efímero:
88 solicitudes, páginas 50/38, una rechazada y 87 listas; debe importar las 87
antes del error final y emitir sólo el fallo concreto. Reabrir el mismo intento
no admite otra vez los recibos existentes. Repetir con un `unknown`, un rechazo
de recuperación de descarga, importación inválida, ACK perdido, cancelación,
pausa/hold, snapshot/ACK incompleto y hash de recibo ajeno. Nunca marcar completo
un lote parcial ni reenviar una operación incierta.

Validar además callbacks reales del carril, reducer de Crear, store del editor
y render de sus controles con proveedores simulados. La espera de sincronización
es neutral, no habilita un reemplazo incierto y conserva el error global.

**Resultado:** formato, lint, build, tipos del pipeline, `diff --check` y paridad
de 1.475 claves es/en/pt aprobados. Pasaron 11 escenarios HTTP del cliente original,
3 escenarios independientes de recuperación externa/pausa, 13 comprobaciones del
carril, 38 de render SSR, 35 del store del editor y 8 del store de Crear.
Los scripts de verificación permanecen fuera del repo como QA temporal.

Se recompiló el sidecar y el bundle Tauri en un target aislado. La aceptación se
repitió **directamente con el sidecar y FFmpeg de la app firmada final**: tres
escenarios, seis procesos reales de `regenerate-scene-images`. El caso de 88
produce 87 eventos ready y un solo failed, con páginas 50/38. Un recibo unknown
no afecta a sus tres hermanos; un ACK perdido produce cuatro awaiting_sync sin
fallos falsos y el siguiente proceso importa los cuatro. Todos los replays tienen
cero nuevas admisiones; 94 JPEG sintéticos verificados por hash y decodificados
por FFmpeg. Prompts e IDs conservados, sin consultar proveedores.

Firma comprobada con `codesign --verify --deep --strict`. App local final:
`src-tauri/target/review-flow-recovery/Vimo.app`, ignorada por Git. SHA-256 del
sidecar firmado sometido a aceptación:
`65318772c9c081102a3bfc21afac4df90c4a90d22846527ddeed71fe9ad6fee2`.
El informe temporal de esa ejecución está en
`/private/tmp/vimo-flow-cascade-sea-VGiSwO/report.json`.
No se reemplazó ni reinició la app que el usuario tenía abierta.

## Pruebas manuales realizadas

Lectura agregada de recibos y verificación de los 88 JPEG del proyecto real, sin
escritura. No se reinició la app ni se manipuló Google o perfiles del usuario.
Las pruebas del comportamiento corregido son controladas con datos temporales;
no se afirma una nueva generación real ni QA visual manual de la app final. La
aceptación del paquete ejecutó directamente su sidecar firmado, con entradas
controladas y sin abrir perfiles reales.
