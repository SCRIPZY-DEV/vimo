# ADR-0026 — Distribución en Windows: instalador NSIS construido en GitHub Actions

- **Estado:** Aceptada
- **Fecha:** 2026-09-09
- **Área:** distribución
- **Completa a:** [ADR-0013](ADR-0013-modulo-create-runner-de-stages-y-binarios.md)

## Problema

ADR-0013 dejó ffmpeg y yt-dlp empaquetados **solo para `aarch64-apple-darwin`** y
difirió el resto de plataformas a «la fase de distribución». El pipeline ya era
portable —`spawn` sin shell, rutas escapadas para FFmpeg en Windows, `keyring` con
`windows-native`, `windows_subsystem = "windows"`— pero un `pnpm tauri build` en
Windows no llegaba ni a compilar, y de haber llegado, no habría funcionado:

- `scripts/fetch-binaries.mjs` no tenía pins para `x86_64-pc-windows-msvc`: el hook
  `beforeBuildCommand` abortaba con «Sin pins de binarios».
- `src-tauri/src/pipeline/binaries.rs` buscaba `ffmpeg` y `yt-dlp` sin extensión.
  Tauri copia los `externalBin` como `ffmpeg.exe`: `binaryPaths` quedaba vacío y
  todo render terminaba en `ffmpeg_missing`.
- En Windows (y Linux) un deep link `vimo://auth/callback?code=…` lanza **un
  ejecutable nuevo** con la URL en `argv`. Sin `tauri-plugin-single-instance`, la
  instancia viva —la única suscrita con `onOpenUrl`— nunca recibía el `code`: el
  retorno de OAuth (ADR-0006) abría una segunda ventana y no logueaba.

Restricciones que achicaron el campo:

- No hay máquina Windows a mano ni certificado de firma de código.
- Tauri no cross-compila a Windows desde macOS (necesita MSVC + Windows SDK).
- El pipeline nunca depende del PATH (ADR-0013): los binarios viajan pineados.
- La licencia GPL del ffmpeg estático ya quedó aceptada en ADR-0013.

## Decisión

**Vimo se distribuye en Windows como instalador NSIS por usuario, construido en
GitHub Actions `windows-latest`, con los mismos pins de ffmpeg-static y yt-dlp que
macOS y `tauri-plugin-single-instance` para que el retorno OAuth llegue a la
instancia abierta.**

| Componente                                           | Estado  | Ubicación                                      | Para qué                                                                                                                                                 |
| ---------------------------------------------------- | ------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `targetTriple()` + `executableSuffix()`              | nuevo   | `scripts/target-triple.mjs`                    | Helper único para los tres scripts; sufija `.exe` cuando el triple es Windows                                                                            |
| Pins `x86_64-pc-windows-msvc`                        | nuevo   | `scripts/fetch-binaries.mjs`                   | `ffmpeg-win32-x64` (ffmpeg-static b6.1.1) y `yt-dlp.exe` (2026.08.19), SHA-256 pineados                                                                  |
| Sidecar SEA en Windows                               | reusado | `scripts/build-sidecar.mjs`                    | Copia `node.exe`; la firma de OpenJS queda inválida a propósito (ver Consecuencias)                                                                      |
| `EXE_SUFFIX` al resolver externalBin                 | cambio  | `src-tauri/src/pipeline/binaries.rs`           | `ffmpeg.exe` / `yt-dlp.exe` en Windows, sin extensión en el resto                                                                                        |
| `tauri-plugin-single-instance` (feature `deep-link`) | nuevo   | `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs` | Primer plugin registrado; reenvía la URL de `argv` al plugin deep-link de la instancia viva                                                              |
| `tauri.windows.conf.json`                            | nuevo   | `src-tauri/tauri.windows.conf.json`            | `targets: ["nsis"]`, `installMode: currentUser`, WebView2 por `downloadBootstrapper`                                                                     |
| Workflow                                             | nuevo   | `.github/workflows/build-desktop.yml`          | Un job por plataforma (`windows-latest`, `macos-latest`) sobre el reutilizable `build-installer.yml` con `tauri-action`; `.exe` y `.dmg` como artefactos |

La configuración de Windows vive en un archivo de plataforma (Tauri lo mezcla solo
cuando compila para Windows): el `tauri.conf.json` principal conserva `targets: "all"`
y el build de macOS no cambia. El plugin de instancia única no se expone al webview,
así que `capabilities/default.json` no se toca; el frontend
(`src/modules/auth/api/index.ts`, `subscribeToAuthCallback`) tampoco.

## Alternativas consideradas

- **MSI (WiX) además de NSIS** — descartada: Tauri descarga el toolset de WiX y
  duplica el bundling; MSI no aporta nada para una app por usuario sin políticas de
  dominio. `targets` en Windows es solo `nsis`.
- **`embedBootstrapper` / `offlineInstaller` de WebView2** — descartadas: Windows 10 y
  11 ya traen el runtime Evergreen; el bootstrapper se descarga solo si falta. El
  offline sumaría ~150 MB al instalador.
- **BtbN/FFmpeg-Builds** para ffmpeg de Windows — descartada por ahora: publica un
  zip, obligaría a descomprimir en el script. ffmpeg-static entrega el binario
  suelto y es la misma release que en macOS. Vuelve a considerarse si se migra a
  LGPL, donde BtbN sí ofrece builds.
- **Cross-compilar desde macOS con cargo-xwin** — descartada: experimental, y el
  bundler NSIS de Tauri no corre en macOS.
- **Quitar la firma de `node.exe` con `signtool remove`** — descartada: Windows
  ejecuta un binario con firma inválida igual que uno sin firma, NSIS no exige firma
  y `signtool` metería una dependencia del Windows SDK en el script.
- **`installMode: perMachine`** — descartada: pide UAC y la app guarda todo en el
  perfil del usuario (Documentos, Credential Manager).
- **Reenviar el deep link a mano en el callback de single-instance** (parsear
  `argv` y emitir el evento) — descartada: la feature `deep-link` del plugin hace
  exactamente eso y mantiene el contrato de `onOpenUrl`.

## Consecuencias

- ✅ Instalador sin permisos de administrador, generado por un workflow reproducible
  con los mismos scripts que el build de macOS.
- ✅ El login OAuth funciona en Windows con la app abierta; en macOS, abrir la app dos
  veces ahora enfoca la instancia existente en vez de duplicarla.
- ⚠️ Sin firma Authenticode: SmartScreen muestra «editor desconocido» al instalar. Era
  la misma deuda que la firma ad-hoc de macOS; esa parte quedó saldada en 2026-09 (el
  DMG de CI se firma con Developer ID y se notariza, `docs/CONTRIBUTING.es.md`) y la
  deuda vigente es solo la de Windows.
- ⚠️ La firma de `vimo-pipeline.exe` queda inválida tras inyectar el blob SEA.
- ⚠️ El instalador pesa ~150 MB: el runtime de Node del sidecar viaja dentro.
- ⚠️ ffmpeg sigue siendo el build GPL de ffmpeg-static (ADR-0013).
- 🔒 Los nombres de `externalBin` se resuelven **siempre** con `EXE_SUFFIX`; nunca
  con nombres literales sin extensión.
- 🔒 `tauri-plugin-single-instance` se registra **antes** que cualquier otro plugin.
- 🔒 Los pins se agregan por target triple con URL y SHA-256 fijos; nunca «latest».
- 🔒 La configuración específica de Windows va en `tauri.windows.conf.json`, no en
  el `tauri.conf.json` compartido.

## Verificación de cumplimiento

- **Tests:** no hay framework de tests en el repo.
- **Guards:** `scripts/fetch-binaries.mjs` aborta si el triple no tiene pins o si el
  SHA-256 no coincide; `cargo check` en macOS cubre el código de single-instance
  (`cfg(desktop)`). El workflow falla si no aparece ningún `.exe` en
  `src-tauri/target/release/bundle/nsis/`.
- **Checklist manual** con el artefacto del workflow instalado en Windows:
  1. El setup no pide UAC; instala en `%LOCALAPPDATA%\Vimo\` con `Vimo.exe`,
     `ffmpeg.exe`, `yt-dlp.exe` y `vimo-pipeline.exe`.
  2. Con la app abierta, `Start-Process "vimo://auth/callback?code=test"` enfoca la
     ventana existente sin abrir otra; con la app cerrada, la abre.
  3. Una clave API guardada aparece en Administrador de credenciales bajo
     `click.vimo.portable` y sobrevive a reabrir la app.
  4. Un video corto pasa el render sin `ffmpeg_missing`; música desde YouTube se
     descarga sin `ytdlp_*`.
  5. Cancelar un job elimina `vimo-pipeline.exe` y sus `ffmpeg.exe` del
     Administrador de tareas.
- **Cómo se vería una regresión:** `ffmpeg_missing` en Windows con el binario
  presente (alguien volvió a nombres sin extensión); una segunda ventana de Vimo al
  volver del navegador (single-instance dejó de ser el primer plugin o se quitó la
  feature `deep-link`); el workflow abortando en `fetch:binaries` (pin borrado).

## Fuera de alcance

- Firma Authenticode (`bundle.windows.certificateThumbprint` / `signCommand`).
- Windows ARM64, Linux, MSI y el updater de Tauri.
- Migración de ffmpeg a LGPL.

## Referencias

- [ADR-0006](ADR-0006-autenticacion-doble-flujo-oauth-y-gate-por-loaders.md) — retorno OAuth por deep link.
- [ADR-0013](ADR-0013-modulo-create-runner-de-stages-y-binarios.md) — binarios pineados y política de licencia.
- Tauri: <https://v2.tauri.app/plugin/single-instance/>, <https://v2.tauri.app/distribute/windows-installer/>.
