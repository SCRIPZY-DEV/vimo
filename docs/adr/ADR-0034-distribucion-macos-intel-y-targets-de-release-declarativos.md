# ADR-0034 — Distribución en macOS Intel y targets de release declarativos

- **Estado:** Aceptada
- **Fecha:** 2026-09-14
- **Área:** distribución
- **Completa a:** [ADR-0026](ADR-0026-distribucion-windows-instalador-nsis.md), [ADR-0027](ADR-0027-actualizaciones-automaticas-tauri-updater.md)

## Problema

`build-desktop.yml` generaba instaladores para Windows x64 y macOS Apple Silicon. Las
Mac Intel no tenían instalador ni entrada en `latest.json`, así que tampoco podían
actualizarse.

Agregar una plataforma obligaba a repetir la misma información en tres lugares, sin
nada que los mantuviera sincronizados:

- un job copiado a mano en `build-desktop.yml`;
- `PLATFORM_ARTIFACTS` y `EXTRA_ARTIFACTS` en `scripts/build-update-manifest.mjs`;
- `BINARY_PINS` en `scripts/fetch-binaries.mjs`.

Además, el manifiesto buscaba los archivos **por nombre** en todos los artefactos
juntos. Los dos builds de macOS producen un `Vimo.app.tar.gz` con el mismo nombre, así
que `publish` abortaría con «hay más de un artefacto».

Restricciones que achicaron el campo:

- El sidecar SEA es una copia del Node que corre `build-sidecar.mjs`. En un runner
  Apple Silicon ese Node es arm64, así que agregar `--target x86_64-apple-darwin` no
  alcanza por sí solo.
- GitHub ofrece `macos-15-intel` como **última imagen Intel**, disponible hasta agosto
  de 2027.
- Node 22 exige macOS 11.0 en x64 y en arm64. `tauri.macos.conf.json` declaraba 10.15.
- En repos privados cada job de macOS cuenta x10 minutos. Los artefactos comparten un
  cupo de 500 MB.

## Decisión

**Las Mac Intel reciben su propio DMG, compilado de forma nativa en el runner
`macos-15-intel`. Todos los targets de release se declaran en un único archivo,
`scripts/release-targets.mjs`, que alimenta la matriz del workflow y el manifiesto del
updater.**

| Componente                        | Estado | Ubicación                                        | Para qué                                                                                                                                 |
| --------------------------------- | ------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `RELEASE_TARGETS`                 | nuevo  | `scripts/release-targets.mjs`                    | Una entrada por instalador: runner, triple, bundles, artefacto, globs de salida, plataforma del updater y nombres publicados             |
| CLI `matrix --select`             | nuevo  | `scripts/release-targets.mjs`                    | Imprime `matrix=<json>` para `$GITHUB_OUTPUT` filtrando por `all`, familia o id; una selección desconocida falla con la lista de válidas |
| Job `plan` + matriz `build`       | cambio | `.github/workflows/build-desktop.yml`            | Reemplaza los jobs `windows` y `macos`; filtra antes de armar la matriz porque `matrix` no existe en el `if` de job                      |
| `--target` explícito              | cambio | `.github/workflows/build-installer.yml`          | Tauri exporta `TAURI_ENV_TARGET_TRIPLE` y deja el bundle en `target/<triple>/release/bundle`, igual para todos los targets               |
| Pins `x86_64-apple-darwin`        | nuevo  | `scripts/fetch-binaries.mjs`                     | `ffmpeg-darwin-x64` (ffmpeg-static b6.1.1) y `yt-dlp_macos`, universal y compartido con arm64 en `MACOS_YT_DLP_PIN`                      |
| `isHostTriple()` + guard          | nuevo  | `scripts/target-triple.mjs`, `build-sidecar.mjs` | Aborta si el triple no es el del host: el sidecar copiaría un Node de otra arquitectura                                                  |
| Búsqueda por carpeta de artefacto | cambio | `scripts/build-update-manifest.mjs`              | Cada target se busca solo en `artifacts/<artefacto>/`; publica `darwin-x86_64`, `Vimo_<v>_x64.app.tar.gz` y `Vimo_<v>_x64.dmg`           |
| `minimumSystemVersion` 11.0       | cambio | `src-tauri/tauri.macos.conf.json`                | El mínimo que exige el runtime de Node 22 del sidecar                                                                                    |

El código de Rust no cambia: `src-tauri/src/pipeline/binaries.rs` no depende de la
arquitectura.

Los nombres de artefacto y los nombres publicados de Windows y Apple Silicon quedan
iguales, así que las apps ya instaladas siguen leyendo las mismas entradas de
`latest.json`.

## Alternativas consideradas

- **Cross-compilar x86_64 en el runner Apple Silicon.** Descartada por ahora, pero es
  el camino de migración. El sidecar necesitaría el runtime oficial de Node x64 en la
  **misma versión** que genera el blob, un requisito de SEA; `useCodeCache` y
  `useSnapshot` ya están en `false`. Hoy es más código (descarga, verificación contra
  `SHASUMS256.txt`, extracción) para resolver un problema que el runner nativo evita
  hasta 2027.
- **Binario universal (`universal-apple-darwin`).** Descartada: obliga a unir con
  `lipo` ffmpeg y el sidecar de Node, y duplica el peso del instalador y de cada
  actualización para todos los usuarios de Mac, incluidos los de Apple Silicon.
- **Un job más copiado en `build-desktop.yml`.** Descartada: el cuarto target
  repetiría otra vez los mismos datos en tres archivos. El manifiesto seguiría
  encontrando dos `Vimo.app.tar.gz`.
- **Declarar los targets en un JSON dentro de `.github/`.** Descartada: el manifiesto
  necesita funciones (`find`, `publishedName`), y un módulo `.mjs` sirve a la vez para
  el workflow y para los scripts.

## Consecuencias

- ✅ Las Mac Intel tienen DMG firmado y notarizado, y reciben actualizaciones por
  `darwin-x86_64`.
- ✅ Agregar un target (Linux, Windows ARM64, …) es agregar una entrada en
  `RELEASE_TARGETS`, sus pins y, si hace falta, una opción del input `platform`. El
  workflow y el manifiesto no cambian.
- ✅ Un runner con la arquitectura equivocada falla en `build:sidecar` en vez de
  producir un instalador que abre pero no renderiza.
- ⚠️ **Deuda con fecha:** `macos-15-intel` se retira en **agosto de 2027**. Antes de esa
  fecha hay que:
  - cambiar el `runner` de `macos-x64` a `macos-latest`;
  - reemplazar el guard por un `resolveNodeRuntime(triple)` que descargue
    `node-${process.version}-darwin-x64.tar.gz` y lo verifique contra
    `SHASUMS256.txt`.
- ⚠️ Un tag consume **dos** jobs de macOS, a x10 minutos cada uno.
- ⚠️ Una corrida completa deja ~400 MB de artefactos contra el cupo de 500 MB. Dos
  corridas completas dentro de los 3 días de retención pueden agotarlo.
- ⚠️ Las Mac con macOS 10.15 ya no pueden instalar Vimo. Antes podían instalarla, pero
  el sidecar no arrancaba.
- 🔒 Un target nuevo se agrega en `scripts/release-targets.mjs`, **nunca** como job
  suelto en el workflow.
- 🔒 Cada target se compila en un runner de su misma arquitectura mientras el sidecar
  copie el Node del host.
- 🔒 Las opciones del input `platform` coinciden con `validSelections()`.
- 🔒 El manifiesto busca cada archivo dentro de la carpeta de su artefacto, nunca en
  todos los artefactos juntos.

## Verificación de cumplimiento

- **Tests:** no hay framework de tests en el repo.
- **Guards:**
  - `release-targets.mjs` falla ante una selección desconocida.
  - `build-sidecar.mjs` aborta si el triple no es el del host.
  - `fetch-binaries.mjs` aborta si falta el pin del triple, listando los que existen.
  - `build-update-manifest.mjs` aborta si falta la carpeta de un artefacto, el archivo
    del updater o su `.sig`.
- **Checklist manual:**
  1. `node scripts/release-targets.mjs matrix --select macos` devuelve
     `Vimo-macos-arm64` y `Vimo-macos-x64`; `--select linux` falla.
  2. `TAURI_ENV_TARGET_TRIPLE=x86_64-apple-darwin pnpm build:sidecar` aborta en una Mac
     Apple Silicon.
  3. _Run workflow_ con `platform=macos-x64` deja `Vimo-macos-x64`. Sobre ese DMG:
     - `file Vimo.app/Contents/MacOS/*` muestra `x86_64` en `Vimo`, `vimo-pipeline` y
       `ffmpeg`, y `yt-dlp` universal;
     - `spctl -a -vv -t install` acepta el DMG y `xcrun stapler validate` confirma el
       ticket.
  4. La app x64 abre en Apple Silicon bajo Rosetta, renderiza un video corto y baja
     música de YouTube.
  5. Con un tag, `latest.json` trae `windows-x86_64`, `darwin-aarch64` y
     `darwin-x86_64`.
- **Cómo se vería una regresión:**
  - `publish` abortando con «hay más de un artefacto»: alguien volvió a buscar en todos
    los artefactos juntos.
  - Una Mac Intel que instala pero no renderiza: el guard del sidecar se quitó o el
    runner dejó de coincidir con el triple.
  - Las Mac Intel sin avisos de actualización: se borró la entrada `darwin-x86_64`.

## Fuera de alcance

- Linux y Windows ARM64. Quedan preparados: son una entrada más en `RELEASE_TARGETS`.
- La migración a cross-compilación, descrita arriba con su fecha límite.
- El enlace de descarga del DMG x64 en la landing (repo aparte).

## Referencias

- [ADR-0026](ADR-0026-distribucion-windows-instalador-nsis.md) — instaladores, pins por target triple y workflow.
- [ADR-0027](ADR-0027-actualizaciones-automaticas-tauri-updater.md) — `latest.json` y el job `publish`.
- [ADR-0013](ADR-0013-modulo-create-runner-de-stages-y-binarios.md) — binarios pineados.
- GitHub: <https://github.blog/changelog/2025-09-19-github-actions-macos-13-runner-image-is-closing-down/> (`macos-15-intel` hasta agosto de 2027).
- Node.js SEA: <https://nodejs.org/api/single-executable-applications.html>.
