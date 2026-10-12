# Fix: conservar la recuperación local ante snapshots antiguos de Flow

- **Fecha:** 2026-10-06.
- **Rama:** `feat/flow-dev-compat-20261006`.
- **Base:** integración aislada de `dev` `2950ebb` con Flow `8257e334`.
- **Contrato:** [ADR-0052: Flow como motor de imágenes](../docs/adr/ADR-0052-flow-como-motor-de-imagenes.md).

## Causa

`acceptResult` validaba el recibo remoto y después reemplazaba siempre
`job.result`, estado y error. Un `jobs.snapshot` antiguo podía publicar
`awaiting_url` mientras el downloader seguía activo, recuperar una URL descartada
por el proveedor durante `media.refresh`, o borrar un fallo local y reiniciar su
descarga sin una solicitud explícita. Un replay sobre `ready` también sustituía
metadata confirmada del resultado, aunque el archivo local permaneciera.

La causa se reprodujo contra el vendor previo SHA-256
`7eae71f000a1fac8761bc62aee95637f4a671d34d5f7dc0b80b3e314efb53736`:
cinco de las catorce comprobaciones fallaban. No se usó el almacén del usuario.

## Corrección

En `pipeline/providers/flow/vendor/bridge/server.js` se incorpora sólo el guard
anterior a `job.result = result`: si hay resultado confirmado y descarga activa
o archivo listo, se conserva; si el mensaje es snapshot, se conserva también
mientras se renueva la URL o exista un error local de descarga. Se persiste la
auditoría de intento, se acusa el recibo y se publica el estado local existente.
Un resultado explícito fresco puede recuperar el mismo medio.

Las validaciones de propietario, intento, hash, medio y URL no se eluden. La
fuente externa se leyó sin editarla; no se copió su servidor entero ni se añadió
`connection.test`. Procedencia detallada en el README del vendor.

## Límites deliberados

No cambia la política de generación, cuotas, pausas, scheduler, estado de
referencias, emparejamiento ni almacenamiento. No modifica archivos canónicos de
proyectos. Las pruebas ejercitan el receptor real mediante WebSocket con cinco
workers simulados y downloader controlado; no acreditan comportamiento de Google,
Chrome real, velocidad del proveedor ni el binario empaquetado.

## Validación reproducible

El harness temporal no es una prueba oficial ni se incorpora al repositorio:

```sh
node /private/tmp/vimo-flow-snapshot-authority-20261006.mjs
```

Corre desde la copia aislada y utiliza únicamente directorios `mkdtemp`, puerto
0 y conexiones de prueba. `fetch` externo está prohibido y el downloader sólo
escribe un archivo de fixture. Resultado: **14/14** comprobaciones aprobadas.
Para el contraste previo se usó una copia temporal del vendor original:

```sh
node /private/tmp/vimo-flow-snapshot-authority-20261006.mjs /private/tmp/vimo-flow-vendor-before-20261006 --expect-red
```

Ese modo exige que existan al menos tres fallos; se observaron cinco. Para
reproducir sin el harness temporal: sembrar recibos sintéticos con dueños distintos,
reanudar cinco sockets autenticados y enviar snapshots controlados durante una
descarga retenida, una renovación de URL y dos fallos locales (con/sin URL en el
snapshot). Deben preservarse estado/error/URL; un resultado explícito fresco del
mismo medio sí debe finalizar. Repetir sobre `ready` y comprobar archivo/modelo/
URL idénticos y una sola descarga. Finalmente enviar intento incorrecto, URL no
permitida, hash distinto, recibo de otro dueño y medio cambiado: deben seguir
rechazándose antes del ACK. IDs, semillas e intentos originales se conservan y
no aparece ningún `job.submit`, reintento de generación o `connection.test`.

`node --check pipeline/providers/flow/vendor/bridge/server.js` aprobado. La
comparación AST confirma igualdad de `acceptResult`, `startDownload` y
`requestDownloadUrl` con los fragmentos externos revisados, ignorando únicamente
comentarios y posiciones. Los checks globales y aceptación del artefacto se
registran en el cierre general de la integración; no se atribuyen a esta prueba.

## Pruebas manuales realizadas

Ninguna sobre la app, perfiles de Chrome o Google. Sólo se ejecutó el receptor
real en aislamiento, con datos creados para la prueba. No se abrió el puerto
43127 ni se modificaron conexiones, imágenes o trabajos del usuario.
