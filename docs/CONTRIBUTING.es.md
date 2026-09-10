# Contribución

[English](/docs/CONTRIBUTING.md) · **Español**

Cómo trabajar en este repositorio: para humanos (y los agentes de IA que te ayudan).

## Orientación

- **Arquitectura** (cómo está construido todo): [ARCHITECTURE.md](ARCHITECTURE.md) — lee esto primero.
- **Reglas**: para modificar las reglas, modifica `CLAUDE.md`. Claude Code carga estos archivos automáticamente en cada sesión.

## Dos formas de trabajar con Claude

### A. Prompts estándar (opción predeterminada)

Simplemente haz tu petición. Utiliza esta opción para cualquier tarea que no implique una funcionalidad completa que abarque múltiples áreas:

- preguntas («¿cómo funciona la consulta del _feed_?»),
- cambios en un área específica («corrige esta validación del serializador», «ajusta este componente»),
- depuración, refactorización y correcciones puntuales.

### B. El pipeline `/feature`

Este proceso se encuentra en desarrollo, pero básicamente lo que hace es levantar varios agentes de IA para ayudarte a resolver una tarea específica. Sin embargo, puede llegar a ser más costoso si no se tiene clara la _feature_ a implementar.

## Ramas y Pull Requests

- **Una rama por cada nueva característica.** Nunca trabajes directamente sobre `dev`. Nombra la rama según el cambio, usando el mismo prefijo que el tipo de commit: `feat/exportacion-portable`, `fix/validacion-serializador`.
- **Todo Pull Request apunta a `dev`, nunca a `production`.** Los cambios llegan a producción únicamente promoviendo `dev`; ningún PR va directo a la rama de producción.
- **El título del PR sigue git flow / Conventional Commits**: `<tipo>: <descripción corta>`, por ejemplo `feat: agregar exportación portable al panel de ajustes`.

  Tipos en uso: `feat` (nueva funcionalidad), `fix` (corrección de error), `docs` (documentación), `style` (formato, sin cambios de lógica), `refactor` (reestructuración sin cambio de comportamiento), `perf` (rendimiento), `test` (pruebas), `chore` (herramientas, dependencias, configuración).

- **La descripción del PR debe ser detallada** — suficiente para quien revisa sin haber estado presente. Incluye al menos:
  - **Qué se hizo**: los cambios, área por área.
  - **Por qué**: el problema que resuelve o la tarea/issue que cierra.
  - **Cómo probarlo**: pasos para reproducir o verificar el cambio.
  - **Notas**: cambios que rompen compatibilidad, migraciones o pendientes.

## Reglas básicas (se aplican a todos los cambios)

- **Claude nunca ejecuta comandos de git**: tú, como humano, te encargas del _staging_, los _commits_, las ramas y los _pushes_.
- Sigue las reglas del archivo `CLAUDE.md` de la zona; estas recogen las convenciones que los revisores utilizan para verificar el trabajo.

## Empaquetar para macOS (firma y notarización)

El DMG que genera GitHub Actions (`Vimo-macos-arm64`, ver la sección de Windows) sale
**firmado con Developer ID y notarizado**: se descarga, se abre y Gatekeeper no
interviene. Un `pnpm tauri build` local sin variables, en cambio, deja la app con
**firma ad-hoc** (`codesign --sign -`), igual que los binarios de
`scripts/build-sidecar.mjs` y `scripts/fetch-binaries.mjs`. Eso tiene dos efectos:

- **Gatekeeper.** Un build ad-hoc abre bien en la máquina donde se compiló, pero si
  llega por descarga (navegador, artefacto de Actions) macOS le pone el atributo
  `com.apple.quarantine` y, en Apple Silicon, lo rechaza con «la app está dañada,
  muévela a la papelera»: no es corrupción, es la firma. Para probar un artefacto
  ad-hoc: `xattr -cr /Applications/Vimo.app`. Para distribuirlo, no hay atajo:
  hay que firmar y notarizar.
- **Llavero.** macOS ancla el permiso de lectura de la entrada de claves al requisito
  de firma del binario, y con firma ad-hoc ese requisito cambia en cada build. Por eso
  cada versión ad-hoc de Vimo pide permiso **una** vez (ADR-0023). En desarrollo
  (`pnpm tauri dev`, sin firmar) pasa lo mismo: un diálogo por build y uno por sesión.

Tauri lee la identidad de la variable `APPLE_SIGNING_IDENTITY` al empaquetar; **no** se
escribe en `tauri.conf.json` porque queda ligada a la cuenta de una persona. La
configuración que sí es del repo vive en
[src-tauri/tauri.macos.conf.json](/src-tauri/tauri.macos.conf.json): solo DMG,
`minimumSystemVersion` y los entitlements de
[src-tauri/Entitlements.plist](/src-tauri/Entitlements.plist). Estos existen porque la
notarización exige _hardened runtime_ y bajo él el sidecar `vimo-pipeline` (un Node SEA,
V8 con JIT) aborta sin `allow-jit` / `allow-unsigned-executable-memory`, y `ffmpeg` y
`yt-dlp` sin `disable-library-validation`. Tauri aplica el mismo plist a la `.app` y a
cada `externalBin`.

**Secretos del workflow.** Tauri CLI hace todo el flujo (importar el certificado en un
llavero temporal, firmar, notarizar con `notarytool`, grapar) si encuentra estas
variables; `build-installer.yml` se las pasa desde los secretos del repo (_Settings →
Secrets and variables → Actions_):

| Secreto                      | Contenido                                                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `APPLE_CERTIFICATE`          | El `.p12` del certificado **Developer ID Application** en base64. Exportarlo desde Acceso a Llaveros y `base64 -i cert.p12 \| pbcopy`. |
| `APPLE_CERTIFICATE_PASSWORD` | La contraseña puesta al exportar el `.p12`.                                                                                            |
| `APPLE_SIGNING_IDENTITY`     | `Developer ID Application: <Nombre> (<TEAMID>)`, tal como lo lista `security find-identity -v -p codesigning`.                         |
| `APPLE_ID`                   | Apple ID de la cuenta de desarrollador.                                                                                                |
| `APPLE_PASSWORD`             | Una _app-specific password_ creada en appleid.apple.com → Iniciar sesión y seguridad; nunca la contraseña real.                        |
| `APPLE_TEAM_ID`              | El Team ID de 10 caracteres (developer.apple.com → Membership).                                                                        |

Si falta alguno, el build no falla: Tauri vuelve a firma ad-hoc y salta la notarización,
y el DMG resultante vuelve a dar «app dañada» al descargarlo. Para comprobar un DMG
descargado:

```
codesign -dv --verbose=4 /Volumes/Vimo/Vimo.app     # Authority=Developer ID Application: …
codesign -d --entitlements - /Volumes/Vimo/Vimo.app/Contents/MacOS/vimo-pipeline
spctl -a -vv -t install <ruta>.dmg                   # accepted, source=Notarized Developer ID
xcrun stapler validate <ruta>.dmg
```

**Firmar en local.** Las mismas variables sirven para `pnpm tauri build` en tu máquina
(con el certificado ya en el llavero basta `APPLE_SIGNING_IDENTITY`; las de notarización
son opcionales, sin ellas la app queda firmada pero no notarizada):

- **Sin cuenta de Apple — certificado autofirmado local.** En Acceso a Llaveros:
  Asistente de certificados → Crear un certificado → tipo «Firma de código». Después:

  ```
  security find-identity -v -p codesigning        # lista el nombre exacto
  APPLE_SIGNING_IDENTITY="<nombre del certificado>" pnpm tauri build
  ```

  En la máquina donde se instale, tras el primer «Permitir siempre» ninguna versión
  firmada con ese mismo certificado vuelve a preguntar. Gatekeeper lo trata igual que
  ad-hoc (abrir con clic derecho la primera vez): no empeora la distribución actual.

- **Con Apple Developer.** Misma variable con «Developer ID Application: …» y, para
  notarizar, `APPLE_ID`, `APPLE_PASSWORD` y `APPLE_TEAM_ID` (la tabla de arriba). Tauri
  firma con esa misma identidad los `externalBin` (`vimo-pipeline`, `ffmpeg`, `yt-dlp`)
  con `--force`, así que la firma ad-hoc de los scripts queda solo para desarrollo.

Al pasar de ad-hoc a firmado, la entrada del llavero creada por un build anterior pide
permiso una última vez; con «Permitir siempre» el permiso queda anclado al certificado.

## Empaquetar para Windows (instalador NSIS)

El instalador de Windows se genera en **GitHub Actions**
([.github/workflows/build-desktop.yml](/.github/workflows/build-desktop.yml), ADR-0026):
Tauri no cross-compila desde macOS. Se dispara a mano desde la pestaña _Actions_
(«Build desktop installers» → _Run workflow_, eligiendo en _platform_ si se compila
solo Windows, solo macOS o ambos) o al pushear un tag `v*`, que siempre genera ambos; el
`Vimo_<versión>_x64-setup.exe` queda como artefacto `Vimo-windows-x64` del run. El
mismo workflow genera el DMG de macOS Apple Silicon (`Vimo-macos-arm64`) firmado con
Developer ID y notarizado con los secretos `APPLE_*` de la sección anterior.

**Cuota gratuita.** En repos privados GitHub cuenta los minutos de macOS por diez y los
de Windows por dos: una corrida completa gasta unos 200-250 de los 2000 minutos
mensuales del plan Free, y los artefactos (~270 MB por corrida, 3 días de retención)
comparten un cupo de 500 MB. Por eso el workflow no corre en cada push.

**Secretos obligatorios.** El `.env` no se sube al repo, así que el workflow lee
`VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` desde los secretos del repo
(_Settings → Secrets and variables → Actions_) y se los pasa al build de la interfaz.
Vite los embebe en el bundle; si faltan, el cliente de Supabase lanza al cargar y la app
instalada abre con la ventana en blanco, en ambos sistemas. Los `APPLE_*` de la sección
de macOS viajan por el mismo camino (`secrets: inherit`); en el job de Windows se ignoran.

El workflow corre el mismo `pnpm tauri build` que en macOS: `fetch:binaries` descarga
`ffmpeg` y `yt-dlp` pineados para `x86_64-pc-windows-msvc`
([scripts/fetch-binaries.mjs](/scripts/fetch-binaries.mjs)), `build:sidecar` genera
`vimo-pipeline-x86_64-pc-windows-msvc.exe` a partir del `node.exe` del runner, y NSIS
lo descarga Tauri CLI solo. La configuración propia de Windows —solo NSIS, instalación
por usuario sin UAC, WebView2 por bootstrapper— vive en
[src-tauri/tauri.windows.conf.json](/src-tauri/tauri.windows.conf.json).

**Sin firma Authenticode.** Al ejecutar el setup, SmartScreen muestra «Windows protegió
el PC»: «Más información» → «Ejecutar de todas formas». Es la deuda equivalente a la que
macOS ya saldó con Developer ID; cuando exista un certificado, va en
`bundle.windows.certificateThumbprint` (o `signCommand`) del archivo de Windows y las
credenciales como secretos del workflow.

Para compilar localmente en una máquina Windows hacen falta Visual Studio Build Tools
(«Desarrollo para el escritorio con C++», incluye MSVC y el Windows SDK), Rust por
rustup (toolchain `stable-x86_64-pc-windows-msvc`), el runtime de WebView2, Node 22+ y
pnpm. Después:

```
pnpm install
pnpm tauri build --bundles nsis
```

El instalador queda en `src-tauri\target\release\bundle\nsis\`.

## Publicar una versión (updater)

La app busca versiones nuevas al arrancar en `https://vimo.click/releases/latest.json`
(ADR-0027). Publicar una versión es pushear un tag; el workflow hace el resto.

1. Subí la versión en `package.json` (única fuente: `tauri.conf.json` y la UI la leen
   de ahí) y mergeá ese cambio.
2. Creá un tag **anotado** con el mismo número; el mensaje son las notas que verá el
   usuario en el aviso de actualización:

   ```
   git tag -a v0.2.0 -m "Novedades de esta versión"
   git push origin v0.2.0
   ```

3. `Build desktop installers` compila ambas plataformas, firma los artefactos con
   minisign y el job `publish` genera `latest.json`
   ([scripts/build-update-manifest.mjs](/scripts/build-update-manifest.mjs)), sube los
   instaladores a Cloudflare R2 (carpeta `v<versión>/`) y deja el manifiesto como
   artefacto `Vimo-release-manifest-<tag>` del run. Si el tag no coincide con
   `package.json` o falta una firma, el job aborta y no sube nada.
4. Descargá ese artefacto y pegá `latest.json` en `public/releases/` del repo de la
   landing; con el push, Cloudflare Pages lo sirve en
   `https://vimo.click/releases/latest.json` y las apps ven la versión nueva. Hasta
   ese commit nadie recibe la actualización.

**Clave de firma (una sola vez).** Los artefactos del updater se firman con una clave
minisign; la app solo instala lo que verifica con la clave pública embebida en
`src-tauri/tauri.conf.json` (`plugins.updater.pubkey`). La privada se genera una vez:

```
pnpm tauri signer generate -w ~/.tauri/vimo.key
```

y va a los secretos del repo como `TAURI_SIGNING_PRIVATE_KEY` (el contenido del archivo)
y `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (vacío si se generó sin password). **Guardala en
un gestor de contraseñas: si se pierde, ninguna app instalada podrá actualizarse** y
habrá que redistribuir instaladores a mano con una clave nueva. No se regenera.

**Variables y secretos de publicación** (_Settings → Secrets and variables → Actions_):

| Nombre                       | Tipo     | Qué es                                                                                 |
| ---------------------------- | -------- | -------------------------------------------------------------------------------------- |
| `RELEASES_PUBLIC_URL`        | variable | URL pública del bucket de R2, con `/` final (dominio propio o `https://pub-….r2.dev/`) |
| `RELEASES_S3_ENDPOINT`       | secreto  | `https://<account-id>.r2.cloudflarestorage.com`                                        |
| `RELEASES_S3_BUCKET`         | secreto  | Nombre del bucket                                                                      |
| `RELEASES_ACCESS_KEY_ID`     | secreto  | Token de API de R2 con permiso de escritura en ese bucket                              |
| `RELEASES_SECRET_ACCESS_KEY` | secreto  | Su secreto                                                                             |

Mientras falten, la subida se salta sin fallar; los instaladores quedan en los
artefactos de cada plataforma y se suben a mano a `v<versión>/` en el bucket con los
nombres que figuran en el manifiesto. El feed viejo `public/vimo-latest.json` de la
landing es de la app anterior y no se toca.

**Build local.** `pnpm tauri build` no necesita la clave: `createUpdaterArtifacts` vive
en [src-tauri/tauri.updater.conf.json](/src-tauri/tauri.updater.conf.json) y solo el
workflow lo pasa con `--config`. Para probar el ciclo completo en tu máquina:

```
TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/vimo.key)" TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
  pnpm tauri build --config src-tauri/tauri.updater.conf.json
```

(el bundler lee el **contenido** de la clave en `TAURI_SIGNING_PRIVATE_KEY`; la variante
`_PATH` no la reconoce). El build deja `Vimo.app.tar.gz` + `.sig` en `src-tauri/target/release/bundle/macos/`; armá un
`latest.json` con `scripts/build-update-manifest.mjs`, servilo con
`python3 -m http.server` y apuntá `endpoints` temporalmente a `http://localhost:8000/latest.json`
en una app instalada con versión menor.
