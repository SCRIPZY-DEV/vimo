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

## Empaquetar para macOS (firma)

Hoy `pnpm tauri build` deja la app con **firma ad-hoc** (`codesign --sign -`), igual que
los binarios de `scripts/build-sidecar.mjs` y `scripts/fetch-binaries.mjs`. Eso tiene un
efecto en el llavero: macOS ancla el permiso de lectura de la entrada de claves al
requisito de firma del binario, y con firma ad-hoc ese requisito cambia en cada build.
Por eso cada versión nueva de Vimo pide permiso **una** vez (ADR-0023). En desarrollo
(`pnpm tauri dev`, sin firmar) pasa lo mismo: un diálogo por build y uno por sesión.

Para que las actualizaciones no vuelvan a preguntar hace falta una identidad estable.
Tauri la lee de la variable `APPLE_SIGNING_IDENTITY` al empaquetar; **no** se escribe en
`tauri.conf.json` porque queda ligada a la cuenta de una persona.

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
  notarizar, `APPLE_ID`, `APPLE_PASSWORD` y `APPLE_TEAM_ID`. Tauri firma con esa misma
  identidad los `externalBin` (`vimo-pipeline`, `ffmpeg`, `yt-dlp`); la firma ad-hoc de
  los scripts queda solo para desarrollo.

Al pasar de ad-hoc a firmado, la entrada del llavero creada por un build anterior pide
permiso una última vez; con «Permitir siempre» el permiso queda anclado al certificado.

## Empaquetar para Windows (instalador NSIS)

El instalador de Windows se genera en **GitHub Actions**
([.github/workflows/build-desktop.yml](/.github/workflows/build-desktop.yml), ADR-0026):
Tauri no cross-compila desde macOS. Se dispara a mano desde la pestaña _Actions_
(«Build desktop installers» → _Run workflow_) o al pushear un tag `v*`; el
`Vimo_<versión>_x64-setup.exe` queda como artefacto `Vimo-windows-x64` del run. El
mismo workflow genera el DMG de macOS Apple Silicon (`Vimo-macos-arm64`) con firma
ad-hoc; para firmarlo de verdad, las variables de la sección anterior van como secretos
del repo.

**Cuota gratuita.** En repos privados GitHub cuenta los minutos de macOS por diez y los
de Windows por dos: una corrida completa gasta unos 200-250 de los 2000 minutos
mensuales del plan Free, y los artefactos (~270 MB por corrida, 3 días de retención)
comparten un cupo de 500 MB. Por eso el workflow no corre en cada push.

El workflow corre el mismo `pnpm tauri build` que en macOS: `fetch:binaries` descarga
`ffmpeg` y `yt-dlp` pineados para `x86_64-pc-windows-msvc`
([scripts/fetch-binaries.mjs](/scripts/fetch-binaries.mjs)), `build:sidecar` genera
`vimo-pipeline-x86_64-pc-windows-msvc.exe` a partir del `node.exe` del runner, y NSIS
lo descarga Tauri CLI solo. La configuración propia de Windows —solo NSIS, instalación
por usuario sin UAC, WebView2 por bootstrapper— vive en
[src-tauri/tauri.windows.conf.json](/src-tauri/tauri.windows.conf.json).

**Sin firma Authenticode.** Al ejecutar el setup, SmartScreen muestra «Windows protegió
el PC»: «Más información» → «Ejecutar de todas formas». Es la misma deuda que la firma
ad-hoc de macOS; cuando exista un certificado, va en `bundle.windows.certificateThumbprint`
(o `signCommand`) del archivo de Windows y las credenciales como secretos del workflow.

Para compilar localmente en una máquina Windows hacen falta Visual Studio Build Tools
(«Desarrollo para el escritorio con C++», incluye MSVC y el Windows SDK), Rust por
rustup (toolchain `stable-x86_64-pc-windows-msvc`), el runtime de WebView2, Node 22+ y
pnpm. Después:

```
pnpm install
pnpm tauri build --bundles nsis
```

El instalador queda en `src-tauri\target\release\bundle\nsis\`.
