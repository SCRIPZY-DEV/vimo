# ADR-0030 — Proveedores unificados en un servidor de Vimo y créditos propios

- **Estado:** Propuesta
- **Fecha:** 2026-09-11
- **Área:** pipeline | providers | app
- **Reemplazará a:** [ADR-0011](ADR-0011-claves-de-api-byo-en-keychain.md) (claves BYO), parte de [ADR-0029](ADR-0029-saldo-por-proveedor-precheck-y-pausa-retomable.md) (saldo por proveedor)

## Problema

Con claves propias (BYO-keys) la persona tiene que abrir cuenta en cuatro a seis
proveedores, cargar saldo en cada uno y entender unidades distintas (dólares en Fal,
créditos en Evolink y DubVoice, caracteres en ElevenLabs, ninguna lectura en DeepInfra
y Deepgram). Es fricción de onboarding y es el motivo por el que el pre-check de
ADR-0029 es heterogéneo: una fila por proveedor, cada una con su unidad, y dos
cuentas que solo fallan al gastar.

Restricciones:

- El render sigue siendo **local**: FFmpeg viaja con la app (ADR-0002) y el costo de
  infraestructura de renderizar en la nube no se justifica.
- Todo artefacto queda en la máquina de la persona, en la carpeta del proyecto
  (ADR-0009): el servidor no guarda videos.
- Lo ya construido sobre stages y checkpoints (ADR-0013/0014) se conserva: una fase
  retomable sigue siéndolo.

## Decisión

Eventualmente, **las llamadas a proveedores (LLM, TTS, transcripción, imágenes, música)
se unifican detrás de un servidor de Vimo**. La persona paga **créditos de Vimo** (un
saldo único, una unidad) y **deja de cargar claves de proveedores**: las pone Vimo. El
sidecar conserva solo lo local: **FFmpeg** (chunks, concat, mezcla, subtítulos, render),
el **ensamblado del proyecto en disco** (`project.json`, `scenes.json`, checkpoints) y
la **descarga de los assets generados** (audio, imágenes, música) a la carpeta del
proyecto.

### Forma

| Capa                                                                                 | Hoy (ADR-0011/0029)                                                                                                                                                                 | Después                                                                                                  |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `pipeline/providers/*`                                                               | Un cliente HTTP por proveedor con la clave del usuario                                                                                                                              | Un cliente del servidor de Vimo con la sesión del usuario (Supabase, ADR-0006); los providers se retiran |
| `pipeline/stages/*`                                                                  | Llaman al provider y escriben el artefacto                                                                                                                                          | Mismo contrato (`Stage`, `skip()`, artefactos): piden al servidor y **descargan** el resultado a disco   |
| `pipeline/stages/render/*` + `utils/ffmpeg.ts`                                       | Local                                                                                                                                                                               | Local, sin cambios                                                                                       |
| `api-keys` (UI) y `src-tauri/src/api_keys/`                                          | Catálogo, keychain, `job.apiKeys`                                                                                                                                                   | Obsoletos: `job.apiKeys` vacío; el módulo se retira del sidebar                                          |
| `get-*-credits`                                                                      | Uno por proveedor, unidades distintas                                                                                                                                               | Un solo saldo de Vimo (subcomando único o lectura directa desde `src/` vía edge function de vimo.click)  |
| Códigos `*_insufficient_credits`                                                     | Una familia por dominio                                                                                                                                                             | **Un** código `insufficient_credits`; la UI ya mapea por familia, así que colapsar no rompe nada         |
| `pauseReason: 'insufficient-credits'`, badge «Sin créditos», reanudar con re-chequeo | Se conservan **tal cual**: por eso ADR-0029 diseñó `CreditsShortfallLine` y `compareCostLines` agnósticos del proveedor — cambia quien arma la fila, no la UI ni el estado en disco |                                                                                                          |
| Estimación (`estimateCreateCost`, `estimateResumeCost`)                              | Precios por proveedor en la UI                                                                                                                                                      | El servidor tarifa antes de ejecutar: la estimación pasa a ser exacta y en una sola unidad               |

## Alternativas consideradas

- **Seguir con BYO-keys** — descartada como destino: fricción de onboarding y
  estimación heterogénea. Sigue siendo el modelo vigente hasta que exista el servidor.
- **Mover también el render al servidor** — descartada: costo de infraestructura y
  contradice ADR-0002 (el video se arma en la máquina de la persona).
- **Híbrido: créditos de Vimo con claves propias opcionales** — descartada por ahora:
  dos modelos de cobro duplican el pre-check, el mapa de errores y el soporte. Podría
  volver si un segmento de usuarios exige claves propias por costo o cumplimiento.

## Consecuencias

- ✅ Un solo saldo, una unidad, pre-check exacto, sin claves en el keychain ni en el
  `PipelineJob`.
- ✅ `pipeline/` se achica a lo que solo puede correr local; los guards de «regla de
  oro» de los proveedores pagos (E26/E27) pasan al servidor, donde se auditan una vez.
- ⚠️ Infraestructura y costo operativo propios; dependencia de red para todo menos el
  render; latencia de descarga de assets.
- ⚠️ Migración: usuarios con claves cargadas y proyectos a medias con `imageTask`
  persistidos de Evolink; el flujo de recarga pasa de «la página del proveedor» a
  «vimo.click».
- 🔒 Desde que esta ADR pase a **Aceptada**: no se agregan proveedores nuevos en
  `pipeline/providers/` ni claves nuevas en `api-keys` sin pasar por el servidor.

## Verificación de cumplimiento

Al implementarse:

- **Guards:** regla ESLint que prohíba `fetch` a dominios de proveedores fuera del
  cliente del servidor; `PipelineJob.apiKeys` sin claves en el contrato; `pnpm build`;
  `pnpm check:locales`.
- **Manual:** `run-video-pipeline` con saldo de Vimo en cero deja `paused` +
  `insufficient-credits` (mismo síntoma y misma UI que ADR-0029); un job completo no
  hace ninguna llamada a `api.evolink.ai`, `fal.run`, `dubvoice.ai`, `elevenlabs.io`,
  `deepinfra.com` ni `deepgram.com` desde la máquina.
- **Cómo se vería una regresión:** una clave de proveedor pedida en la UI; un
  `PipelineJob` con `apiKeys` poblado.

## Fuera de alcance

- Fechas, precio del crédito, planes y el diseño del servidor.
- Migración de usuarios con claves cargadas: se decide cuando el servidor exista.
