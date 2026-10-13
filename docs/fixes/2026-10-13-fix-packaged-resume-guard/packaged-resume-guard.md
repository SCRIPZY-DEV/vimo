# Fix: el guard del reanudado empaquetado mantiene stdin abierto hasta que el job termina

- 📅 **Fecha:** 2026-10-13
- 🌿 **Rama:** `feat/edicion-avatar-ia`
- **Área:** el guard `scripts/test/check-packaged-resume.mjs` (el sidecar real, empaquetado con Node
  SEA, con fixtures locales y sin claves de proveedor). No toca código de producto.
- **Relacionado:** el PR #98 de `dev` (`06ae4063`, [informe](../2026-10-12-fix-lingering-sidecar/lingering-sidecar.md)),
  que entró a esta rama con el merge `08f609d5`; el hallazgo I-1 de
  `docs/handoff/2026-10-09-avatar-heygen/execution-e2h/final-review.md` (interno); y, de la misma familia (un guard
  sobre el binario empaquetado que se queda atrás del sidecar), el
  [fix del guard del editor empaquetado](../2026-10-11-fix-packaged-editor-guard/packaged-editor-guard.md).

## Causa

`node --test scripts/test/check-packaged-resume.mjs` moría en la aserción de `voice_request_unresolved`
con este arreglo de eventos:

```json
[
  { "type": "job-started", "jobId": "smoke" },
  {
    "type": "job-failed",
    "code": "cancelled",
    "message": "job cancelled",
    "jobId": "smoke"
  }
]
```

El guard lanzaba el binario con `spawnSync(binary, [command], { input })`: Node escribe la línea del job
y **cierra stdin en el acto**. Desde el PR #98 de `dev`, `readJob` (`pipeline/main.ts`) toma un stdin
cerrado con el job en marcha como «la app se cerró o se cayó» y aborta el job con la misma cancelación
cooperativa (Rust no mata al sidecar al salir de la app, y sin esto quedaría un proceso huérfano
escribiendo en el proyecto). `run-video-pipeline` llegaba a `runStages` con la señal ya cancelada y salía
`job-failed cancelled`, no `voice_request_unresolved`. El `ping` del mismo guard pasaba porque su handler
resuelve antes de que el `close` de la línea de entrada llegue.

Por qué no se vio antes: el merge de `dev` (`08f609d5`) se verificó con la suite entera contra el binario
`src-tauri/binaries/vimo-pipeline-aarch64-apple-darwin` que había entonces, anterior al PR #98. El binario
se recompiló el 2026-10-13 a las 18:18 (para la app `0.10.1-editor.15`) y desde ahí el guard falla, solo
y dentro de la suite completa. El guard es idéntico en `dev` (que no lo adaptó en el PR #98): con un
binario recién compilado, `dev` tiene el mismo rojo. Es heredado, no lo causó la entrega 2h.

**No era un binario viejo.** Se comprobó construyendo un SEA nuevo con el `pipeline/` de hoy en una
carpeta aparte (sin tocar `src-tauri/binaries/`) y corriendo contra él el guard sin arreglar: falla igual,
con el mismo mensaje.

## Corrección

En `scripts/test/check-packaged-resume.mjs`, `run()` pasa a ser `async` y lanza el sidecar con `spawn`
(stdio por pipes), igual que `check-packaged-catalog.mjs` y `check-packaged-editor.mjs`:

- Escribe la línea del job y **deja stdin abierto** mientras el job corre. El sidecar emite su evento
  terminal (`job-completed` / `job-failed`), vacía stdout y stderr y sale solo (`process.exit`); recién
  entonces el `finally` destruye stdin.
- Junta stdout y stderr, espera al `close` del proceso y devuelve los eventos como antes.
- Conserva el plazo de 10 s del `spawnSync` anterior (`timeout: 10000`): un sidecar colgado se mata y el
  guard falla con ese mensaje y el stderr, no pasa con una salida a medias. Un error al lanzar el binario
  (`ENOENT`, permisos) hace fallar el guard, como antes el `assert.ifError(execution.error)`.
- Los tres llamadores esperan con `await`.

Las aserciones del guard no cambian: el `ping` completa con `fixture: true`; el recibo de voz sin resolver
frena con `voice_request_unresolved` (y `metadata.errorCode` lo repite); con la narración en caché el job
se completa y la fase `voice` avisa `stage-skipped`.

## Límites deliberados

- **No se toca el sidecar.** El comportamiento del PR #98 (stdin cerrado con el job en marcha cancela) es el
  deseado; el guard era quien lo violaba sin querer.
- **Ningún otro guard tiene el patrón.** Se buscó en `scripts/` `spawnSync`, `execFileSync`, `input:` y
  `stdin.end`: los otros dos guards empaquetados ya usaban `spawn` con stdin abierto hasta el `close`, y
  los guards que lanzan `node pipeline/main.ts` escriben la línea del job y no cierran stdin mientras el
  job corre.
- **Este guard no prueba el cierre de stdin.** Que cerrar stdin cancele el job es del PR #98; acá solo se
  evita cerrarlo sin querer.
- **El mismo cambio sirve para `dev`.** El archivo es idéntico allá: si `dev` lo arregla primero, este
  commit puede descartarse en el próximo merge.

## Validación reproducible

1. Con el binario del repo (se arma con `pnpm build:sidecar`, con un Node oficial):

   ```sh
   export PATH="$HOME/node-v22.23.2-darwin-arm64/bin:$PATH"
   node --test scripts/test/check-packaged-resume.mjs
   ```

   Esperado: salida 0 y `SEA: ping, unresolved receipt and cached narration passed (3/3).` Con el guard
   anterior, salida 1 con el arreglo de eventos de arriba (el binario tiene que ser posterior al PR #98).

2. Contra un SEA recién construido con el `pipeline/` de hoy, sin tocar `src-tauri/binaries/` (el script
   de build resuelve sus carpetas relativas a su propia ubicación):

   ```sh
   work=$(mktemp -d) && mkdir -p "$work/scripts/test"
   cp scripts/build-sidecar.mjs scripts/target-triple.mjs "$work/scripts/"
   ln -s "$PWD/pipeline" "$work/pipeline" && ln -s "$PWD/node_modules" "$work/node_modules"
   (cd "$work" && node scripts/build-sidecar.mjs)
   bin="$work/src-tauri/binaries/vimo-pipeline-aarch64-apple-darwin"
   node scripts/test/check-packaged-resume.mjs "$bin"   # el guard nuevo: pasa
   git show <este commit>^:scripts/test/check-packaged-resume.mjs > "$work/scripts/test/old.mjs"
   node "$work/scripts/test/old.mjs" "$bin"             # el guard anterior: muere con `cancelled`
   ```

   (En otra plataforma, el nombre del binario lleva su triple de destino.)

3. Los tres guards empaquetados juntos:

   ```sh
   node --test scripts/test/check-packaged-catalog.mjs scripts/test/check-packaged-editor.mjs scripts/test/check-packaged-resume.mjs
   ```

4. `pnpm exec prettier --check scripts/test/check-packaged-resume.mjs docs/fixes/2026-10-13-fix-packaged-resume-guard`
   y `pnpm lint`.

Verificado el 2026-10-13: el guard anterior sale con 1 (`job-failed cancelled`) contra el binario del
repo (18:18) y contra el SEA nuevo; el guard nuevo sale con 0 contra los dos, y los tres guards
empaquetados pasan juntos (3/3). Además, con un binario falso que nunca sale, el guard nuevo falla a los
10 s con `the sidecar did not finish within 10 s`, y con una ruta que no existe falla con `ENOENT`.

## Pruebas manuales

No aplica a la app: es un guard automático sobre el sidecar y no cambia nada de lo que ve la persona.
