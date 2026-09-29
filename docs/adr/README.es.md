# ADRs — Architecture Decision Records de Vimo

[English](/docs/adr/README.md) · **Español**

> Registro **en el repo** de las decisiones de arquitectura que gobiernan el código.
> Es la memoria de largo plazo para cualquier persona o IA que desarrolle acá:
> antes de tocar un área, buscá si hay una ADR que la gobierne.

## Regla de oro: una ADR no es prosa, es un contrato verificable

Cada ADR declara **qué decide**, **por qué** (incluyendo lo que se descartó y por qué),
y — lo que la hace útil de verdad — **cómo se verifica que se cumple**: los tests, guards
o evidencia que demuestran que la decisión funciona, y cómo se detectaría una regresión.
Una ADR sin verificación ejecutable es una opinión, no un registro.

El otro criterio: una ADR se lee en **menos de cinco minutos**. Si no entra, el problema
es el alcance de la decisión, no el largo del documento — probablemente sean dos ADRs.

## Convención

- Un archivo por decisión: `ADR-NNNN-slug-corto.md` (numeración correlativa, 4 dígitos).
- Plantilla: [TEMPLATE.es.md](TEMPLATE.es.md). Las secciones marcadas `(obligatoria)`
  siempre se llenan; las `(opcional)` se borran si no aplican.
- **Estados:** `Propuesta` → `Aceptada` → (`Reemplazada por ADR-XXXX` | `Obsoleta`).
  Nunca se borra una ADR: si una decisión cambia, se escribe la nueva y la vieja se
  marca como reemplazada, con el link a la que la sustituye. El historial de decisiones
  descartadas es la mitad del valor de esta carpeta.
- **Idioma:** las ADRs se escriben en **español**, un solo archivo por decisión (no se
  traducen: un registro duplicado se desincroniza). Este README y la plantilla sí están
  en los dos idiomas, para que el proceso sea legible para cualquiera.

## Cuándo escribir una ADR

- La decisión afecta a más de un módulo, al contrato entre capas (React ⇄ Tauri), o a lo
  que recibe el usuario final (formato de la distribución portable, seguridad, providers).
- Hay un trade-off real entre alternativas y el «por qué» va a importar en 6 meses.
- Un bug de raíz arquitectónica obliga a fijar un patrón para que no vuelva a pasar.
- Cambio de arquitecturas o flujos de trabajo requieren una ADR.

**Cuándo NO:** cambios de un solo archivo, correcciones de estilo, dependencias de rutina,
o cualquier cosa que el propio código ya explica. Una ADR que nadie va a consultar solo
agrega ruido.

## Índice

| ADR                                                                                      | Título                                                                          | Estado                   | Área                          |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------ | ----------------------------- |
| [ADR-0045](ADR-0045-prefijo-animado-por-parejas-y-fase-propia.md)                        | Prefijo animado por parejas y fase propia                                       | Aceptada                 | pipeline / app                |
| [ADR-0042](ADR-0042-animacion-kie-por-intervalos-y-recibos.md)                           | Animación Kie por intervalos, recibos y respaldo automático                     | Aceptada                 | pipeline / editor             |
| [ADR-0041](ADR-0041-animacion-motor-del-tablero-prompt-con-vision-y-clip-como-bloque.md) | Motor de animación y clip como bloque (histórico)                               | Reemplazada por ADR-0042 | pipeline / editor             |
| [ADR-0040](ADR-0040-animacion-de-escenas-el-clip-canjea-huecos.md)                       | Animación de escenas por intervalos (histórico)                                 | Reemplazada por ADR-0042 | pipeline / editor             |
| [ADR-0039](ADR-0039-catalogo-sobre-el-carril-de-mi-estilo.md)                            | Los estilos del Catálogo migrarán al carril de «Mi estilo» (a futuro)           | Propuesta                | pipeline / Catálogo           |
| [ADR-0038](ADR-0038-logs-de-diagnostico-por-ejecucion-en-supabase.md)                    | Logs de diagnóstico por ejecución, subidos a Supabase                           | Aceptada                 | app / pipeline / soporte      |
| [ADR-0037](ADR-0037-permiso-en-runtime-sobre-la-carpeta-de-proyectos.md)                 | Permiso en runtime sobre la carpeta de proyectos                                | Aceptada                 | app / seguridad               |
| [ADR-0036](ADR-0036-prompts-de-catalogo-sin-relleno.md)                                  | Prompts de Catálogo con rotación y sin relleno                                  | Aceptada                 | pipeline / app                |
| [ADR-0035](ADR-0035-recibos-de-voz-y-previews-interactivas.md)                           | Recibos locales de voz y previews interactivas                                  | Aceptada                 | app / pipeline / providers    |
| [ADR-0034](ADR-0034-distribucion-macos-intel-y-targets-de-release-declarativos.md)       | Distribución en macOS Intel y targets de release declarativos                   | Aceptada                 | distribución                  |
| [ADR-0033](ADR-0033-personajes-con-foto-la-imagen-subida-como-identidad.md)              | Personajes con foto: la imagen subida como identidad                            | Aceptada                 | pipeline / app                |
| [ADR-0032](ADR-0032-proveedores-en-servidor-y-creditos-de-vimo.md)                       | Proveedores unificados en un servidor de Vimo y créditos propios                | Propuesta                | pipeline, providers, app      |
| [ADR-0031](ADR-0031-saldo-por-proveedor-precheck-y-pausa-retomable.md)                   | Saldo por proveedor: pre-check antes de gastar y pausa retomable al agotarse    | Aceptada                 | app, pipeline, providers      |
| [ADR-0030](ADR-0030-pack-v3-historias-short-y-narracion-precargada.md)                   | Pack v3 de la demo: historias en Short y narración pre-cargada                  | Aceptada                 | app / pipeline                |
| [ADR-0029](ADR-0029-modo-demo-pipeline-simulado-sobre-pack-prehecho.md)                  | Modo demo: pipeline simulado sobre un pack pre-hecho, acceso por vimo.click     | Aceptada                 | app / pipeline                |
| [ADR-0028](ADR-0028-bloqueo-temporal-de-modelos-de-prompts.md)                           | Bloqueo temporal de los modelos de prompts que se traban o fallan               | Aceptada                 | app, pipeline                 |
| [ADR-0027](ADR-0027-actualizaciones-automaticas-tauri-updater.md)                        | Actualizaciones automáticas con tauri-plugin-updater y manifiesto en vimo.click | Aceptada                 | distribución                  |
| [ADR-0026](ADR-0026-distribucion-windows-instalador-nsis.md)                             | Distribución en Windows: instalador NSIS construido en GitHub Actions           | Aceptada                 | distribución                  |
| [ADR-0025](ADR-0025-troceo-universal-de-tts-y-tope-de-90k.md)                            | Troceo universal de TTS por motor y tope total de 90 000 caracteres             | Aceptada                 | providers / pipeline / app    |
| [ADR-0024](ADR-0024-dos-proveedores-de-voces-dubvoice-y-elevenlabs-directo.md)           | Dos proveedores de voces: DubVoice y ElevenLabs directo                         | Aceptada                 | providers / pipeline / app    |
| [ADR-0023](ADR-0023-una-entrada-de-keychain-y-firma-estable.md)                          | Una sola entrada del keychain para todas las claves y firma estable             | Aceptada                 | seguridad / distribución      |
| [ADR-0022](ADR-0022-modelo-de-prompts-como-preferencia.md)                               | El modelo de prompts es una preferencia, no la última elección                  | Aceptada                 | app                           |
| [ADR-0020](ADR-0020-selector-de-modelo-y-personaje-de-la-gema.md)                        | Selector de modelo, simulador de costos y personaje de la gema                  | Aceptada                 | pipeline / app                |
| [ADR-0019](ADR-0019-carril-verbatim-y-segundos-por-escena.md)                            | Carril verbatim y segundos por escena de los estilos propios                    | Aceptada                 | pipeline / app                |
| [ADR-0018](ADR-0018-estilos-visuales-propios-fase-basica.md)                             | Estilos visuales propios («Mi estilo»), fase básica                             | Aceptada                 | pipeline / app                |
| [ADR-0017](ADR-0017-formato-de-video-16-9-y-9-16.md)                                     | Formato de video 16:9 / 9:16 de punta a punta                                   | Aceptada                 | pipeline / app                |
| [ADR-0016](ADR-0016-adopcion-del-rediseno-de-vimo-dev-por-ramas.md)                      | Adopción del rediseño de vimo_dev por ramas                                     | Aceptada                 | proceso                       |
| [ADR-0015](ADR-0015-fal-solo-gpt-image-2.md)                                             | Fal genera solo con gpt-image-2: retiro de Flux                                 | Aceptada                 | providers                     |
| [ADR-0013](ADR-0013-modulo-create-runner-de-stages-y-binarios.md)                        | Create: runner de stages, confirmación de escenas y binarios empaquetados       | Aceptada                 | pipeline / app / distribución |
| [ADR-0012](ADR-0012-primitivas-del-runner-y-contratos-cerrados.md)                       | Primitivas del runner y contratos cerrados en el pipeline                       | Propuesta                | pipeline                      |
| [ADR-0011](ADR-0011-claves-api-en-keychain-con-fuente-abstracta.md)                      | Claves API en el keychain del SO detrás de una fuente abstracta                 | Aceptada                 | seguridad                     |
| [ADR-0010](ADR-0010-pipeline-por-stages-y-migracion-por-modulos.md)                      | Pipeline por stages como sidecar Node y migración por módulos                   | Aceptada                 | pipeline                      |
| [ADR-0009](ADR-0009-preferencias-nativas-y-carpeta-raiz.md)                              | Preferencias nativas con plugins y carpeta raíz única                           | Aceptada                 | app                           |
| [ADR-0008](ADR-0008-catalogo-de-costos-local.md)                                         | Catálogo de costos como dataset local del cliente                               | Aceptada                 | app                           |
| [ADR-0007](ADR-0007-invoke-reemplaza-al-servidor-local.md)                               | invoke() de Tauri reemplaza al servidor local                                   | Aceptada                 | distribución                  |
| [ADR-0006](ADR-0006-autenticacion-doble-flujo-oauth-y-gate-por-loaders.md)               | Autenticación: doble flujo OAuth y gate por loaders                             | Aceptada                 | app                           |
| [ADR-0005](ADR-0005-layouts-explicitos-y-modulos-base.md)                                | Layouts explícitos (Authenticated/Guest) y módulos base                         | Aceptada                 | app                           |
| [ADR-0004](ADR-0004-i18n-con-i18next.md)                                                 | i18n con i18next y catálogos JSON por idioma                                    | Aceptada                 | app                           |
| [ADR-0003](ADR-0003-fundaciones-de-la-interfaz.md)                                       | Fundaciones de la interfaz: portar la capa común original                       | Aceptada (i18n → 0004)   | app                           |
| [ADR-0002](ADR-0002-servidor-local-como-sidecar-de-tauri.md)                             | El servidor local se empaqueta como sidecar de Tauri                            | Reemplazada por ADR-0007 | distribución                  |
| [ADR-0001](ADR-0001-separacion-interfaz-y-pipeline.md)                                   | Separar la interfaz del pipeline y reescribirla desde cero                      | Reemplazada por ADR-0002 | app                           |

## Nota sobre distribución

Esta carpeta —y todo `docs/`— **nunca viaja dentro de la app**: Tauri empaqueta
únicamente `dist/` (`frontendDist` en [src-tauri/tauri.conf.json](/src-tauri/tauri.conf.json))
más los iconos. La única forma de que documentación termine en el binario es ponerla en
`public/`, que Vite copia a `dist/`. No lo hagas.
