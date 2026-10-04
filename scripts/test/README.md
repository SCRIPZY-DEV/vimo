# Scripts de prueba (provisorios)

> ⚠️ **Pendiente: migrar a un framework de pruebas.** El repo todavía no tiene
> Vitest ni Playwright (ver «Al terminar un cambio» en [CLAUDE.md](../../CLAUDE.md)).
> Estos scripts son guards y regresiones escritos a mano con `node:test`,
> `node:assert` y un Chrome headless propio. Nadie los corre automáticamente: no
> están en CI y la mayoría tampoco en `package.json`. Cuando se elija el framework,
> cada script se migra a su suite y se borra de acá.

Todos se corren **desde la raíz del repo** (resuelven rutas contra el directorio
actual). No usan claves reales ni gastan créditos: simulan el HTTP o usan fixtures
en carpetas temporales.

## Guards del repo

| Script              | Qué verifica                                                                   | Cómo se corre        |
| ------------------- | ------------------------------------------------------------------------------ | -------------------- |
| `check-locales.mjs` | Los tres catálogos `public/locales/{es,en,pt}.json` declaran las mismas claves | `pnpm check:locales` |
| `check-demo.mjs`    | Modo demo sobre un pack mínimo servido por HTTP local (ADR-0029, ADR-0030)     | `pnpm check:demo`    |

## Sidecar con HTTP simulado

Importan comandos y stages reales de `pipeline/`. Migran a **Vitest** sin Chrome ni
binarios.

| Script                                  | Qué verifica                                                                                                                                                                                                                                                                                                                         | Informe                                                                                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check-preview-regressions.mjs`         | Previews de Mi estilo: rotación de modelos, lote de prompts, 4 imágenes a la vez, personaje predeterminado y el del estilo con la Fase 1 del video                                                                                                                                                                                   | [fix](../../docs/fixes/2026-09-12-fix-style-preview-generation/style-preview-generation.md), [fix](../../docs/fixes/2026-09-18-fix-style-samples-character/style-samples-character.md)       |
| `check-voice-resume.mjs`                | Reanudar narración sin repetir POSTs; unión con FFmpeg real                                                                                                                                                                                                                                                                          | [fix](../../docs/fixes/2026-09-12-fix-voice-resume/voice-resume.md)                                                                                                                          |
| `check-character-profile.mjs`           | Ficha de personaje completa (nombre, edad, rol, identidad)                                                                                                                                                                                                                                                                           | [fix](../../docs/fixes/2026-09-12-fix-character-profile-completeness/character-profile-completeness.md)                                                                                      |
| `check-catalog-prompts.mjs`             | Prompts de Catálogo sin imágenes de relleno; la revisión narrativa retirada no llama a ningún modelo                                                                                                                                                                                                                                 | [fix](../../docs/fixes/2026-09-12-fix-catalog-scene-prompts/catalog-scene-prompts.md)                                                                                                        |
| `check-editor-character-selection.mjs`  | Regenerar desde el editor respeta el personaje marcado y la descripción guardada                                                                                                                                                                                                                                                     | [fix](../../docs/fixes/2026-09-13-fix-custom-style-editor-character-selection/custom-style-editor-character-selection.md)                                                                    |
| `check-character-identity-lock.mjs`     | Candado de tono de piel del personaje en Catálogo (estilo realista) y aviso de referencia perdida                                                                                                                                                                                                                                    | [fix](../../docs/fixes/2026-09-18-fix-realistic-character-identity/realistic-character-identity.md)                                                                                          |
| `check-image-account-failures.mjs`      | Saldo agotado, clave inválida o cuenta rechazada cortan la fase de imágenes con su código (Evolink y Fal)                                                                                                                                                                                                                            | [fix](../../docs/fixes/2026-09-19-fix-image-account-failures/image-account-failures.md)                                                                                                      |
| `check-style-character-video.mjs`       | El personaje escrito en el estilo sale igual en todo el video (creación, reanudación, política de contenido, editor) y el de biblioteca conserva su identidad en un estilo propio (rescate sin foto, descripción de respaldo, candado)                                                                                               | [fix](../../docs/fixes/2026-09-19-fix-style-character-video/style-character-video.md), [fix](../../docs/fixes/2026-09-19-fix-custom-style-library-identity/custom-style-library-identity.md) |
| `check-scene-wardrobe.mjs`              | Vestuario por escena en Mi estilo (detrás de `VERBATIM_SCENE_WARDROBE`): apagado byte-idéntico, encendido la ropa de la escena reemplaza a la base                                                                                                                                                                                   | [handoff](../../docs/handoff/2026-09-21-custom-style-scene-wardrobe/implementation.md)                                                                                                       |
| `check-verbatim-prompt-persistence.mjs` | Los prompts de Mi estilo se escriben lote a lote: un lote que muere no quema a los cosechados, el reintento solo pide lo que falta y una pasada de recuperación cortada nunca vacía un prompt; Mi estilo no llama a la revisión narrativa retirada                                                                                   | [fix](../../docs/fixes/2026-09-21-fix-verbatim-prompt-persistence/verbatim-prompt-persistence.md)                                                                                            |
| `check-provider-failure-events.mjs`     | Los fallos de proveedor llegan al log de diagnóstico (ADR-0038): un reintento de Fal, la cascada TTS y el backoff del LLM emiten `provider-failure` con `recovered: true`; el fallo terminal lleva `provider` y `httpStatus`                                                                                                         | [handoff](../../docs/handoff/2026-09-21-diagnostic-logs-subject-provider/implementation.md)                                                                                                  |
| `check-verbatim-prompt-language.mjs`    | Idioma de salida en Mi estilo (detrás de `VERBATIM_OUTPUT_LANGUAGE_RULE`): apagada byte-idéntica, encendida el system y el turno del lote exigen inglés; una ronda entera en otro idioma corta la corrida en dos pedidos con `llm_prompt_language`, sin culpar al modelo ni llegar al rescate, y una ronda mixta sigue la escalera   | [fix](../../docs/fixes/2026-09-22-fix-verbatim-prompt-language/verbatim-prompt-language.md)                                                                                                  |
| `check-silent-scene-images.mjs`         | Una escena muda del corte clásico (texto vacío por una pausa de la narración) recibe prompt e imagen desde la narración vecina: `skip()` de prompts e imágenes la cuentan, la reanudación repara un proyecto roto sin tocar a las vecinas, el gate final la lista si el proveedor la rechaza y el editor la regenera sin descripción | [fix](../../docs/fixes/2026-09-22-fix-silent-scene-images/silent-scene-images.md)                                                                                                            |

Se corren con `node --test scripts/test/<script>`.

## Interfaz en Chrome headless

Bundlean componentes y hooks reales con esbuild y simulan solo las APIs. Necesitan
`pnpm build` previo (usan el CSS del build) y Chrome instalado. Migran a
**Vitest + Testing Library** o a **Playwright**.

| Script                          | Qué verifica                                                     | Informe                                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `check-character-ui.mjs`        | Botón de IA en Crear personaje: Catálogo, Biblioteca y Mi estilo | [fix](../../docs/fixes/2026-09-12-fix-catalog-character-context/catalog-character-context.md)                             |
| `check-api-key-ui.mjs`          | Guardar clave solo después de probar la conexión                 | [fix](../../docs/fixes/2026-09-12-fix-api-key-validation-before-save/api-key-validation-before-save.md)                   |
| `check-editor-character-ui.mjs` | Checkbox de personaje en el panel del editor                     | [fix](../../docs/fixes/2026-09-13-fix-custom-style-editor-character-selection/custom-style-editor-character-selection.md) |
| `check-export-header-ui.mjs`    | Exportar video en el header, formatos 9:16 y 16:9                | [ADR-0017](../../docs/adr/ADR-0017-formato-de-video-16-9-y-9-16.md)                                                       |

Apoyo, no son pruebas:

- `chrome-session.mjs`: abre un Chrome aislado por CDP con perfil temporal. Lo
  importan los scripts de interfaz. Con Playwright deja de hacer falta.
- `capture-bugfix-pr.mjs`: saca las capturas del PR de correcciones en
  `docs/handoff/2026-09-13-bugfix-pr/screenshots/` (ignorada por git).

## Sidecar empaquetado (SEA)

Ejecutan el binario real `src-tauri/binaries/vimo-pipeline-<target-triple>`, así
que primero hay que correr `pnpm build:sidecar`. Son smoke tests del entregable,
candidatos a un job de CI después del build.

| Script                       | Qué verifica                                                     | Informe                                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `check-packaged-resume.mjs`  | Recibo de voz dudoso frena antes del POST; cache-hit sin claves  | [fix](../../docs/fixes/2026-09-12-fix-voice-resume/voice-resume.md)                                                       |
| `check-packaged-catalog.mjs` | Catálogo hasta `scene-prompts` con un LLM local                  | [fix](../../docs/fixes/2026-09-12-fix-catalog-scene-prompts/catalog-scene-prompts.md)                                     |
| `check-packaged-editor.mjs`  | `update-scenes` y `regenerate-scene-images` sin claves de imagen | [fix](../../docs/fixes/2026-09-13-fix-custom-style-editor-character-selection/custom-style-editor-character-selection.md) |
