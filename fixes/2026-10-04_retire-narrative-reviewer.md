# Fix: ningún video pasaba de «Validando prompts» (se retira la revisión narrativa)

- **Fecha:** 2026-10-04
- **Rama:** fix/remove-narrative-reviewer (desde `origin/dev` @ `7cf81422`, la versión 0.9.1)

> ⚠️ **Superado en lo de la revisión:** esa misma noche la revisión volvió como asesora, con juez
> de respaldo y sin frenar videos. Ver `fixes/2026-10-04_narrative-reviewer-advisory.md` y la
> ADR-0043. Lo de los redactores baratos sigue vigente.

## Causa

Desde la tarde del 2026-10-04, en Vimo 0.9.1 ningún video llegaba a imágenes: la corrida se
detenía en «Validando prompts» con «Algunos prompts no lograron coincidir con lo que narra su
escena», en el Catálogo y en Mi estilo. Reintentar, cambiar de modelo, cancelar o cerrar la app no
lo destrababa.

La revisión narrativa de la ADR-0043 le pasaba cada prompt a un segundo modelo, fijo y que el
usuario no elige: `deepseek-ai/DeepSeek-V4-Pro` en DeepInfra. Ese modelo empezó a devolver una
copia de su entrada (`{"candidates": [...]}`) en vez de su veredicto (`{"scenes": [...]}`). Llegaba
al tope de 3 000 tokens con el JSON cortado, el intento de reparación hacía lo mismo y el lote
terminaba en `scene_prompt_alignment_failed`. La ADR-0043 detiene la fase cuando un lote no se puede
verificar: el video entero se cortaba. En el Catálogo, ese código cuenta como «sin modelos» para la
escena, y con más de cinco escenas así la corrida termina en `catalog_prompts_incomplete`.

Por qué no se destrababa:

- El revisor corre a temperatura 0: devuelve lo mismo en cada reintento.
- «Cambiar de modelo y relanzar» cambia el redactor, no el revisor.
- Cada escena rechazada contaba como defecto del redactor (`narrative alignment rejected` en
  `verbatim-writer.ts`). Tras cuatro rondas, la app mostraba «DeepSeek V4.1 Flash está devolviendo
  errores» y lo bloqueaba una hora, aunque DeepInfra hubiera respondido bien.

Reproducido con un proyecto real del dueño (14 escenas, Mi estilo, personaje propio) por la etapa
real de prompts y su clave de DeepInfra. El modelo copió la entrada en 11 llamadas de 11:

- lotes de 6, de 2 y de 1 escena;
- con modo JSON y sin él;
- un pedido mínimo de una escena con un prompt de 100 caracteres;
- los prompts de otro proyecto, que esa misma mañana a las 12:37 había pasado la revisión.

Con el mismo pedido, DeepSeek V3.2, DeepSeek V4.1 Flash y Qwen3 235B respondían bien, pero cada uno
juzgaba distinto las mismas dos escenas.

## Corrección

Decisión del dueño: retirar la revisión con un segundo modelo, después de probar videos reales sin
ella (abajo).

- **`pipeline/stages/scene-prompts/narrative-alignment.ts`:** `reviewNarrativePrompts` no llama a
  ningún modelo y no objeta nada; solo respeta la cancelación del job. `createNarrativeReviewLlm` ya
  no fija DeepSeek V4 Pro. Se borró el resto de la revisión: instrucción del juez, lotes, reparación,
  evidencias numeradas y límite de concurrencia. Se conserva `narrativeCandidateFor`: el redactor
  sigue recibiendo cada escena con su fragmento, su intervalo y sus vecinos.
- **Los lugares que llaman a la revisión no cambian** (`prompt-writer.ts`, `verbatim-lane.ts`,
  `images.ts`, `scene-prompts.ts`): reciben siempre «sin objeciones». Así la rama `fix/reviewer`
  (jdgonzalez03, sin PR), que reescribe esos mismos lugares, se integra sin choques en cualquier
  orden.
- **Catálogos (es, en, pt):** `create.errors.scenePromptAlignmentFailed` dice ahora «Algunas escenas
  se quedaron sin prompt tras varios intentos…». Es el único caso que queda con ese código: escenas
  que el redactor no logra escribir tras sus rondas y el rescate con otro modelo.
- **Docs:** la ADR-0043 suma «Retirada de la revisión LLM» y cambia su estado; la ADR-0044 y los
  índices de ADR lo anotan.

## Tres redactores más baratos

Pedido del dueño después del retiro, para no dejar solo los dos redactores validados, que considera
caros: volver a ofrecer en Mi estilo redactores de los que había antes del recorte de la ADR-0044. Se
probaron tres; después de ver la prueba pidió ocultar Llama 4 Scout.

- **`pipeline/providers/llm/model-catalog.ts`:** DeepSeek V4 Flash y GPT o4-mini TURBO vuelven al
  selector (`inUi: true`); Llama 4 Scout sigue oculto. El predeterminado sigue siendo DeepSeek V4.1
  Flash. DeepSeek V4 Pro sigue fuera.
- **Guard nuevo `scripts/test/check-prompt-model-offer.mjs`:**
  - la oferta de cuatro;
  - un proyecto que eligió uno de los baratos se escribe con ese;
  - V4 Pro y Llama 4 Scout quedan fuera;
  - cada redactor tiene rescate de otra familia.
- **ADR-0044:** sección «Actualización del 2026-10-04».

En el Catálogo no cambia nada: ese carril ya escribe con Llama 4 Scout y GPT o4-mini por su cuenta.

## Límites deliberados

- **No se cambia qué pasa con una escena sin prompt.** En Mi estilo sigue cortando la corrida (desde
  el PR #91). La rama `fix/reviewer` propone apartar unas pocas escenas para terminarlas en el editor;
  eso queda en su rama.
- **No se borran del todo las piezas del validador.** Quedan las llamadas que ahora no hacen nada y
  la sección de corrección que el catálogo siembra desde un `promptFailure` viejo con
  `source: 'reviewer'` (proyectos de antes). Se limpian después de integrar las dos ramas.
- **Con Claude Haiku 4.5 y un estilo con protagonista que fija el fondo, las escenas pueden repetir
  lugar.** En la prueba, el detective quedó en su estudio en 9 y 12 de 15 escenas (con revisión, 3) y
  mostró las ciudades narradas como maquetas. Las imágenes siguen en tema. Si molesta, se corrige en
  la instrucción del redactor, sin otra llamada.
- La clave cruda `create.errors.scenePromptAlignmentFailed` que se vio en una app de prueba no es de
  esta versión: en `dev` el texto está bien ubicado. Es de la rama del catálogo y se arregla allí.

## Validación reproducible

Guards (sin red):

```
node --test scripts/test/check-catalog-prompts.mjs scripts/test/check-verbatim-prompt-persistence.mjs \
  scripts/test/check-editor-character-selection.mjs scripts/test/check-style-character-video.mjs \
  scripts/test/check-silent-scene-images.mjs
```

- **Casos nuevos, vistos fallar antes del cambio:**
  - el catálogo no llama al revisor (hacía 4 llamadas);
  - Mi estilo no llama al revisor (hacía 5);
  - la revisión retirada no llama a un modelo.
- **Tres casos del catálogo** armaban escenas apartadas con rechazos del revisor. Ahora las arman con
  una falla del redactor (motivo `models`) y prueban lo mismo: la escena espera al editor, el resto
  recibe imagen y, si fallan todas, no se compra ninguna.
- **`check-editor-character-selection.mjs`** espera el código vigente desde el PR #91
  (`scene_prompt_alignment_failed`).
- **Los 33 casos que fallaban en `dev` desde el PR #91** (no simulaban al revisor) vuelven a pasar.
  En `check-silent-scene-images.mjs`, `dev` falla 4 casos y esta rama 1: «prompts stage writes the
  silent scene from its neighbours» hace 9 llamadas al redactor. Falla igual con el código de `dev`
  y el revisor simulado aprobando todo, así que no viene de este cambio.
- **Toda la suite** (`node --test scripts/test/check-*.mjs`, con `pnpm build` y
  `pnpm build:sidecar` antes): 240 de 245. Los 5 que fallan fallan igual en una copia limpia de
  `origin/dev`: `check-api-key-ui`, `check-editor-character-ui`, `check-export-header-ui`,
  `check-packaged-editor` y el caso de la escena muda.
- `pnpm format`, `pnpm lint`, `pnpm build` y `pnpm build:sidecar` pasan.

## Pruebas manuales

Videos reales sin la revisión, con las etapas reales de prompts e imágenes y las claves del dueño.
Tres proyectos hechos con la revisión, rehechos sin ella con el mismo estilo, modelo y proveedor:

| Video                                                                         | Resultado sin revisión                                                                                    |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Mi estilo, DeepSeek V4.1 Flash, 21 escenas                                    | 21 de 21 imágenes que corresponden a su narración, igual o mejor que con revisión; 57 s en total.         |
| Mi estilo, Claude Haiku 4.5, 14 escenas                                       | 14 de 14, calidad pareja. La versión con revisión había aprobado en la escena 1 lo que narra la escena 2. |
| Mi estilo, Claude Haiku 4.5, 15 escenas, protagonista genérico (dos corridas) | Ninguna imagen de otro momento del relato. El protagonista repite el estudio (ver Límites).               |

Los tres redactores baratos, sin la revisión y con el código de esta rama, sobre dos videos de Mi
estilo del dueño:

| Video y modelo                       | Resultado                                                                                     |
| ------------------------------------ | --------------------------------------------------------------------------------------------- |
| ESTILO COMIC (14), DeepSeek V4 Flash | 14 de 14; prompts en 49 s                                                                     |
| ESTILO COMIC (14), Llama 4 Scout     | 14 de 14 con un reintento; prompts en 85 s; «otras civilizaciones» salió como extraterrestres |
| ESTILO COMIC (14), GPT o4-mini TURBO | 14 de 14; prompts en 11 s; adelantó a la escena 11 lo que narra la 12                         |
| CLAYMATION (15), DeepSeek V4 Flash   | 15 de 15; prompts en 36 s                                                                     |
| CLAYMATION (15), GPT o4-mini TURBO   | 15 de 15; prompts en 8 s                                                                      |
| CLAYMATION (15), Llama 4 Scout       | 15 prompts en 55 s; sin imágenes (el saldo de Evolink se agotó)                               |

En ESTILO COMIC los tres —y la imagen de septiembre— dibujaron fútbol en la escena 3 («esos nombres
dominaran la historia»). **Corrección del 2026-10-04:** no es un error de lectura: esa escena tiene
una descripción manual del dueño, «el muñeco jugando fútbol», y todos la siguieron.

Costo de toda la reproducción y las pruebas, de las claves del dueño: unos 40 centavos de DeepInfra y
unas 175 imágenes de Evolink en calidad baja, que dejaron su saldo de Evolink en 2,3 créditos. Los
scripts y las hojas de comparación quedaron fuera del repo.

Pendiente del dueño: crear un video desde la app con esta versión, en el Catálogo y en Mi estilo, y
ver que pasa de «Validando prompts» a imágenes.
