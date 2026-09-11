# ADR-0027 — Actualizaciones automáticas con `tauri-plugin-updater` y manifiesto en vimo.click

- **Estado:** Aceptada
- **Fecha:** 2026-09-10
- **Área:** distribución
- **Completa a:** [ADR-0026](ADR-0026-distribucion-windows-instalador-nsis.md)

## Problema

Con ADR-0026 Vimo se instala en Windows y macOS, pero una vez instalada no se entera
de versiones nuevas: hay que volver a la web, bajar el instalador y reinstalar a mano.
Cada release del pipeline exige una versión nueva de la app (ADR-0002), así que sin
un canal de actualización los usuarios se quedan con bugs ya corregidos.

Restricciones que achicaron el campo:

- El repo `SCRIPZY-DEV/vimo` es **privado**: los assets de un GitHub Release no se
  descargan sin token, y la app no debe llevar uno embebido.
- La web pública `vimo.click` es un repo aparte servido por **Cloudflare Pages**
  (estático, redeploy en cada push). Pages limita cada archivo a 25 MB: los
  instaladores (~150 MB) no pueden vivir ahí. Ya hay un bucket de Cloudflare R2.
- El flujo anterior (app vieja) publicaba los ZIP en un repo público de GitHub y un
  feed `vimo-latest.json` en la landing editado a mano; ese feed sigue vivo para esa
  app y no se toca.
- El workflow existente (`build-desktop.yml`) solo dejaba artefactos de Actions con
  3 días de retención; no publicaba nada.
- Había tres versiones distintas (`package.json` 0.0.0, `tauri.conf.json` 0.1.0,
  `brand.ts` 0.1.0): el updater compara contra la de `tauri.conf.json` y la UI mostraba
  otra.
- `pnpm tauri build` local debe seguir funcionando sin la clave privada de firma.
- `tauri-plugin-single-instance` sigue siendo el primer plugin registrado (ADR-0026).

## Decisión

**La app consulta al arrancar `https://vimo.click/releases/latest.json` (servido por
la landing en Cloudflare Pages), y si hay versión nueva ofrece «Actualizar y
reiniciar»; un push de tag `vX.Y.Z` construye, firma con minisign, sube los
instaladores a Cloudflare R2 y deja el manifiesto como artefacto, que se commitea a
mano en el repo de la landing. La versión vive solo en `package.json`.**

| Componente                           | Estado | Ubicación                                                                                                                                               | Para qué                                                                                                                            |
| ------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Versión única                        | cambio | `package.json`, `src-tauri/tauri.conf.json` (`"version": "../package.json"`), `vite.config.ts` (`__APP_VERSION__`), `src/modules/common/brand/brand.ts` | Una sola fuente: Tauri y `Brand.version` la derivan                                                                                 |
| `tauri-plugin-updater` + `-process`  | nuevo  | `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`                                                                                                          | Chequeo, descarga verificada e instalación; `process` relanza la app en macOS. Registrados después de single-instance               |
| `plugins.updater`                    | nuevo  | `src-tauri/tauri.conf.json`                                                                                                                             | Endpoint `latest.json`, clave pública minisign (se commitea), NSIS en modo `passive`                                                |
| `tauri.updater.conf.json`            | nuevo  | `src-tauri/tauri.updater.conf.json`                                                                                                                     | `createUpdaterArtifacts: true` solo cuando el workflow lo pasa con `--config`                                                       |
| Permisos                             | cambio | `src-tauri/capabilities/default.json`                                                                                                                   | `updater:default`, `process:allow-restart`                                                                                          |
| `settingsApi.checkForUpdate` y cía.  | nuevo  | `src/modules/settings/api/index.ts`, `types/updates.ts`                                                                                                 | Única capa que toca los plugins; retiene el handle del update entre chequeo e instalación                                           |
| `AppUpdateProvider` + `useAppUpdate` | nuevo  | `src/modules/settings/components/AppUpdateProvider.tsx`, `context/appUpdateContext.ts`, `hooks/useAppUpdate.ts`                                         | Un chequeo por arranque (TanStack Query, `staleTime` 1 h) y la instalación con progreso, compartidos por contexto                   |
| `UpdatePrompt`                       | nuevo  | `src/modules/settings/components/UpdatePrompt.tsx`, montado en `src/App.tsx`                                                                            | Aviso en cualquier pantalla: notas, «Actualizar y reiniciar», «Más tarde», barra de progreso                                        |
| `UpdatesSection`                     | nuevo  | `src/modules/settings/components/UpdatesSection.tsx`                                                                                                    | Tarjeta de Ajustes: versión instalada, «Buscar actualizaciones», instalar desde ahí                                                 |
| `build-update-manifest.mjs`          | nuevo  | `scripts/build-update-manifest.mjs`                                                                                                                     | Arma `latest.json` con las firmas, renombra los binarios con la versión, aborta si el tag ≠ `package.json` o falta una firma        |
| Job `publish`                        | nuevo  | `.github/workflows/build-desktop.yml`, `build-installer.yml`                                                                                            | Con tag: firma en el build, junta artefactos, genera el manifiesto, sube binarios a R2 (API S3) y deja `latest.json` como artefacto |

### Flujo de datos

1. Al montar `App`, `AppUpdateProvider` lanza `settingsApi.checkForUpdate()` (solo en
   Tauri): GET a `latest.json`, comparación semver contra la versión instalada.
2. Si hay versión nueva, `UpdatePrompt` la muestra. «Más tarde» la oculta durante la
   sesión; «Buscar actualizaciones» en Ajustes vuelve a chequear y la reabre.
3. «Actualizar y reiniciar» → `downloadAndInstallUpdate`: descarga el artefacto de la
   plataforma, verifica la firma minisign contra la `pubkey` embebida e instala. Windows
   lanza el NSIS (`passive`) y cierra la app; macOS reemplaza el `.app` y `relaunch()`.
4. Publicación: `git tag v0.2.0` → `build-desktop.yml` compila ambas plataformas con
   `TAURI_SIGNING_PRIVATE_KEY` y `--config tauri.updater.conf.json` → `publish`
   descarga los artefactos, corre `build-update-manifest.mjs`, sube
   `Vimo_0.2.0_x64-setup.exe`, `Vimo_0.2.0_aarch64.app.tar.gz` y el `.dmg` a
   `<RELEASES_PUBLIC_URL>/v0.2.0/` en R2 y deja `latest.json` como artefacto del run.
5. Quien publica lo pega en `public/releases/latest.json` del repo de la landing y
   pushea; Cloudflare Pages lo sirve en segundos. Es el único paso manual, a
   propósito: publicar es una decisión de una persona, no de un tag.

## Alternativas consideradas

- **GitHub Releases del mismo repo** — descartada: el repo es privado; los assets
  exigen token y hacerlo público no está decidido.
- **GitHub Releases en un repo público aparte** (lo que hacía la app vieja con
  `vimo-releases`) — descartada: funciona, pero deja binarios en un lugar que nadie
  eligió a propósito y sin control de caché ni de dominio. R2 ya está contratado.
- **Binarios dentro del repo de la landing** — descartada: Pages limita cada archivo
  a 25 MB y el repo engordaría 300 MB por versión.
- **Manifiesto también en R2** (todo en el bucket) — descartada: el endpoint de la app
  quedaría atado a la URL pública del bucket; en la landing vive bajo el dominio
  propio y se versiona con git, como el feed anterior.
- **Supabase Storage** — descartada: sumaba un bucket público al proyecto de auth
  (ADR-0006) para algo que R2 ya resuelve.
- **`createUpdaterArtifacts` en `tauri.conf.json`** — descartada: obliga a tener la
  clave privada en cada build local. En un archivo aparte pasado con `--config` solo
  el CI la necesita (mismo criterio que `tauri.windows.conf.json`).
- **Chequeo en Rust en `setup()`** — descartada: el estado (progreso, «más tarde»,
  chequeo manual) vive en la UI; el plugin ya expone `check()` al webview con
  permisos acotados.
- **Descarga e instalación silenciosa** — descartada: una actualización pesa ~150 MB
  (el runtime de Node del sidecar viaja dentro, ADR-0026) y reinicia la app en medio
  de un render; el usuario decide cuándo.
- **`tauri-action` con `releaseName`/`includeUpdaterJson`** — descartada: genera el
  manifiesto solo para GitHub Releases. El script propio escribe las URLs del hosting.

## Consecuencias

- ✅ La app avisa de versiones nuevas y se actualiza en dos clicks, en ambas
  plataformas, desde el mismo lugar donde se descargan los instaladores.
- ✅ Una sola versión que editar antes de publicar; el job falla si el tag no coincide.
- ✅ El build local no cambia: sin clave privada compila igual (sin artefactos de
  updater).
- ⚠️ Cada actualización descarga el instalador completo (~150 MB). Sin delta updates.
- ✅ En macOS el `.app.tar.gz` del updater se arma con la `.app` ya firmada con
  Developer ID (ADR-0023): la identidad es estable entre versiones y el llavero no
  vuelve a preguntar tras actualizar. Un build sin las `APPLE_*` cae a ad-hoc y sí
  vuelve a pedir permiso.
- ⚠️ La subida a R2 depende de `RELEASES_PUBLIC_URL` y los secretos `RELEASES_S3_*`;
  hasta cargarlos, los binarios también se suben a mano.
- ⚠️ El commit del manifiesto en la landing es manual: si se olvida, la versión
  está en R2 pero ninguna app la ve.
- ⚠️ El bucket de R2 necesita acceso público (dominio propio o URL `r2.dev`); esa
  URL es `RELEASES_PUBLIC_URL` y cambiarla rompe los manifiestos ya publicados.
- ⚠️ En Windows SmartScreen sigue avisando: el updater no firma con Authenticode;
  solo verifica la firma minisign de Tauri (la de Apple es independiente).
- 🔒 La clave privada minisign **no se regenera**: una app instalada solo acepta
  artefactos firmados con la clave cuya pública lleva embebida. Perderla obliga a
  redistribuir instaladores a mano.
- 🔒 El tag `vX.Y.Z` debe coincidir con `package.json`; ningún otro archivo declara
  la versión.
- 🔒 `single-instance` sigue siendo el primer plugin; `updater` y `process` van
  después, bajo `#[cfg(desktop)]`.
- 🔒 `createUpdaterArtifacts` vive solo en `tauri.updater.conf.json`.
- 🔒 Nadie fuera de `src/modules/settings/api/` importa `@tauri-apps/plugin-updater`
  ni `plugin-process`.

## Verificación de cumplimiento

- **Tests:** no hay framework de tests en el repo.
- **Guards:** `scripts/build-update-manifest.mjs` aborta si el tag ≠ `package.json`,
  si falta un artefacto o su `.sig`; `build-installer.yml` falla sin
  `TAURI_SIGNING_PRIVATE_KEY`; `pnpm check:locales` cubre las claves `settings.updates*`;
  `cargo check` cubre el registro de plugins.
- **Checklist manual** (ciclo completo con un servidor local antes del hosting real):
  1. Instalar un build con versión N. Servir con `python3 -m http.server` una carpeta
     con `latest.json` de versión N+1 y un artefacto firmado localmente
     (`TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/vimo.key)" pnpm tauri build --config src-tauri/tauri.updater.conf.json`),
     apuntando `endpoints` temporalmente a `http://localhost:8000/latest.json`.
  2. Al abrir la app aparece el aviso con la versión N+1 y las notas; «Más tarde» lo
     cierra; Ajustes → «Buscar actualizaciones» lo reabre.
  3. «Actualizar y reiniciar» muestra progreso, y la app vuelve a abrir en N+1
     (Ajustes muestra «Versión instalada: N+1» y «Tenés la última versión»).
  4. Con una firma alterada en `latest.json`, la instalación falla con el toast de
     error y la app sigue en N.
  5. En web (`pnpm dev` en navegador), la sección aparece deshabilitada y no se hace
     ninguna petición a `latest.json`.
- **Cómo se vería una regresión:** el aviso no aparece nunca (endpoint caído,
  `latest.json` cacheado, o el chequeo dejó de montarse en `App`); «No se pudo
  instalar» en todas las máquinas (clave privada distinta de la pública embebida);
  la UI muestra una versión distinta de la que el updater compara (alguien volvió a
  escribir la versión en `brand.ts` o `tauri.conf.json`).

## Modos de falla

- Sin red o endpoint caído: el chequeo del arranque falla en silencio; Ajustes
  muestra «No se pudo comprobar…» solo al chequear a mano.
- Descarga interrumpida o firma inválida: toast de error, la app sigue en la versión
  actual; el usuario puede reintentar desde Ajustes.
- Tag sin coincidir con `package.json` o firma faltante: el job `publish` aborta y no
  se sube nada; los instaladores quedan como artefactos del run.

## Fuera de alcance

- Delta updates, canales (beta/estable) y rollback.
- Linux y Windows ARM64.
- Firma Authenticode en Windows (deuda de ADR-0026).
- Un endpoint dinámico (`{{target}}/{{current_version}}`): con un solo manifiesto
  estático alcanza para dos plataformas.

## Referencias

- [ADR-0026](ADR-0026-distribucion-windows-instalador-nsis.md) — instaladores y workflow.
- [ADR-0023](ADR-0023-una-entrada-de-keychain-y-firma-estable.md) — keychain y firma estable.
- [ADR-0002](ADR-0002-servidor-local-como-sidecar.md) — el pipeline se actualiza con la app.
- Tauri: <https://v2.tauri.app/plugin/updater/>, <https://v2.tauri.app/plugin/process/>.
