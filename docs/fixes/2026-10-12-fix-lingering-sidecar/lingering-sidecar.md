# Fix: «Ya hay una generación en curso» tras un error o una cancelación

## Síntoma

Tras un fallo (por ejemplo, en la fase de imágenes) o una cancelación, «Reintentar
desde el último paso» devuelve `project_busy` («Ya hay una generación en curso.
Esperá a que termine para lanzar otra»), con todas las fases en gris e
«Imágenes (0/0)». El bloqueo dura hasta reiniciar la app o el PC. Un usuario
encontró un rodeo: sacar la carpeta del proyecto de la biblioteca y volver a
ponerla.

## Causa

`start_pipeline_job` rechaza con `ProjectBusy` mientras `RunningJobs` tenga una
entrada con ese `projectId`, y esa entrada solo se borra con
`CommandEvent::Terminated`, es decir, cuando el **proceso** del sidecar termina.
El sidecar emitía `job-failed` o `job-completed` y dejaba que Node saliera solo
cuando se vaciara el event loop. Cualquier trabajo huérfano lo mantenía vivo:

- `dispatchNormal` y el carril de personajes (`stages/images/images.ts`) usan
  `Promise.all` sobre una cola `limitConcurrency`. Si una escena lanza, el job
  falla, pero las escenas encoladas **siguen lanzándose** sin señal de aborto
  durante minutos.
- Cualquier fetch, timer o reintento que no escuche `context.signal`.

Por eso funciona el rodeo de la carpeta: sin la carpeta, cada tarea huérfana
falla al escribir, la cola se vacía rápido, el proceso termina y se libera la
entrada.

Hueco relacionado: Rust no mata al sidecar al cerrar la app (el `RunEvent::Exit`
de `tauri-plugin-shell` solo mata los hijos lanzados desde JS), y el sidecar
ignoraba el cierre de stdin una vez recibido el job. Si se cerraba la app con un
job colgado, el proceso seguía vivo como huérfano y escribía en el proyecto.

Además, el log de diagnóstico (ADR-0038) se sube recién en `Terminated`: estos
jobs colgados no llegaban a Supabase mientras seguían vivos.

## Corrección

- `pipeline/main.ts`: al terminar `main()`, vacía stdout y stderr y llama a
  `process.exit(code)`. El evento terminal ya se emitió y no queda nada que guardar.
- `pipeline/main.ts`: si stdin se cierra con el job en marcha (la app se cerró o
  se cayó), aborta el job con la misma cancelación cooperativa.
- `src-tauri/src/pipeline/commands.rs`: red de seguridad. Si el proceso sigue
  vivo 10 s después de `job-completed` o `job-failed`, se quita de `RunningJobs`
  y se mata.

Lo que **no** se hizo a propósito: matar el proceso en la cancelación o al salir
de la app. El encargo de voz de DubVoice espera su `task_id` aunque se cancele
(`synthesizeDubvoiceTask`). Matarlo a mitad deja el recibo en `submitting` sin
`taskId`, y el siguiente intento cae en `voice_request_unresolved`.

## Archivos

- `pipeline/main.ts`
- `src-tauri/src/pipeline/commands.rs`
- `src-tauri/src/pipeline/tests/commands.rs` (nuevo)

## Verificación

- `pnpm test:tauri`: 53/53.
- `pnpm lint` y `pnpm build` en verde.
- Reproducción por CLI: `node --import <script con setInterval> pipeline/main.ts ping`
  con stdin abierto. Antes, el proceso seguía vivo a los 8 s; ahora sale al instante
  con código 0.

## QA manual pendiente

1. Provocar un fallo de imágenes (por ejemplo, con una clave de imágenes inválida)
   y pulsar «Reintentar desde el último paso» enseguida: no debe aparecer
   `project_busy`.
2. Cancelar en plena fase de imágenes y relanzar: debe arrancar.
3. Cerrar la app en plena generación y comprobar en el Administrador de tareas
   que `vimo-pipeline` desaparece en pocos segundos (en la voz, hasta que llega
   el recibo del encargo).
