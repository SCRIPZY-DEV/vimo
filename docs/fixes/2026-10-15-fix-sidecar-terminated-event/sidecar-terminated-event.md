# Fix: un job cuyo sidecar muere sin evento final deja a la interfaz esperando para siempre

- 📅 **Fecha:** 2026-10-15
- 🌿 **Rama:** `feat/demo-actualizacion`
- **Área:** el puente de jobs de Rust (`src-tauri/src/pipeline/`), el contrato de eventos del pipeline
  ([ADR-0010](../../adr/ADR-0010-pipeline-por-stages-y-migracion-por-modulos.md), enmienda 2026-10-15) y los
  mapas de errores del módulo `videos`.
- **Relacionado:** el «⚠️ Pendiente» de la
  [ADR-0061](../../adr/ADR-0061-demo-v4-catalogo-animacion-avatar-y-pack-por-partes.md), que este arreglo
  resuelve, y el [informe del sidecar que se quedaba vivo](../2026-10-12-fix-lingering-sidecar/lingering-sidecar.md)
  (2026-10-12), que sumó `kill_if_lingering`.

## Causa

`start_pipeline_job` (`src-tauri/src/pipeline/commands.rs`) reenvía por el `Channel` del invoke cada línea NDJSON
del sidecar. Su brazo `CommandEvent::Terminated` sacaba el job de `RunningJobs` y guardaba el log de diagnóstico,
pero no mandaba nada por el canal. Si el proceso moría sin haber emitido `job-completed` ni `job-failed` (un crash,
falta de memoria, un kill del sistema, un binario roto que sale apenas arranca), ningún consumidor se enteraba:
`runPipelineJob` es una promesa que solo se cierra con esos dos eventos, y los stores que usan `startPipelineJob`
(Crear, el editor, la puerta de la demo) quedaban «generando» o «descargando». La puerta de la demo tuvo que sumar
un vigilante de 5 minutos (`DEMO_PREPARE_SILENCE_LIMIT_MS`) por esto.

Dos caminos más terminaban igual:

- **El kill de respaldo de la cancelación.** Si stdin ya no acepta el aviso, `cancel_pipeline_job` saca el job y
  mata el proceso, que muere por la señal sin emitir `job-failed` `cancelled`. Crear lo tapaba con su red de 8 s
  (`CANCEL_SETTLE_TIMEOUT_MS`); los otros módulos, no.
- **El stream sin `Terminated`.** Si el plugin no puede esperar al proceso, manda `CommandEvent::Error` en lugar de
  `Terminated` y el stream se corta. El loop salía sin limpiar nada: además del canal mudo, el job quedaba en
  `RunningJobs` (un `run-video-pipeline` dejaba el proyecto en `project_busy` hasta reiniciar la app) y el log de
  diagnóstico no se guardaba.

El log de diagnóstico sí veía el crash: lo registra como `crashed`, con `process_crashed`.

## Corrección

- **`src-tauri/src/pipeline/commands.rs`.**
  - El loop anota `terminal_forwarded` cuando reenvía un `job-completed` o `job-failed` del sidecar, y guarda el
    `TerminatedPayload` al recibir `Terminated` en vez de cerrar dentro del `match`.
  - Al salir del loop (por `Terminated` o porque el stream se cortó), primero manda por el canal el evento terminal
    que falte y después limpia como antes: saca el job de `RunningJobs` y guarda el log (sin `Terminated`, sin
    código de salida ni señal).
  - `closing_event(job_id, terminal_forwarded, cancel_requested, exit)`, función pura: `None` si el sidecar ya
    emitió su evento terminal; si no, `{ "type": "job-failed", "code", "message", "jobId" }`, la forma de un
    `job-failed` del sidecar, con `code` `cancelled` si se pidió cancelar o `sidecar_exited` si no, y en `message`
    cómo terminó el proceso: `sidecar exited without a terminal event (exit code 1)`, `(signal 9)` o
    `(no exit status)`.
  - `cancel_pipeline_job` marca `cancel_requested` antes de escribir el aviso por stdin.
  - El brazo `CommandEvent::Error` va al log de la app; antes se descartaba.
- **`src-tauri/src/pipeline/jobs.rs`.** `RunningJob` suma `cancel_requested: Arc<AtomicBool>`, que comparte con el
  loop de su job: sigue a mano aunque la entrada ya no esté en el mapa.
- **`src-tauri/src/pipeline/tests/commands.rs`.** Seis tests nuevos de `closing_event`.
- **Contrato.** `pipeline/runner/events.ts`: el comentario de `JobFailedEvent.code` nombra `sidecar_exited` y el
  cierre de Rust (los códigos de `job-failed` no son una unión tipada: se declaran ahí y en los mapas de cada
  módulo). `src/modules/common/fetcher/pipeline.ts`: la doc de `runPipelineJob` dice que la promesa siempre se
  cierra.
- **Interfaz.** `src/modules/videos/constants.ts`: `sidecar_exited` en `CREATE_ERROR_MESSAGE_KEYS` (y, por herencia,
  en `LIBRARY_ERROR_MESSAGE_KEYS`) y en `DEMO_ERROR_MESSAGE_KEYS`; por qué no está en `RETRYABLE_ERROR_CODES`; el
  comentario del vigilante de la demo. `public/locales/{es,en,pt}.json`: `create.errors.sidecarExited` y
  `createDemo.errors.sidecarExited`. `src/modules/videos/utilities/demoPrepareStore.ts`: el comentario del job mudo,
  que ahora es un proceso colgado.
- **Guard.** `scripts/test/check-demo-gate.mjs`: un test nuevo y el aviso de `sidecar_exited` en el test de los
  avisos; los comentarios del job mudo. `scripts/test/README.md`: su fila (41 tests).
- **Docs.** Enmienda 2026-10-15 de la ADR-0010; en la ADR-0061, el vigilante, el pendiente resuelto, el modo de
  falla «el sidecar muere a mitad» y el conteo del guard; `docs/ARCHITECTURE.md` §4 («Anatomía de un job») y §5
  («Contrato con el sidecar»); `docs/diagrams/FRONTEND.md` (la secuencia de un job y la tabla de eventos).

### Decisiones

- **`cancelled` contra `sidecar_exited`: una marca explícita.** `cancel_pipeline_job` marca `cancel_requested` y el
  loop la lee al cerrar. Cubre el kill de respaldo y también un proceso que muere mientras aborta después de un
  aviso por stdin: la persona pidió parar y el job paró, así que ningún módulo muestra un error tras cancelar. Se
  descartó deducirlo de «la entrada ya no estaba en `RunningJobs`»: `kill_if_lingering` también la saca, un camino
  futuro que la sacara contaría como cancelación sin que nadie lo decidiera, y obligaba a limpiar antes de mandar
  el evento.
- **Primero el evento, después la limpieza.** Igual que el evento terminal del sidecar, que llega antes de que su
  proceso salga. Si la limpieza fallara (un mutex envenenado), la interfaz ya se enteró. La ventana entre el evento
  y la salida de `RunningJobs` es de microsegundos, nunca más larga que la del camino normal, y solo importa para
  relanzar `run-video-pipeline` del mismo proyecto, que ningún flujo hace en el acto.
- **No es reintentable.** `sidecar_exited` no entra en `RETRYABLE_ERROR_CODES`: un crash por falta de memoria o un
  binario roto suele repetirse (los tres reintentos automáticos serían tres crashes en cinco minutos) y un
  relanzamiento automático podría volver a pagar lo que el proveedor tenía en curso. La persona reanuda con
  «Reintentar desde el último paso»; las fases hechas no se repiten.
- **En la puerta de la demo, un fallo que queda.** No se olvida al salir, como los de la red, ni pasa a la espera,
  como `demo_busy`: «Reintentar» sigue desde la primera parte sin marca. El vigilante de 5 minutos se conserva para
  un proceso colgado.
- **El log de diagnóstico no cambia.** No recibe el evento sintético: la ejecución sigue siendo `crashed`, con
  `process_crashed`, el código de salida y la señal, la clasificación de soporte de la ADR-0038.

## Límites deliberados

- **Un proceso colgado** (vivo, sin eventos y sin salir) sigue sin detectarse en Rust: no hay un tope de
  inactividad por job. Para eso queda el vigilante de la puerta de la demo; Crear y el editor tienen sus propias
  vigilancias (el render atascado, el modelo de prompts).
- **Sin texto propio en voces, música, personajes y avatares.** `sidecar_exited` cae en el error genérico de cada
  uno («Algo salió mal…»); sus mapas traducen sus propios códigos y los del arranque del sidecar.
- **El log de diagnóstico no registra el cierre de Rust** ni si se había pedido cancelar: un kill de respaldo de la
  cancelación sigue figurando como `crashed`, como antes.
- **Sin `Terminated` no se mata al proceso.** Se suelta su entrada, que le cierra stdin, y el sidecar aborta solo
  (la misma cancelación cooperativa que al cerrar la app): matar a mitad de un encargo de voz deja el recibo sin
  `taskId` (ver el informe del 2026-10-12).
- **Rust sigue sin filtrar lo que emite el sidecar.** Si el sidecar emitiera dos eventos terminales, llegarían los
  dos; los consumidores ya ignoran lo que llega después del primero.

## Validación reproducible

1. `pnpm build` (`tauri::generate_context!` necesita `dist/`) y después
   `PATH="$HOME/.cargo/bin:$PATH" pnpm test:tauri`: 94 tests, entre ellos los seis nuevos de `closing_event` (la
   forma del evento, `sidecar_exited` contra `cancelled`, el código de salida o la señal en el mensaje, el stream
   sin `Terminated` y que nunca hay un segundo evento terminal). Cada regla se vio fallar con un mutante: sin la
   guarda de `terminal_forwarded` falla `a_job_never_gets_a_second_terminal_event`; ignorando la marca de
   cancelación, `a_requested_cancellation_closes_the_job_as_cancelled`; sin `jobId`, los dos tests que comparan el
   evento entero; con otro `type`, además `the_closing_event_is_terminal_for_the_event_loop`; con la señal
   informada como código de salida, `the_closing_message_says_how_the_process_ended`; y sin cierre cuando falta
   `Terminated`, `an_event_stream_that_ends_without_terminated_still_closes_the_job`.
2. `node --test scripts/test/check-demo-gate.mjs`: 41 tests. El nuevo («un proceso que muere llega como
   sidecar_exited…») falla si `sidecar_exited` se trata como un fallo de la red (se olvida al salir) o como una
   espera (`demo_busy`); el de los avisos falla sin la clave en `DEMO_ERROR_MESSAGE_KEYS`.
3. `pnpm check:locales`, `pnpm format`, `pnpm lint` y `pnpm build`, en verde.
4. Con la app: los pasos de «Pruebas manuales», que matan el proceso `vimo-pipeline` a mano.

## Pruebas manuales realizadas

- **Ninguna con la app.** En esta sesión no se corrió `tauri dev` ni la app compilada: el loop de eventos (el orden
  entre el evento y la limpieza, el canal y `RunningJobs`) se revisó leyendo el código y el del plugin
  (`tauri-plugin-shell` 2.3.5 manda `Terminated` recién cuando stdout y stderr llegaron a su fin, así que ninguna
  línea del sidecar llega después), pero no se ejerció de punta a punta; los tests cubren la función pura.
- **Pendiente, con la app compilada:**
  1. Crear un video y, en plena fase de imágenes, matar el proceso (`pkill -9 -f vimo-pipeline`, o desde el
     Monitor de actividad): el progreso pasa enseguida al error «El motor de Vimo se cerró de forma inesperada…»,
     sin cuenta regresiva de reintento, y «Reintentar desde el último paso» sigue desde la última fase hecha.
  2. Lo mismo en la puerta de la demo mientras baja una parte: aparece el aviso de la demo («El motor de Vimo se
     cerró mientras se preparaba la demo…») con «Reintentar», que sigue desde la parte que faltaba; salir y volver
     a entrar sigue mostrando el aviso.
  3. Cancelar una generación normal: igual que antes (cancelación cooperativa, sin error a la vista).
  4. En el log de diagnóstico de la ejecución del paso 1: `crashed`, `process_crashed` y la señal 9.
