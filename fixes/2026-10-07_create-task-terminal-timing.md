---
title: Duración de generación conservada al fallar y reabrir
date: 2026-10-07
tags: [vimo, create, timer, fix]
---

# Fix: el cronómetro no cuenta la espera tras un error

- **Fecha:** 2026-10-07.
- **Rama:** `fix/create-task-terminal-timing-20261007`.

## Causa

`useCreateTask` guardaba `finishedAt` al completar, pero no al fallar. El
componente detenía su intervalo en error conservando sólo el valor local del
último tick. Al remontar la vista o restaurar la tarea, calculaba de nuevo con
`Date.now()`, por lo que contaba también todo el tiempo desde el fallo. Al
reintentar sólo descontaba las pausas de confirmación, no la espera en error.
Además, detener el intervalo podía dejar visible el segundo anterior al fallo.

La reproducción de código aislada fija inicio, fallo a 196,2 s y reapertura a
2488 s: el padre muestra 41m28s en lugar de 3m16s, y el retry incorpora esa espera.
Es la misma clase de síntoma comunicada por Root; no se leyó el estado privado
ni se reconstruyó la duración del proyecto real con esos valores del fixture.

## Corrección

- El patch central de tarea guarda la frontera temporal al entrar en error;
  repetir el mismo error no reemplaza la marca conocida.
- La reanudación descuenta una sola vez la espera desde la pausa o el fallo,
  limpia la marca de fin y conserva el tiempo activo acumulado. Los reintentos
  automáticos mantienen su política y su cuenta regresiva existentes.
- El reloj deriva su valor de las marcas actuales con una suscripción estable;
  se actualiza al recibir error/éxito antes del siguiente tick. Los eventos
  frecuentes de progreso no reinician el intervalo.
- Las tareas restauradas sin una frontera fiable guardan `timingUnknown` y
  muestran «Tiempo no disponible». Incluye un proceso interrumpido con la app
  cerrada y estados antiguos sin marca. La incertidumbre persiste al reanudar o
  completar esa misma tarea; una tarea nueva comienza con tiempo conocido.
- Traducciones ES/EN/PT con explicación de la marca temporal ausente.

## Límites deliberados

No recupera la duración real de tareas antiguas que nunca la persistieron. No
escribe 196,2 s en datos del usuario ni usa la hora de reapertura como supuesto
fin. Tampoco mide tiempos individuales de Google ni cambia política de retry,
dispatch, recibos, prompts, imágenes, bloqueo externo, eventos o API del sidecar.
`finishedAt` es metadata de UI; no existe otro consumidor de su valor fuera del
store y el cronómetro. La persistencia usa el mecanismo local ya existente.

Sólo fuentes del worktree de integración. QA a5a3091 abierta, HMR, SEA, main,
wrapper, manifiestos, puertos, perfiles y datos reales siguen congelados. No se
instala esta propuesta ni se inicia generación.

## Validación reproducible

Controles locales fuera de Git, bajo
`/private/tmp/flow-terminal-ux-20261007/`. El before del store y React SSR ejecuta
el hook y sus eventos reales con reloj, API y almacenamiento sintéticos; detecta
tres negativos en siete casos. La fuente owner aplicada supera 32 casos: error/remonte/restore,
retry, éxito, confirmación, legacy, interrupción, catch de inicio/creación y
backoff automático. El componente real montado en React DOM/jsdom supera 64/64 controles contra
37/64 del padre d8ede351 con el mismo fixture: 27 negativos corregidos. Incluye
fallo y éxito antes del próximo tick, espera y retry conservando el nodo, 40
eventos en diez segundos, pausa normal y tiempo desconocido en ES/EN/PT. Esta
segunda prueba recibe marcas explícitas; el store real de la primera cubre su
persistencia/restauración. Los cuatro hashes del store y siete del DOM coinciden
con la fuente tras formato. Cero red, API real o lectura del lote pausado.

Los fixtures son `check-elapsed-before.mjs`, `check-elapsed-owner.mjs` y
`timer-dom/check-timer-dom.cjs before|after`, ejecutados con Node 22. El primero
lee 52c156ec; el tercero compara d8ede351 con owner. Para repetir, usar una copia
del fixture con un directorio de salida nuevo y las dependencias locales
indicadas en el archivo; no sobrescribir los informes preservados. Los informes
`before-elapsed.json`, `owner-after-elapsed.json` y
`timer-dom/timer-dom-comparison.json` registran esas fronteras y hashes.

Comandos del proyecto: `pnpm format`, `pnpm lint`, `pnpm build`,
`pnpm check:locales`, todos con salida 0. El fixture de cada informe conserva sus comandos, límites
y hashes de fuente. Los scripts de verificación son externos, no tests oficiales
ni archivos incorporados al repositorio.

## Pruebas manuales

Root comunicó el síntoma en QA a5a3091 al reabrir el proyecto fallido. La
corrección todavía no se instaló ni se probó manualmente en la app nativa:
corresponde a una futura ventana coordinada. No se reanudó el lote ni se cambió
su pausa para verificar este fix.
