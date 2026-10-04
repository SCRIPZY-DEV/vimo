# Fix: la corrida muere en «Escribiendo prompts» y nunca genera imágenes

- **Fecha:** 2026-10-04
- **Área:** scene-prompts (Catálogo y Mi estilo), images.

## Síntoma

Con Vimo 0.9.1 aparece «Escribiendo 549 prompts — 542 de 549 · 98 %» y la tarjeta
`catalog_prompts_incomplete`: «No se generó ninguna imagen». Reintentar no destraba la
corrida, y los usuarios vuelven al zip de la versión anterior.

## Causa

El flujo se corta en la **etapa de prompts**, antes de cualquier solicitud de imagen.
SSE, polling, la capa Tauri y los timeouts de imágenes no intervienen.

- **Catálogo:** si más de 5 escenas quedaban sin prompt, `generateScenePrompts` lanzaba
  `catalog_prompts_incomplete`. Era un número fijo, así que en un video de 549 escenas
  bastaba un 1,3 % de fallos para tumbar todo.
- **Mi estilo:** `runVerbatimLane` lanzaba `scene_prompt_alignment_failed` con **una
  sola** escena faltante. Además, si el revisor no respondía, el lote caía y arrastraba
  la corrida entera.
- **Origen de los huecos:**
  - El revisor narrativo (ADR-0043) dejaba la escena vacía si objetaba en todos los
    intentos, o si no respondía.
  - En Catálogo, un solo timeout descartaba el modelo para todo el job.
- **La versión anterior (cursor-video) no se detenía:**
  - La ruta clásica rellenaba esas escenas y abortaba solo si fallaban todas.
  - El motor web seguía a imágenes y reintentaba después las escenas faltantes.
  - No tenía revisor.

## Corrección

1. **Revisor permisivo, en los dos carriles:**
   - Si se agotan los intentos y el revisor solo objetó, se acepta el último candidato.
     Lo escribió el modelo sobre esa narración, así que no es relleno. El log dice
     `scene N accepted with reviewer objection: …`.
   - Si el revisor no responde (`scene_prompt_alignment_failed`), el prompt se acepta sin
     revisión y el log dice `accepted without narrative review (reviewer unavailable)`.
   - Cuenta, saldo y cancelación siguen cortando la corrida.
   - Archivos: `prompt-writer.ts` (`narrativeObjection`, también en el rescate por
     política de contenido) y `verbatim-writer.ts` (`reviewOrAccept`, `objectedPrompts`).
   - `reviewerCorrection` pasa a `narrative-alignment.ts` para que los dos carriles lo
     compartan.
2. **Umbral de rescate proporcional:** `rescuablePromptFailures(n) = max(5, ceil(5 % · n))`.
   Da 28 para 549 escenas. Si fallan todas, sigue siendo error.
3. **Mi estilo aparta en vez de abortar** (`verbatim-lane.ts`):
   - Las faltantes dentro del umbral vuelven con `promptFailure: { source: 'models' }`.
   - `parkedForEditor` ahora también las aparta en Mi estilo. Además, la Capa 4 de
     `generateImages` ya no les pone un relleno antes del filtro. Ese era un bug latente:
     el relleno las hacía pasar por escenas con prompt válido y llegaban al proveedor.
   - Un prompt nuevo borra el `promptFailure` viejo (`verbatim-lane.ts`,
     `verbatim-persistence.ts`).
4. **Timeouts en Catálogo** (`catalog-llm.ts`): un plazo vencido suma un strike, como la
   red. El modelo se descarta recién al tercer strike y la pasada se reintenta a los 2 s
   y a los 5 s.

Resultado: con pocas escenas sin prompt, el job sigue a imágenes y termina en
`images_incomplete` con «Continuar en el editor», que ya existía.

## Pendiente (requiere decisión)

Subir los timeouts quedó **sin aplicar**: el clasificador de permisos bloqueó el cambio.
Son estos valores:

- `pipeline/config/pipeline-config.ts`: `timeoutMs` pasa de `120_000` a `600_000`. Afecta
  al revisor, la biblia y el director.
- `pipeline/stages/shared/catalog-llm.ts`: `CATALOG_ATTEMPT_MS` pasa de `90_000` a
  `600_000`. El plazo efectivo es `min(CATALOG_ATTEMPT_MS, timeoutMs)`, así que hay que
  subir los dos.

## Verificación

- `node --experimental-strip-types --test scripts/test/check-catalog-prompts.mjs`:
  44/44.
  - Se actualizaron 4 tests que fijaban el comportamiento anterior (revisor bloqueante y
    timeout que descartaba el modelo).
  - Se agregaron pruebas de: revisor que no responde, umbral proporcional, y escenas
    apartadas por fallo de modelos.
- `node --experimental-strip-types --test scripts/test/check-verbatim-prompt-persistence.mjs`:
  9/9. Las 3 nuevas cubren:
  - aceptación con objeción;
  - escena apartada sin cortar la corrida;
  - la escena apartada nunca llega al proveedor como relleno.
- `check-silent-scene-images` (4/6) y `check-style-character-video` (18/19): sus fallos
  restantes ya fallaban antes de este cambio, por mocks sin revisor. Antes eran 4 y 10.
- `pnpm lint`, `pnpm build`, `pnpm exec tsc -p tsconfig.pipeline.json --noEmit` en verde.

## QA manual pendiente

Con un guion largo (más de 300 escenas), en Catálogo y en Mi estilo, comprobar que:

- la corrida llega a imágenes;
- el log muestra las aceptaciones con objeción;
- las escenas apartadas se terminan desde el editor.
