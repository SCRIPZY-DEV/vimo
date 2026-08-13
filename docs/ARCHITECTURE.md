# Arquitectura

Fuente de verdad sobre **cómo está construido** este sistema y **cómo fluye**. Se lee
antes de tocar código.

Este documento es de referencia: describe la forma del sistema. Las **reglas** para
escribir código están en [CLAUDE.md](../CLAUDE.md), y las **decisiones** con su
justificación en [docs/adr/](adr/).

> [!IMPORTANT]
> **Cambio de dirección (2026-08-13,
> [ADR-0007](adr/ADR-0007-invoke-reemplaza-al-servidor-local.md)):** el servidor local
> como sidecar (ADR-0002) queda **reemplazado**. El puente entre la app y el sistema
> operativo será `invoke()` de Tauri: Rust ejecuta directamente las funciones del
> pipeline (que se conservan tal cual), el entitlement firmado desaparece como
> concepto, y el `api/` de cada módulo usará una utilidad dual de `common` —
> `isTauri()` → `invoke()`; web → `fetch` — todavía **no implementada**. Las secciones
> 1 y 4 de este documento describen la arquitectura de sidecar reemplazada y se
> reescribirán con la migración del pipeline; hasta entonces, ante conflicto manda la
> ADR-0007.

---

## 1. Frontera del sistema

**Todo corre en la máquina del usuario.** No hay servidor que desplegar ni costo de
infraestructura: la aplicación empaqueta el servidor que ejecuta el pipeline y el
binario de FFmpeg, y las únicas llamadas remotas son a los proveedores externos, con las
claves del propio usuario.

Son **tres procesos dentro de una misma aplicación**:

```
┌──────────────────────────────────────────────────────┐
│  Aplicación Tauri                                    │
│                                                      │
│  ┌─────────────────┐    HTTP a 127.0.0.1:PUERTO      │
│  │  SPA (React)    │ ──────────────────────┐         │
│  │  este repo      │                       │         │
│  └────────┬────────┘                       ▼         │
│           │                       ┌──────────────────┐│
│           │ API de fs             │ sidecar: Hono    ││
│           │ y diálogos            │ (repo aparte)    ││
│           ▼                       │ fases 1 a 6      ││
│  ┌─────────────────┐              └───┬──────────┬───┘│
│  │  Rust: lanza y  │                  │          │    │
│  │  mata sidecars  │                  │ invoca   │    │
│  └─────────────────┘                  │          ▼    │
│                                       │   ┌───────────┐│
│                                       │   │ sidecar:  ││
│                                       │   │ FFmpeg    ││
│                                       │   └───────────┘│
└───────────────────────────────────────┼───────────────┘
             │                          ▼
             │              proveedores externos
             │              TTS · transcripción · LLM · imágenes
             ▼
      ┌──────────────┐
      │  Supabase    │  única pieza remota: identidad del usuario
      └──────────────┘
```

| Responsabilidad                             | Dónde vive            |
| ------------------------------------------- | --------------------- |
| Pantallas, navegación, estado de la UI      | **este repositorio**  |
| Rutas, diálogos nativos y acceso a archivos | **este repositorio**  |
| Lanzar y detener los sidecars               | **este repositorio**  |
| Las 6 fases que generan el video            | sidecar (repo aparte) |
| Llamadas a los proveedores externos         | sidecar               |
| Ensamblado del video                        | sidecar de FFmpeg     |
| Registro, login y sesión                    | Supabase              |
| Claves de los servicios pagos (BYO-keys)    | máquina del usuario   |

Lo que **no** existe en `src/` y no debe aparecer: FFmpeg, modelos de IA, llamadas
directas a proveedores, orquestación de fases ni claves de esos servicios. FFmpeg viaja
en la aplicación, sí, pero como binario declarado en `src-tauri/`, nunca como código de
la interfaz. Si un cambio empieza a necesitar algo de esa lista dentro de `src/`, el
cambio va en el sidecar.

### Quién manda sobre los archivos

La línea es explícita, porque si ambos lados calculan rutas terminan divergiendo:

- **Tauri decide el _dónde_**: elige el directorio de trabajo dentro del directorio de
  datos de la aplicación y expone el diálogo nativo para que el usuario guarde el MP4
  donde quiera.
- **El sidecar decide el _qué_**: recibe ese directorio y la ruta de FFmpeg como
  parámetros al arrancar, y escribe ahí sus artefactos. No asume rutas propias.
- **La SPA no escribe artefactos del pipeline.** Usa la API de filesystem de Tauri solo
  para leer el resultado, revelarlo en el explorador de archivos y guardarlo.

---

## 2. Stack

| Capa            | Tecnología         | Rol                                                    |
| --------------- | ------------------ | ------------------------------------------------------ |
| Interfaz        | React 19           | Componentes y estado de la UI                          |
| Lenguaje        | TypeScript         | Toda la fuente de `src/`                               |
| Build           | Vite               | Servidor de desarrollo y bundle de producción          |
| Empaquetado     | Tauri 2 (Rust)     | Aplicación nativa de escritorio y gestión de sidecars  |
| Navegación      | React Router v7    | Árbol de rutas y vistas                                |
| Estado servidor | TanStack Query     | Caché, reintentos y consulta de progreso               |
| Estilos         | TailwindCSS        | Sistema de estilos                                     |
| Autenticación   | Supabase           | Identidad del usuario                                  |
| Pipeline        | Hono (repo aparte) | Sidecar compilado a binario único; ejecuta las 6 fases |
| Render          | FFmpeg             | Sidecar; build LGPL con codificadores por hardware     |
| Paquetes        | pnpm               | Instalación y scripts                                  |

Las **versiones exactas** están en [package.json](../package.json) y
[src-tauri/Cargo.toml](../src-tauri/Cargo.toml). No se duplican acá: se desactualizan.

**Plataformas:** Windows, macOS y Linux. Móvil queda fuera mientras el render dependa de
FFmpeg como binario local — ver la
[ADR-0002](adr/ADR-0002-servidor-local-como-sidecar-de-tauri.md).

---

## 3. Estructura de archivos

### Raíz del repositorio

```
vimo/
├── CLAUDE.md              convenciones de código (obligatorias)
├── README.md              qué es el proyecto y cómo levantarlo
├── index.html             plantilla HTML que carga Vite
├── package.json           dependencias y scripts
├── eslint.config.js       reglas de ESLint (incluye react-hooks y react-refresh)
├── .prettierrc.json       formato de código
├── vite.config.ts         build, plugins y el alias @/ → src/
├── tsconfig.app.json      configuración de TypeScript para src/
├── docs/                  documentación del proyecto
│   ├── ARCHITECTURE.md    este archivo
│   ├── CONTRIBUTING.md    proceso de trabajo (inglés)
│   ├── CONTRIBUTING.es.md proceso de trabajo (español)
│   └── adr/               decisiones de arquitectura
├── public/                archivos servidos tal cual (se copian a dist/)
├── src/                   la interfaz  ← el grueso del trabajo
└── src-tauri/             el lado nativo y los sidecars
```

### `src/` — la interfaz

Organizada **por módulo de dominio**, no por tipo de archivo. No existen carpetas
globales `components/`, `hooks/` ni `types/`.

```
src/
├── main.tsx                 punto de entrada: monta React y los providers
├── App.tsx                  shell de la aplicación
├── router/index.ts          árbol de rutas: vistas de los módulos bajo su layout
├── i18n/index.ts            configuración de i18next (los textos viven en public/locales/)
├── layouts/                 cascarones de la app
│   ├── AuthenticatedLayout/ shell con sidebar + navbar (app con sesión)
│   └── GuestLayout/         full-screen para login / acceso denegado
├── assets/                  imágenes, fuentes y CSS global (css/main.css)
└── modules/
    ├── common/              lo transversal: fetcher, queryClient, supabase, UI, brand
    ├── auth/                sesión y acceso: OAuth Google, guards del router, verificación
    ├── videos/              creación de video (hoy: vista Create maquetada)
    ├── setup/               arranque: splash (entrada de la app en `/`)
    └── <modulo>/            un dominio del producto
        ├── api/index.ts     única capa que habla con el exterior
        ├── components/      componentes del módulo
        ├── hooks/           hooks del módulo
        ├── types/           un archivo por dominio
        ├── views/<Vista>/   una vista por carpeta
        └── constants.ts     rutas, claves de query y demás constantes
```

Las reglas que gobiernan esta estructura —límites entre módulos, barriles permitidos,
dónde vive cada tipo de archivo, cómo se colocan las traducciones— están en
[CLAUDE.md](../CLAUDE.md). No se repiten acá para que no se contradigan.

**La cadena de datos es fija y no se saltea ningún eslabón:**

```
componente → hook (TanStack Query) → api/ → fetcher → sidecar
```

El `fetcher` de `modules/common` es el único que conoce la URL del sidecar, que llega
desde la configuración. Ningún otro archivo de la interfaz sabe en qué puerto escucha.

### `src-tauri/` — el lado nativo y los sidecars

```
src-tauri/
├── tauri.conf.json    ventana, iconos, y externalBin con los sidecars
├── Cargo.toml         dependencias de Rust (incluye tauri-plugin-shell)
├── build.rs           script de build de Tauri
├── src/               código Rust: lanza los sidecars y los detiene al salir
├── binaries/          los sidecars, con sufijo de target triple
├── capabilities/      permisos, incluido el de ejecutar sidecars
├── icons/             iconos de la aplicación
└── gen/               código generado (no se edita a mano)
```

Los binarios de `binaries/` **deben llevar el sufijo del target triple** en el nombre
(`vimo-server-x86_64-apple-darwin`); es el requisito de Tauri que más se olvida. Cada
instalador incluye únicamente los binarios de su plataforma.

Del lado del bundle, Tauri empaqueta `dist/` (la clave `frontendDist`), los iconos y los
`externalBin`. Nada de `docs/` viaja dentro de la aplicación.

---

## 4. Flujo principal: de guion a video

Es el único flujo del producto. La interfaz **dispara y observa**; el sidecar
**ejecuta**. Cada paso indica qué hace cada lado.

### Arranque de la aplicación

1. Rust lanza el sidecar del servidor pasándole un **puerto libre** —nunca uno fijo—, el
   directorio de trabajo y la ruta del binario de FFmpeg.
2. El sidecar informa su puerto y queda escuchando en `127.0.0.1`.
3. La interfaz **espera un health check** antes de la primera petición: el sidecar tarda
   en levantar y disparar antes provoca fallos intermitentes.
4. Al cerrar la aplicación, Rust detiene el sidecar. Un sidecar huérfano corriendo tras
   el cierre es un fallo, no un detalle.

Si el sidecar no arranca o no responde, la interfaz lo dice explícitamente y **no
permite generar**. No hay modo degradado: sin sidecar no hay video.

### Fase 0 — Sesión y configuración

- **La interfaz** exige sesión iniciada (Supabase), reúne las entradas del formulario
  —guion, estilo visual, número de imágenes y opciones de proveedores— y verifica que
  estén cargadas las claves necesarias.
- Si falta una clave, lleva al usuario a la pantalla de ajustes en lugar de arrancar un
  trabajo que va a fallar.

La comunicación con el sidecar **no lleva autenticación**: escucha en localhost y sirve
a un único usuario, el que ya está frente a la aplicación.

### Fase 1 — Voz, música y overlay

- **El sidecar** genera en paralelo la narración con el proveedor de TTS, descarga la
  música de fondo y, si corresponde, el video de overlay.
- **La interfaz** muestra la fase en curso. Si la música o el overlay eran obligatorios y
  fallaron, el trabajo se aborta con un error explícito, no con un estado ambiguo.

### Fase 2 — Transcripción palabra a palabra

- **El sidecar** transcribe la narración con marcas de tiempo por palabra, usando el
  proveedor externo. Esto es lo que después permite sincronizar cada imagen con lo que se
  está narrando.
- **La interfaz** solo refleja el avance.

### Fase 3 — Cortes por tiempo

- **El sidecar** divide la duración total en N escenas de igual duración y agrupa las
  palabras dentro de cada una según sus marcas de tiempo.
- **La interfaz** sugiere el número de imágenes recomendado (aproximadamente una cada 3
  segundos) y deja que el usuario lo confirme o lo cambie **antes** de disparar. Nunca a
  mitad del proceso: no se espera una respuesta interactiva con el trabajo ya corriendo.

### Fase 4 — Prompts de imagen

- **El sidecar** genera, con un modelo de lenguaje, el prompt de imagen de cada escena,
  usando el guion completo como contexto para que el fragmento no quede fuera de lugar.
- **La interfaz** muestra el avance por escena.

### Fase 5 — Generación de imágenes

- **El sidecar** genera una imagen por escena con el proveedor elegido, reintentando y
  reformulando los prompts rechazados por filtros de contenido.
- **La interfaz** muestra cuántas escenas llevan imagen sobre el total. Es la fase más
  larga: el progreso tiene que ser granular, no una barra indeterminada.

### Fase 6 — Render final

- **El sidecar** invoca a FFmpeg para ensamblar el video: movimientos de cámara,
  concatenación, mezcla de voz y música, y el filtro de color del estilo elegido.
- **La interfaz** muestra el avance y, al terminar, ofrece reproducir el resultado o
  guardarlo con el diálogo nativo de Tauri.

Como todo ocurre en la misma máquina, el MP4 no viaja por la red: ya está donde tiene que
estar.

### Reanudar un trabajo interrumpido

El estado del trabajo lo lleva el **sidecar**, en el `checkpoint` que escribe en el
directorio de trabajo. La interfaz **no** guarda progreso propio que pueda quedar
desincronizado.

El sidecar sobrevive a recargas de la webview y a la navegación entre vistas, **pero no
al cierre de la aplicación**: se detiene con ella y el trabajo se interrumpe. Al volver a
abrir, la generación se retoma desde la última fase completada gracias al checkpoint.
Conviene advertir al usuario antes de cerrar con un trabajo en curso.

### Contrato con el sidecar

Lo que ya está decidido:

- **Asíncrono**: el `POST` de generación devuelve un id al instante, nunca bloquea.
- **Progreso por consultas periódicas** contra un endpoint de estado. Alcanza con
  TanStack Query; no hace falta SSE ni WebSocket.
- **Una generación a la vez**, sin cola ni base de datos: el `checkpoint` en disco es el
  estado.
- **Sin autenticación**, por ser localhost y un solo usuario.

Lo que falta fijar, y conviene hacerlo antes de implementar la vista de generación:

- Los nombres y las formas exactas de los endpoints.
- La **forma de los errores por fase**, para poder mostrar mensajes útiles en lugar de un
  «algo falló».
- Dónde se guardan las claves del usuario en la máquina y cómo las lee la interfaz.

---

## 5. Estado de la migración

Este documento describe el destino. El código todavía no llegó ahí:

| Pieza                                              | Estado                                                                                                                                                                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| React 19 + TypeScript + Vite                       | listo                                                                                                                                                                                                                 |
| Tauri 2 con la ventana de la aplicación            | listo (identifier y tamaño de ventana propios)                                                                                                                                                                        |
| ESLint, Prettier y el alias `@/`                   | listo                                                                                                                                                                                                                 |
| Convenciones de código ([CLAUDE.md](../CLAUDE.md)) | listo                                                                                                                                                                                                                 |
| Estructura modular en `src/`                       | fundaciones + layouts listos: `router/`, `i18n/`, `layouts/` (Authenticated/Guest), `modules/common` (ui, doodles, theme, brand, fetcher, queryClient, supabase) y módulos `auth`/`videos`/`setup` (`home` eliminado) |
| Layouts y vistas base                              | Login, Callback, AccessDenied y Splash con lógica real; Create (videos) y PageNotFound maquetadas; sidebar/navbar funcionales — ADR-0005                                                                              |
| React Router, TanStack Query, Tailwind             | instalados y configurados (hash router con loaders como guards; primeras query keys: `authQueryKeys`)                                                                                                                 |
| Autenticación (módulo `auth`)                      | lista — ADR-0006: OAuth Google doble flujo (web + deep link `vimo://`), verificación de acceso contra vimo.click, gate por loaders, logout. Pendiente: cold start del deep link                                       |
| Infraestructura de i18n (`src/i18n/`)              | lista con i18next + catálogos `public/locales/{es,en,pt}.json` — ADR-0004                                                                                                                                             |
| Plugins de Tauri (`deep-link`, `opener`)           | instalados y configurados (scheme `vimo`, capabilities)                                                                                                                                                               |
| Backend local / pipeline                           | **redirigido por ADR-0007**: el sidecar Hono se reemplaza por comandos `invoke()` de Rust + utilidad dual invoke/fetch (documentada, sin implementar); el `fetcher` actual queda hasta esa fase                       |
| FFmpeg empaquetado por plataforma                  | sin empezar (lo invocará Rust — ADR-0007)                                                                                                                                                                             |

Mantené esta tabla al día: es lo que le dice a quien llega —persona o agente— qué puede
dar por hecho y qué no.
