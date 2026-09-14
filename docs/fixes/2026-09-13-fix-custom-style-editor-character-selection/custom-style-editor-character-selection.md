# Mi estilo: personaje al regenerar desde el editor

Fecha: 2026-09-13. Rama: `feat/fix-bugs-vimo`.

## Qué estaba mal

1. La casilla guardaba `charactersPresent`, pero conservaba `imagePrompt`: desmarcar
   quitaba la foto de referencia, no la petición textual de dibujar al personaje.
2. Al reescribir, el puente verbatim ignoraba la elección y volvía a decidir la
   presencia por lo que escribió el modelo. La regla existente
   `withoutScriptProtagonist` no se conectaba a esta operación.
3. Regenerar podía adelantarse al guardado. Además, un guardado fallido seguido de
   una relectura idéntica no restauraba la copia optimista del checkbox: Query
   conservaba la misma referencia y no disparaba el resync del editor.

## Corrección acotada

- Cambiar realmente el reparto de una escena de Mi estilo invalida su prompt
  derivado; no borra la imagen ni marca el video desactualizado por tocar la casilla.
  Una selección equivalente conserva el prompt y permite re-roll sin más tokens.
- El panel espera el guardado y la relectura; ante error restaura la selección
  confirmada. El handler también impide encolar mientras se guarda.
- En regeneraciones, el mismo escritor verbatim agrupa escenas por selección:
  desmarcadas usan la regla existente sin protagonista; marcadas reciben la identidad
  elegida y la indicación de incluirla. No se diseña otro personaje innecesariamente.
  Misma selección sigue siendo un lote; selecciones distintas se procesan en paralelo.
- La gema, narrativa, notas del usuario y cola de estilo siguen en su carril.
  La selección explícita se conserva al persistir y determina las fotos adjuntas.
  El personaje de texto también recibe identidad si el modelo usa su nombre en vez
  de `[subject]`. Dos fotos seleccionadas permanecen adjuntas; las identidades de
  texto pasan por el recorte ya existente, no se pegan retratos completos.
- La validación rechaza menciones del personaje excluido o ausencia del incluido;
  reaprovecha los reintentos y rescate del escritor. Si persiste el incumplimiento,
  falla antes de pedir imágenes de reemplazo. Cancelar no guarda respuestas tardías.
- Solo se piden los ids objetivo. Create sigue dejando la presencia a la gema;
  Catálogo conserva su política. Sin nuevas fases, campos persistidos, rutas,
  proveedores, cambios Rust o duplicación del generador.

## Archivos tocados

- `pipeline/commands/videos/update-scenes.ts`: invalidación del prompt al cambiar reparto.
- `pipeline/stages/scene-prompts/verbatim/verbatim-lane.ts`: selección explícita, grupos y alcance.
- `pipeline/stages/scene-prompts/verbatim/verbatim-writer.ts`: validación previa y nombre en el plan.
- `pipeline/stages/scene-prompts/verbatim/subject-weaver.ts`: identidad por nombre sin etiqueta.
- `src/modules/videos/hooks/useLibraryEditor.ts`: espera y rollback de las casillas.
- `src/modules/videos/views/LibraryEditor/LibraryEditor.tsx`: bloqueo temporal del panel.
- `scripts/check-editor-character-selection.mjs`: 21 comprobaciones con HTTP simulado.
- `scripts/check-editor-character-ui.mjs`: 4 recorridos del hook/query/panel en Chrome.
- `scripts/check-packaged-editor.mjs`: smoke reproducible de los comandos en el SEA real.

## Verificación y límites

109 comprobaciones Node aprobadas: 21 nuevas más 88 de Catálogo, fichas, previews y
voz. UI del editor 4/4; Claves API 13 casos. Format, lint, build, tipos del pipeline
y 1185 claves i18n alineadas aprobados. El test UI reprodujo el rollback ausente y
pasó después de corregirlo; no se maquilla la respuesta del servidor para forzarlo.

Build `pnpm tauri build` macOS Apple Silicon aprobado con Node oficial; DMG
verificado con `hdiutil verify` (CRC32 `57602DA0`). Después de compilar, smoke del
SEA: editor 3/3, Catálogo 4/4 y voz 3/3. Build y smoke se ejecutaron en serie.
El instalador no se instaló ni publicó automáticamente.

Prueba del paquete: `node scripts/check-packaged-editor.mjs`. Usa solo un LLM local
y ninguna clave de imagen: verifica la presencia guardada y el cierre antes de
imágenes sin facturar llamadas. El guard es textual: no demuestra cumplimiento
visual de cada modelo remoto. Hace falta aceptación con imágenes reales y QA en
Windows; no se afirma haberlos probado ni se gastaron créditos del usuario.

## Pasos para probar en la app actualizada

1. Abrir un proyecto Mi estilo con personaje y elegir una escena donde aparezca.
2. Desmarcarlo, esperar que el panel termine de guardar y pulsar Regenerar.
   Debe salir el escenario de ese momento, sin protagonista y con el mismo estilo.
3. Marcarlo otra vez y Regenerar: debe volver el personaje con la identidad elegida.
4. Repetir con una escena originalmente sin personaje, primero marcándolo.
5. Cambiar de escena y volver: comprobar que la selección se conservó y que las
   otras imágenes no cambiaron. Repetir con personaje de texto y con foto.
6. Sin tocar la selección ni descripción, Regenerar debe reutilizar el prompt.
7. Si hay un fallo, la imagen anterior debe conservarse. No se regenera ningún
   asset pagado automáticamente por instalar el arreglo.

Cada regeneración solicitada sí consume los créditos normales del proveedor.
La corrección independiente de Claves API está en
[su informe y pasos](../2026-09-12-fix-api-key-validation-before-save/api-key-validation-before-save.md).
