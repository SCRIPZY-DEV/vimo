# Fix: la hora de vuelta del cupo no rompe el modal con una espera desmedida

- **Fecha:** 2026-09-30
- **Rama:** feat/catalogo-estilos

## Causa

`vimoServerRetryAt` (`src/modules/common/fetcher/vimoServerError.ts`) calcula a qué hora vuelve a
haber cupo para el agente reconstructor sumando `retryAfterSeconds` a la hora en que llegó la
respuesta, y la devuelve con `toISOString()`. El validador de `retryAfterSeconds` solo exige un
número finito y no negativo, pero `Date` representa como máximo ±8.64e15 ms: con una espera de
8.64e12 segundos o más (o una suma que da `Infinity`), la fecha queda inválida y `toISOString()`
lanza `RangeError: Invalid time value`. Desde la Tarea C3 esa función se llama al dibujar el error
del agente (`GemRebuildErrorText`), así que un servidor que mandara un valor absurdo dejaba el
modal en blanco.

## Corrección

`vimoServerRetryAt` arma la fecha, comprueba `Number.isNaN(date.getTime())` y devuelve `null` si es
inválida, antes de llamar a `toISOString()`. Quien la usa ya trata `null` como «no sé cuándo vuelve»
(`GemRebuildErrorText` muestra el texto sin hora). Con una espera representable, el resultado es el
mismo de antes.

## Límites deliberados

- Una espera representable pero absurda (por ejemplo, del año 33 715) se sigue formateando: no se
  acota con un horizonte razonable, porque el servidor del frente B calcula la espera desde la
  ventana de 24 h del cupo.
- No se cambia el validador de `retryAfterSeconds`: la protección va donde está el riesgo, al armar
  la fecha.

## Validación reproducible

```bash
node --test scripts/test/check-app-vimo-server.mjs
```

22 casos en verde. El caso nuevo usa el último valor representable y el siguiente: el primero
devuelve una fecha y el segundo `null`, sin lanzar. Sin la corrección, ese caso falla con
`RangeError: Invalid time value`.

## Pruebas manuales

Ninguna en la app: todavía ninguna pantalla llama al agente (el modal por secciones llega en las
Tareas C4b y C4c). El guard empaqueta el cliente real con esbuild.
