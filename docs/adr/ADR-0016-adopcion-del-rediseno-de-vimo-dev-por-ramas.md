# ADR-0016 — Adopción del rediseño de vimo_dev por ramas ordenadas

- **Estado:** Aceptada
- **Fecha:** 2026-08-30
- **Área:** app
- **Actualiza a:** [ADR-0013](ADR-0013-modulo-create-runner-de-stages-y-binarios.md)
  (la decisión 4 «siempre renderizar» se revierte con la rama de auto-export) y
  [ADR-0009](ADR-0009-preferencias-nativas-y-carpeta-raiz.md) (la carpeta raíz gana
  `_styles/` con la rama de estilos propios).

## Problema

El repositorio de origen (`02-vimo/cursor-video`, rama `vimo_dev`) está 56 commits y
+63 511 líneas por delante de su `main`, con un rediseño de la vista Crear, la vista
de Progreso y el panel del editor, más features nuevas de pipeline: formato 9:16 de
punta a punta, estilos visuales propios («Mi estilo»), auto-export, y precios/créditos
en los selectores de imagen. Este repositorio (el port Tauri, migración de ADR-0010
completa) no tiene nada de eso.

Portarlo de una vez es inviable: el volumen hace imposible una revisión de código
seria, y el dueño del repo revisa cada cambio al pie de la letra.

Restricciones:

- Cada cambio debe poder revisarse aislado: una rama por cambio, con PR a `dev`, y
  cada rama dividida en fases que compilan y se verifican por separado.
- El orden de las ramas va de menor a mayor dificultad, para que la maquinaria de
  revisión se caliente con diffs chicos antes de los cambios de pipeline.
- Las convenciones de este repo mandan sobre las del origen (CLAUDE.md: código en
  inglés, i18n en 3 catálogos, cadena componente → hook → api/ → fetcher, nada de
  `process.env` en `pipeline/`).

## Decisión

**El rediseño se adopta en 12 ramas independientes, ordenadas por dificultad, cada
una en fases pequeñas.** El roadmap completo con archivos y verificaciones por fase
vive en el plan de trabajo acordado; este es el mapa:

| #   | Rama                                  | Cambio                                                              | Pipeline |
| --- | ------------------------------------- | ------------------------------------------------------------------- | -------- |
| 0   | `docs/adr-0016-rediseno-vimo-dev`     | esta ADR                                                            | no       |
| 1   | `feat/create-neutral-sections`        | quitar el wrapper saffron; tarjetas neutras por sección             | no       |
| 2   | `feat/create-narration-voice-restyle` | look nuevo de Narración y Voz (picker con estado dashed)            | no       |
| 3   | `feat/default-scene-count-setting`    | escenas por defecto como preferencia en Ajustes                     | no       |
| 4   | `feat/style-catalog-thumbnails`       | miniaturas de los 5 estilos del catálogo                            | no       |
| 5   | `feat/create-costs-credits`           | precios por opción + badges de créditos en Create                   | no       |
| 6   | `feat/auto-export`                    | checkbox de auto-export (default off → editor)                      | sí       |
| 7   | `feat/progress-redesign`              | progreso en dos columnas, una-fase-un-panel, pausa honesta          | leve     |
| 8   | `feat/video-format`                   | 16:9 / 9:16 de punta a punta (ADR propia)                           | sí       |
| 9   | `feat/custom-styles-basic`            | estilos propios básicos (ADR propia)                                | sí       |
| 10  | `feat/custom-styles-verbatim`         | carril verbatim + segundos por escena (ADR propia)                  | sí       |
| 11  | `feat/prompt-model-selector`          | selector de modelo LLM + simulador de costos + personaje de la gema | sí       |

Decisiones globales que gobiernan las ramas:

1. **Mi estilo se porta por etapas** (9 → 10 → 11): primero el CRUD de estilos
   integrado a las stages actuales; el motor verbatim y el selector de modelo
   después. Cada etapa es usable por sí sola.
2. **Escenas por defecto**: preferencia en Ajustes que siembra el formulario de
   Create; el campo sigue siendo editable por video.
3. **Auto-export default off**: al terminar la generación se va al editor y el
   render se dispara desde ahí (revierte la decisión 4 de ADR-0013; el contrato
   `autoRender` ya existía reservado).
4. Dependencias de orden: 5 → 8 (el formato filtra opciones que ya llevan precio),
   7 → 8 (la grilla format-aware se apoya en la grilla rediseñada), 9 → 10 → 11.

## Alternativas consideradas

- **Port monolítico (una rama con todo)** — rechazado: la revisión al pie de la
  letra de +60k líneas no ocurre; los errores pasan.
- **No portar y dejar divergir los repos** — rechazado: el origen es el laboratorio
  de producto; cuanto más tarde el port, más caro (ya pasó con la migración inicial
  de ADR-0010).
- **Portar en orden de valor de producto (Mi estilo primero)** — rechazado: los
  cambios grandes de pipeline se revisan mejor cuando las ramas chicas ya
  establecieron los patrones (secciones, i18n, harness) sobre los que se montan.

## Consecuencias

- ✅ Cada PR es revisable en una sentada; las fases compilan y se verifican solas.
- ✅ Los patrones de las ramas fáciles (tarjetas neutras, precios, harness) quedan
  establecidos antes de que lleguen los cambios de pipeline que los usan.
- ⚠️ El orden por dificultad retrasa las features de más valor (Mi estilo llega al
  final); es el costo aceptado de la revisabilidad.
- ⚠️ Mientras el roadmap avanza, el origen sigue moviéndose: al cerrar la rama 11
  hay que re-comparar contra `vimo_dev` y decidir si hay una segunda tanda.
  > **Cierre del roadmap (2026-09-02):** las 12 ramas están implementadas; la 11
  > cerró con [ADR-0020](ADR-0020-selector-de-modelo-y-personaje-de-la-gema.md).
  > La re-comparación contra `vimo_dev` queda como tarea abierta.
- 🔒 Ningún cambio del rediseño entra fuera de su rama del mapa; si un cambio nuevo
  del origen aparece a mitad de camino, se agrega como rama nueva al final o espera
  la re-comparación.

## Verificación de cumplimiento

- **Por fase:** `pnpm format && pnpm lint && pnpm build` en verde; `pnpm
check:locales` cuando hay textos; `pnpm pipeline:harness <subcomando>` cuando la
  fase toca `pipeline/`.
- **Por rama:** la verificación end-to-end declarada en el plan (p. ej. rama 8:
  render real 9:16 con ffmpeg y cache-hit intacto en proyectos 16:9; rama 9: crear
  estilo → muestras → video → regeneración desde Library).
- **Regresión típica:** un PR que mezcla cambios de dos ramas del mapa, o una clave
  i18n presente en un catálogo y ausente en los otros dos (`check:locales` la caza).

## Fuera de alcance

No se porta (deliberado, no olvido): el modo web completo (`esModoWeb()` y todas sus
ramas), el modo Demo, la ofuscación del build del origen, el estilo de la casa
Storytime (el propio origen lo retiró en v1.35.0), los assets `gpt-image-1.5`, y lo
ya excluido por ADR-0010 (whisper local, llama, checkpoint, subtitles).

## Referencias

- Origen: `02-vimo/cursor-video` rama `vimo_dev` (diff `main..vimo_dev`).
- ADR-0010 (migración por módulos, completa), ADR-0013 (Create), ADR-0014
  (Library), ADR-0015 (Fal solo gpt-image-2 — el origen llegó a la misma decisión
  en v1.33.0).
