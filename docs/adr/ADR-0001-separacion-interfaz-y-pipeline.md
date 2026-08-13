# ADR-0001 — Separar la interfaz del pipeline y reescribirla desde cero

- **Estado:** Reemplazada por [ADR-0002](ADR-0002-servidor-local-como-sidecar-de-tauri.md)
- **Fecha:** 2026-08-11
- **Área:** app

> [!WARNING]
> **Esta decisión ya no está vigente.** La
> [ADR-0002](ADR-0002-servidor-local-como-sidecar-de-tauri.md) reemplazó el backend
> remoto por un sidecar local de Tauri, porque tres hechos posteriores invalidaron las
> premisas de acá: los modelos locales se cambiaron por un proveedor externo, la
> aplicación web dejó de ser prioridad, y el servidor Hono existente resultó más barato
> de empaquetar que de transformar en servicio.
>
> **Lo que sigue vigente de esta ADR:** el diagnóstico del CLI anterior, la separación
> entre interfaz y pipeline como repositorios distintos, y la restricción de que esta
> capa no contenga FFmpeg, modelos ni llamadas directas a proveedores.

## Problema

El proyecto anterior (**VIDEO ON CLICK**) era un CLI monolítico en Node + TypeScript que
corría 100% en la máquina del usuario. Un solo `src/orchestrator/pipeline.ts` orquestaba
seis fases —voz, transcripción, cortes, prompts, imágenes y render— y todo el estado
vivía en disco bajo `output/checkpoint/`. Funcionaba, pero no era un producto:

- **No había usuario final posible.** El guion se editaba como string de TypeScript en
  `src/core/datos-prueba.ts` y se disparaba con `npm run test:pipeline`. Eso es una
  herramienta de desarrollador, no algo que se le vende a un creador de contenido.
- **La instalación era prohibitiva.** La primera corrida descargaba ~5 GB
  (`whisper-cli`, el modelo `ggml-small.bin` y `Qwen2.5-7B-Instruct-Q4_K_M.gguf`) y
  exigía Homebrew y un FFmpeg compilado con `libass`/`libfreetype`. Soportaba macOS y
  Windows x64, y nada más.
- **El cómputo pesado caía sobre el equipo del usuario:** 5.5 GB de RAM solo para el
  modelo local, y tiempos de render que dependían por completo de su hardware.
- **Las claves vivían en un `.env` en texto plano**, con 28 variables que el usuario
  debía llenar a mano. No existía cuenta, ni sesión, ni forma de recuperar nada.
- **La interactividad era imposible.** La fase 2.5 preguntaba por TTY cuántas imágenes
  generar: un diálogo de terminal en mitad del proceso, que ninguna interfaz gráfica
  puede replicar.
- **Todo estaba acoplado.** Tocar la presentación significaba tocar el mismo repositorio
  que el render con FFmpeg, con el mismo ciclo de release.

Restricciones que acotaron las opciones:

- El producto tiene que llegar a **móvil**, no solo a escritorio.
- El modelo comercial es **BYO-keys**: el usuario aporta sus claves y el software solo
  orquesta. El costo variable no puede caer sobre quien vende.
- Quien continúe este código es, muchas veces, un agente de IA con contexto acotado:
  cuanto más chico y delimitado el repositorio, mejor el resultado.

## Decisión

**Partir el producto en tres piezas y reescribir la capa de presentación desde cero**,
en lugar de ponerle una interfaz encima al CLI existente.

1. **Este repositorio** — solo la interfaz: React 19 + TypeScript + Vite, empaquetada
   con Tauri 2 a aplicaciones nativas de Windows, macOS, Linux, iOS y Android.
2. **Backend aparte** (repositorio propio) — ejecuta las seis fases y guarda los
   artefactos. Hereda la lógica del CLI, no su forma de uso.
3. **Supabase** — registro, login y sesión.

La reescritura es total: no se migra código del CLI a este repositorio. Lo que se
conserva del proyecto anterior es el **flujo del producto** (las seis fases y su orden),
documentado en [ARCHITECTURE.md](../ARCHITECTURE.md), y las decisiones de dominio que
siguen vigentes (pipeline invertido, sin subtítulos, regeneración sanitizada), que
pasan a ser responsabilidad del backend.

### Forma

```
ANTES                                  AHORA

┌─────────────────────────┐            ┌──────────────────────┐
│ VIDEO ON CLICK          │            │ Vimo (este repo)     │
│ CLI en Node             │            │ React 19 + Tauri 2   │
│                         │            │ Win/macOS/Linux/     │
│ pipeline.ts             │            │ iOS/Android          │
│  ├ fase 1..6            │            └───┬──────────────┬───┘
│  ├ whisper.cpp local    │                │ sesión       │ HTTP
│  ├ Qwen 7B local        │                ▼              ▼
│  ├ FFmpeg local         │        ┌────────────┐  ┌──────────────┐
│  └ output/checkpoint/   │        │  Supabase  │  │  Backend     │
│                         │        │            │  │  fases 1..6  │
│ .env con 28 variables   │        └────────────┘  └──────┬───────┘
│ ~5 GB de descarga       │                               ▼
│ Mac y Win x64           │                        servicios externos
└─────────────────────────┘
```

| Capacidad             | Antes                              | Ahora                               |
| --------------------- | ---------------------------------- | ----------------------------------- |
| Cómo se usa           | Editar un `.ts` y correr un script | Interfaz gráfica                    |
| Plataformas           | macOS, Windows x64                 | Win, macOS, Linux, iOS, Android     |
| Instalación           | ~5 GB + Homebrew + FFmpeg          | Instalador nativo                   |
| Dónde corre el render | Equipo del usuario                 | Backend                             |
| Identidad             | No existe                          | Supabase                            |
| Configuración         | `.env` con 28 variables            | Pantalla de ajustes                 |
| Estado de un trabajo  | `output/checkpoint/` en disco      | Backend, consultado por la interfaz |

## Alternativas consideradas

- **Ponerle una interfaz al CLI existente** (Electron o Tauri sobre el mismo
  repositorio, que era el plan de la sección 8 del README anterior) — descartada: no
  resuelve ninguno de los problemas de fondo. El instalador seguiría pesando gigabytes,
  seguiría necesitando Homebrew y FFmpeg compilado, y **móvil quedaría afuera para
  siempre**. Solo esconde el CLI detrás de botones.
- **Ejecutar el pipeline dentro de Tauri, con Rust como _sidecar_** — descartada:
  obligaría a empaquetar, firmar y actualizar FFmpeg, Whisper y un modelo GGUF para cada
  plataforma. Todo el peso y toda la fricción, más el trabajo de portar la lógica a
  Rust. Móvil sigue sin ser viable.
- **Monorepo con la interfaz y el backend juntos** — descartada _por ahora_: los ciclos
  de release son distintos (la interfaz se distribuye como binario firmado, el backend se
  despliega), y un repositorio chico rinde mejor con agentes de IA. Se reconsideraría si
  coordinar cambios entre ambos lados empieza a doler más que mantenerlos separados.
- **Backend propio también para la autenticación**, en lugar de Supabase — descartada:
  construir registro, sesión, recuperación de contraseña y verificación de correo es
  semanas de trabajo que no diferencian al producto.

## Consecuencias

- ✅ El producto llega a móvil y a Linux, plataformas que antes eran imposibles.
- ✅ La instalación pasa de ~5 GB y dependencias del sistema a un instalador nativo.
- ✅ El render deja de depender del hardware del usuario.
- ✅ Este repositorio queda chico y con un solo propósito: se navega y se revisa
  entero, tanto por una persona como por un agente.
- ⚠️ **Aparece un costo de servidor** que antes no existía: el cómputo que pagaba el
  hardware del usuario ahora lo paga la infraestructura. El modelo BYO-keys cubre las
  APIs externas, no el CPU del render.
- ⚠️ **El producto deja de funcionar sin conexión.** El CLI corría entero en local; la
  app no genera nada sin backend.
- ⚠️ **Las claves del usuario se mueven de su máquina al backend.** Eso cambia el
  problema de seguridad por completo y hay que resolverlo antes de la primera versión
  pública.
- ⚠️ Hay que mantener y desplegar tres piezas en lugar de una, y coordinar cambios entre
  dos repositorios.
- 🔒 Este repositorio **no puede** volver a contener FFmpeg, modelos de IA, llamadas
  directas a proveedores (Groq, Fal, ElevenLabs, Whisper, Deepgram) ni claves de esos
  servicios. Si un cambio los necesita, va en el backend.
- 🔒 Toda comunicación con el exterior pasa por la cadena
  `componente → hook → api/ → fetcher`, sin atajos.

## Verificación de cumplimiento

- **Guard pendiente de implementar** (CI y local): fallar si `package.json` incorpora
  cualquier dependencia de la lista negra —`ffmpeg`, `whisper`, `llama`, `groq`, `fal`,
  `elevenlabs`, `deepgram`, `yt-dlp`— o si aparece un patrón de clave de proveedor en
  `src/`. Es el chequeo que hace ejecutable esta ADR; sin él, la frontera es solo una
  intención escrita.
- **Hoy:** el cumplimiento se apoya en la revisión de PR y en la lista explícita de
  prohibidos de [ARCHITECTURE.md](../ARCHITECTURE.md) §1. No hay tests en el repositorio
  todavía.
- **Cómo se vería una regresión:** un `import` de una SDK de proveedor dentro de `src/`,
  una clave de API en el bundle de `dist/`, o un componente llamando a `fetch` sin pasar
  por `api/`.

## Modos de falla

- **Backend caído o sin conexión:** la interfaz tiene que decirlo explícitamente y no
  permitir arrancar una generación que va a fallar. No hay modo degradado: sin backend
  no hay video.
- **Trabajo interrumpido:** el estado vive en el backend. Si la app se cierra a mitad de
  una generación, al reabrir consulta los trabajos en curso y retoma la vista de
  progreso. La interfaz no guarda progreso propio que pueda quedar desincronizado.

## Fuera de alcance

Cada uno merece su propia ADR cuando toque decidirlo:

- El **contrato HTTP** con el backend y **cómo llega el progreso** (consultas
  periódicas, SSE o WebSocket). Es el siguiente bloqueo real.
- **Dónde y cómo se guardan las claves del usuario** bajo el modelo BYO-keys.
- El diseño interno del backend, que pertenece a su propio repositorio.
- Firma de binarios, distribución y actualizaciones automáticas.
- El esquema de versionado del producto (el `HISTORICO_DE_CAMBIOS.md` del proyecto
  anterior no se migró).

## Referencias

- README del proyecto anterior, VIDEO ON CLICK (secciones 2, 3, 9 y 10), aportado por
  el autor como registro del estado previo. **No está versionado en este repositorio**:
  el original vive en el repositorio del CLI, y conviene rescatarlo antes de archivarlo,
  porque contiene la tabla de costos por video, las 28 variables de entorno, el esquema
  de `output/checkpoint/` y las 11 decisiones de dominio del pipeline.
- [docs/ARCHITECTURE.md](../ARCHITECTURE.md) — la forma resultante, en detalle.
