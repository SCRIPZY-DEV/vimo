# ADR-0002 — El servidor local se empaqueta como sidecar de Tauri

- **Estado:** Reemplazada por [ADR-0007](ADR-0007-invoke-reemplaza-al-servidor-local.md)
- **Fecha:** 2026-08-11
- **Área:** distribución
- **Reemplaza a:** [ADR-0001](ADR-0001-separacion-interfaz-y-pipeline.md)

## Problema

La [ADR-0001](ADR-0001-separacion-interfaz-y-pipeline.md) decidió mover el pipeline a un
backend remoto. Tres hechos posteriores invalidaron sus premisas:

1. **Los modelos locales salieron de la ecuación.** Whisper y el LLM local se
   reemplazaron por un proveedor externo. Con eso desaparecen los ~5 GB de descarga
   inicial, los 5.5 GB de RAM por trabajo, los módulos nativos (`node-llama-cpp`) y todo
   el código de auto-setup. **Lo único que sigue necesitando cómputo local es FFmpeg.**
2. **La aplicación web dejó de ser prioridad.** Hoy solo importa que funcione en local.
3. **La gestión de archivos y rutas se hace con la API de filesystem de Tauri.**

El argumento central de la ADR-0001 —«el cómputo pesado no puede caer sobre el equipo
del usuario»— se sostenía sobre modelos de 7 mil millones de parámetros corriendo en su
máquina. Sin ellos queda un ensamblaje de FFmpeg, que cualquier laptop hace sin
problemas. Y el backend remoto pasa a cobrar despliegue, autenticación de API, cifrado
de claves y el CPU del render, sin resolver ningún problema que exista hoy.

Además, un hecho que la ADR-0001 subestimó: **el servidor Hono ya existe y funciona**.
Convertirlo en servicio remoto era transformarlo; empaquetarlo es compilarlo.

Restricciones que acotaron las opciones:

- El modelo comercial es BYO-keys: el costo variable no puede caer sobre quien vende.
- Una generación dura minutos, no segundos.
- El equipo son dos personas.

## Decisión

**Empaquetar el servidor Hono existente como _sidecar_ de Tauri**, junto con FFmpeg como
segundo binario. La aplicación deja de necesitar infraestructura: todo corre en la
máquina del usuario, y los únicos costos son las APIs de los proveedores, que paga él.

Cómo se materializa:

- Los dos binarios se declaran en `bundle.externalBin` de `src-tauri/tauri.conf.json`,
  **con el sufijo del target triple** en el nombre del archivo. Cada instalador lleva
  solo el binario de su plataforma.
- Se agrega `tauri-plugin-shell` a `src-tauri/Cargo.toml` y el permiso de sidecar a
  `src-tauri/capabilities/`.
- El servidor se compila a **binario único** con `bun build --compile`, posible ahora que
  no hay módulos nativos.
- **Tauri decide el _dónde_**: elige el directorio de trabajo dentro del directorio de
  datos de la aplicación, y expone el diálogo nativo para que el usuario guarde el MP4
  final donde quiera. **El sidecar decide el _qué_**: recibe ese directorio y la ruta de
  FFmpeg como parámetros al arrancar, y deja de asumir un `output/` relativo.
- **La SPA no escribe artefactos del pipeline.** Usa la API de filesystem de Tauri solo
  para leer el resultado, revelarlo en el explorador y guardarlo.
- **Sin cola, sin base de datos y sin autenticación de API**: una generación a la vez, y
  el `output/checkpoint/` que el pipeline ya escribe es el estado del trabajo. Ya
  resuelve reanudar tras una interrupción.
- FFmpeg se empaqueta en **build LGPL con codificadores por hardware** (VideoToolbox,
  NVENC/QSV/AMF, VAAPI), evitando x264. Esquiva el problema de licencia GPL en un
  producto que se vende, y además rinde varias veces más.

### Forma

```
┌──────────────────────────────────────────────┐
│  Aplicación Tauri                            │
│                                              │
│  ┌────────────────┐   HTTP a 127.0.0.1:PUERTO│
│  │  SPA (React)   │ ───────────────┐         │
│  └────────────────┘                │         │
│         │ API de fs y diálogos     ▼         │
│         │                  ┌────────────────┐│
│         │                  │ sidecar: Hono  ││
│         ▼                  │ fases 1..6     ││
│  ┌────────────────┐        └───┬─────────┬──┘│
│  │ Rust: lanza y  │            │         │   │
│  │ mata sidecars  │            │  invoca │   │
│  └────────────────┘            │         ▼   │
│                                │  ┌──────────┐│
│                                │  │ sidecar: ││
│                                │  │ FFmpeg   ││
│                                │  └──────────┘│
└────────────────────────────────┼──────────────┘
                                 ▼
                   proveedores externos (claves del usuario)
```

### Flujo de datos

1. Tauri arranca, lanza el sidecar pasándole un puerto libre, el directorio de trabajo y
   la ruta de FFmpeg.
2. El sidecar informa su puerto y queda escuchando; la SPA espera un _health check_
   antes de la primera petición.
3. El usuario dispara la generación: la SPA hace `POST`, recibe un id **al instante** y
   consulta el progreso periódicamente.
4. El sidecar ejecuta las seis fases, llamando a los proveedores externos y a FFmpeg, y
   escribe artefactos y checkpoint en el directorio que recibió.
5. Al terminar, la SPA lee el MP4 y ofrece guardarlo con el diálogo nativo.
6. Al cerrar la aplicación, Rust mata el sidecar.

## Alternativas consideradas

- **Backend remoto dockerizado** (lo que decidió la ADR-0001) — descartada: hoy solo
  cobra costos. Volvería a la mesa si móvil o la web pasan a ser prioridad; el servidor
  se escribe de forma que pueda dockerizarse sin reescribirlo.
- **Portar el pipeline a comandos Rust** (`invoke`) — descartada: elimina el puerto y el
  riesgo de procesos huérfanos, pero es reescribir en Rust código TypeScript que ya
  funciona.
- **Mover la orquestación dentro de la SPA**, usando las APIs de Tauri — descartada:
  tentador ahora que casi todo son llamadas HTTP, pero un trabajo de 15 minutos moriría
  con la ventana o con un fallo de la webview, y obligaría a reescribir todo el uso de
  `fs` y `child_process`.
- **FFmpeg**: exigir que el usuario lo instale (inaceptable para consumo), `ffmpeg.wasm`
  (órdenes de magnitud más lento en 1920×1080 y limitado por memoria), _bindings_ de Rust
  (compilación cruzada y licencias sin ganancia), o delegar el render a una API (única
  vía hacia móvil, pero se come el margen). Descargarlo en el primer arranque queda como
  plan B si el tamaño del instalador molesta: son 80 MB, no 5 GB.

## Consecuencias

- ✅ **Cero infraestructura y cero costo fijo.** Con BYO-keys cubriendo las APIs y el
  render corriendo gratis en la máquina del usuario, se recupera el margen que era la
  premisa del negocio.
- ✅ El trabajo del compañero se reduce a empaquetar algo que ya funciona, en vez de
  transformarlo en servicio.
- ✅ Las claves del usuario no salen de su máquina: desaparece el problema de seguridad
  que abría el backend remoto.
- ✅ Nada pesado viaja por la red: las imágenes y el audio se ensamblan donde ya están.
- ⚠️ **Móvil queda fuera**, y ahora es FFmpeg lo único que lo impide.
- ⚠️ El instalador pesa ~100-150 MB, y hay que compilar y firmar binarios por plataforma.
- ⚠️ Actualizar el pipeline exige publicar una versión nueva de la aplicación.
- ⚠️ Aparecen fallos propios de este patrón: procesos huérfanos, colisiones de puerto y
  carreras de arranque. Se previenen en la Decisión, pero hay que sostenerlos.
- 🔒 El sidecar **no puede** asumir rutas propias: el directorio de trabajo y la ruta de
  FFmpeg siempre llegan desde Tauri.
- 🔒 La SPA sigue sin poder contener FFmpeg, modelos ni llamadas directas a proveedores
  (restricción heredada de la ADR-0001, que sigue vigente).

## Verificación de cumplimiento

- **La prueba real:** en una máquina limpia de cada plataforma, instalar y generar un
  video de punta a punta sin instalar nada más. Es lo que demuestra que el empaquetado
  funciona; ningún test unitario lo sustituye.
- **Sin procesos huérfanos:** tras cerrar la aplicación, no debe quedar ningún proceso
  del sidecar. Se comprueba en cada release de las tres plataformas.
- **Frontera de la SPA:** sigue vigente el guard propuesto en la ADR-0001 — fallar si
  `package.json` incorpora dependencias de proveedores o de FFmpeg.
- **Cómo se vería una regresión:** un puerto fijo escrito a mano, el sidecar
  construyendo rutas por su cuenta, un sidecar que sobrevive al cierre de la aplicación,
  o la primera petición fallando por dispararse antes del _health check_.

## Modos de falla

- **El sidecar no arranca o no responde el _health check_:** la aplicación lo dice
  explícitamente y no permite disparar una generación. No hay modo degradado.
- **FFmpeg ausente o incompatible:** se detecta al arrancar, no en la fase 6 después de
  quince minutos de trabajo.
- **La aplicación se cierra durante una generación:** el sidecar muere con ella y el
  trabajo se interrumpe. Al reabrir, el `checkpoint` permite retomar desde la última fase
  completada. Conviene advertirlo antes de cerrar.

## Fuera de alcance

- Móvil, y con él delegar el render a un proveedor externo. Es una decisión de costo, no
  técnica, y necesita cotizaciones antes de evaluarse.
- Despliegue web del servidor: posible más adelante sin reescribirlo, pero no se
  construye ahora.
- Firma de binarios, distribución y actualizaciones automáticas.
- Varias generaciones concurrentes.

## Referencias

- [ADR-0001](ADR-0001-separacion-interfaz-y-pipeline.md) — la decisión que esta
  reemplaza, y el registro de por qué primero se pensó en un backend remoto.
- [docs/ARCHITECTURE.md](../ARCHITECTURE.md) — describe todavía la arquitectura de la
  ADR-0001 y debe actualizarse a esta.
