# Vimo

Aplicación de escritorio que convierte un guion de texto en un video narrado completo,
listo para publicar: voz sintetizada, imágenes generadas por IA sincronizadas con la
narración, música de fondo y render final en MP4.

> [!IMPORTANT]
> **Este repositorio contiene la interfaz (`src/`), el lado nativo (`src-tauri/`) y el
> pipeline de generación (`pipeline/`).** El pipeline (las 6 fases: voz, transcripción,
> cortes, prompts, imágenes y render) se reescribe guiado desde el proyecto original y
> corre como **sidecar Node lanzado por Rust**, un proceso por job, sin servidor local
> ni puerto: la UI lo dispara con `invoke()` y recibe el progreso por el `Channel` del invoke
> ([ADR-0007](docs/adr/ADR-0007-invoke-reemplaza-al-servidor-local.md),
> [ADR-0010](docs/adr/ADR-0010-pipeline-por-stages-y-migracion-por-modulos.md)).
> FFmpeg viaja como binario. La identidad del usuario se resuelve con **Supabase**.
> En `src/` no hay orquestación ni llamadas a proveedores: solo la app que el usuario
> ve y opera.

Todo corre en la máquina del usuario: no hay servidor que desplegar. Las únicas llamadas
remotas son a los proveedores externos, con las claves del propio usuario.

Es una **reescritura desde cero** de un proyecto anterior que era un CLI monolítico en
Node. La lógica de generación se extrajo a un servicio propio y esta capa se rehízo
completa, con estructura modular y convenciones nuevas.

## Qué hace la aplicación

El usuario escribe o pega su guion, elige el estilo visual y las opciones de
generación, y la app dispara el proceso mostrando el avance fase por fase hasta
entregar el video final. El modelo es **BYO-keys**: cada usuario aporta sus
propias claves de los servicios pagos, así que el costo variable corre por su cuenta.

El flujo completo, paso a paso y con el reparto de responsabilidades entre la interfaz
y el sidecar, está en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Cómo fluye la aplicación

Del login al primer job, en un dibujo. La regla que lo sostiene: **la capa `api/` de
cada módulo es el único intermediario entre la UI y Tauri** — ningún componente ni
hook llama a `invoke`, `fetch` ni al SDK de Supabase directamente.

```
              ┌───────────────────────── webview (src/) ─────────────────────────┐
              │                                                                  │
              │   vista/componente → hook (TanStack Query) → api/ del módulo     │
              │                                                    │             │
              └────────────────────────────────────────────────────┼─────────────┘
                        │                        │                 │
              (1) LOGIN │              (2) CLAVES│        (3) JOBS │
                        ▼                        ▼                 ▼
              ┌──────────────────┐   ┌──────────────────────┐   ┌─────────────────────┐
              │ Supabase (OAuth  │   │ Rust: api_keys       │   │ Rust: pipeline      │
              │ Google, web +    │   │  valida la clave     │   │  arma el PipelineJob│
              │ deep link vimo://│   │  (reqwest) y la      │   │  (claves desde el   │
              │ ); guards en los │   │  guarda en el        │   │  keychain, nunca    │
              │ loaders del      │   │  KEYCHAIN del SO     │   │  del webview) y     │
              │ router           │   │  — nunca localStorage│   │  spawnea el sidecar │
              └──────────────────┘   └──────────────────────┘   └──────────┬──────────┘
                                                                           │ stdin: job
                                                                           ▼
                                                                ┌─────────────────────┐
                                                                │ sidecar             │
                                                                │ vimo-pipeline       │
                                                                │  llama a los        │
                                                                │  proveedores (LLM,  │
                                                                │  música, …) con las │
                                                                │  claves del usuario │
                                                                └──────────┬──────────┘
                                                       eventos NDJSON      │
                                              ◄── Channel del invoke ──────┘
                                              (progreso, resultado, error)
```

En palabras:

1. **Login** — el módulo `auth` autentica contra Supabase (OAuth Google); los loaders
   del router hacen de guard: sin sesión válida no se entra al layout autenticado.
2. **Claves (BYO-keys)** — en Ajustes, el módulo `api-keys` manda cada clave por
   `invoke` a Rust, que la valida contra el proveedor y la guarda en el keychain del
   sistema operativo. La clave no vuelve a pasar por la UI.
3. **Jobs** — cuando un módulo genera algo (música hoy, voces mañana), su `api/` usa
   la capa común `src/modules/common/fetcher/pipeline.ts`: `invoke` lanza el job y un
   `Channel` de Tauri trae de vuelta el progreso y el resultado. Rust inyecta las
   claves del keychain al job por stdin; el sidecar es quien llama a los proveedores.

El detalle de cada pieza está en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
(sección 4 para el pipeline).

## Plataformas

Una sola base de código compilada con Tauri 2 a aplicaciones nativas de **Windows,
macOS y Linux**.

Móvil queda fuera mientras el render dependa de FFmpeg como binario local — el porqué
está en la [ADR-0002](docs/adr/ADR-0002-servidor-local-como-sidecar-de-tauri.md)
(reemplazada por la ADR-0007 en cuanto al servidor, pero su análisis de FFmpeg sigue
vigente).

## Requisitos

- **Node.js 22+** y **pnpm**. Node 22 es el piso real: el sidecar del pipeline se
  empaqueta con Node SEA y el harness CLI ejecuta TypeScript por type stripping.
- **Rust** y las dependencias nativas de Tauri, solo si vas a compilar la app de
  escritorio. Guía oficial: <https://tauri.app/start/prerequisites/>.
- Para el desarrollo de la interfaz sola, alcanza con Node y pnpm.

## Puesta en marcha

```bash
git clone https://github.com/SCRIPZY-DEV/vimo.git
cd vimo
pnpm install
```

Si pnpm pide aprobar los scripts de instalación de alguna dependencia:

```bash
pnpm approve-builds
```

Después, según lo que quieras levantar:

```bash
pnpm dev          # interfaz en el navegador (http://localhost:5173)
pnpm tauri dev    # aplicación nativa, con recarga en caliente
```

## Comandos

| Comando              | Qué hace                                                           |
| -------------------- | ------------------------------------------------------------------ |
| `pnpm dev`           | Servidor de desarrollo de Vite en el puerto 5173                   |
| `pnpm build`         | Chequeo de tipos (`tsc -b`) y bundle de producción en `dist/`      |
| `pnpm preview`       | Sirve el bundle ya construido                                      |
| `pnpm lint`          | ESLint sobre todo el repositorio                                   |
| `pnpm lint:fix`      | ESLint aplicando las correcciones automáticas                      |
| `pnpm format`        | Prettier sobre todo el repositorio                                 |
| `pnpm pipeline`      | Corre el sidecar del pipeline por CLI (harness manual)             |
| `pnpm build:sidecar` | Empaqueta el sidecar como binario único (Node SEA → `externalBin`) |
| `pnpm tauri dev`     | Aplicación nativa en modo desarrollo                               |
| `pnpm tauri build`   | Compila los instaladores nativos de la plataforma actual           |

Antes de dar por terminado un cambio: `pnpm format`, `pnpm lint` y `pnpm build`, en ese
orden. Los tres deben pasar.

## Empaquetado del sidecar del pipeline

El pipeline (`pipeline/`) no corre con el Node del sistema: viaja dentro de la app
como **binario único** generado con Node SEA (esbuild → blob SEA → runtime de Node,
~110 MB por plataforma). Ver la sección `pipeline/` de
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**No hay pasos manuales en el flujo normal**: `pnpm tauri dev` y `pnpm tauri build`
regeneran el binario solos (hooks `beforeDevCommand`/`beforeBuildCommand` →
`pnpm build:sidecar`). El comando suelto existe para regenerarlo a mano o
diagnosticar el empaquetado.

⚠️ **Los artefactos generados NO se commitean** — ya están en `.gitignore`; si git
te los muestra como cambios, algo se rompió en el ignore, no los agregues:

```
src-tauri/binaries/        el binario final vimo-pipeline-<target-triple> (~110 MB)
src-tauri/sidecar-build/   intermedios (bundle CJS + blob SEA)
dist/                      bundle de la interfaz
```

Cada quien genera el binario para SU plataforma al compilar (el target triple sale
de `rustc`, o de `TAURI_ENV_TARGET_TRIPLE` dentro de los hooks de Tauri). Detalles
del proceso en [scripts/build-sidecar.mjs](scripts/build-sidecar.mjs).

## Estructura

```
src/         la interfaz: módulos por dominio, router e i18n
pipeline/    el pipeline de generación: sidecar Node por stages, con los providers de IA
src-tauri/   el lado Rust: comandos invoke, configuración nativa, iconos y capabilities
docs/        arquitectura, guía de contribución y decisiones (ADRs)
```

El detalle de cada carpeta y las reglas para agregar código están en
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) y [CLAUDE.md](CLAUDE.md).

## Documentación

| Documento                                          | Para qué                                        |
| -------------------------------------------------- | ----------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)       | Cómo está construido y cómo fluye la aplicación |
| [CLAUDE.md](CLAUDE.md)                             | Convenciones de código (obligatorias)           |
| [docs/CONTRIBUTING.es.md](docs/CONTRIBUTING.es.md) | Ramas, Pull Requests y forma de trabajo         |
| [docs/adr/](docs/adr/)                             | Decisiones de arquitectura y por qué se tomaron |

## Estado

La migración está en curso. Hoy el repositorio tiene el andamiaje completo (React 19,
Vite, Tauri 2, React Router con guards, TanStack Query, Tailwind, i18next) y la
**autenticación real**: OAuth con Google en doble flujo —web y deep link `vimo://`—,
verificación de acceso y cierre de sesión (ADR-0006). El pipeline de generación está
en migración por módulos (ADR-0010): la fundación de `pipeline/` —contratos, providers
de LLM y música, sidecar mínimo y comandos Rust genéricos— ya está; faltan los módulos
de pantalla (AI Music primero) y las stages con Create. El detalle pieza por pieza
está en la tabla §6 de [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
