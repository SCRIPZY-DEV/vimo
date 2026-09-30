# Redactor de animaciones: DeepSeek y comparación real

Fecha: 2026-09-16.

## Decisión aplicada

Por petición del dueño, **DeepSeek V3.2 es la primera elección del redactor de animaciones**, también al reparar una respuesta incompleta. `buildAnimationPrompt` solicita el tier `premium` existente. La configuración global, el redactor de imágenes y el transporte permanecen iguales. El dispatcher conserva sus esperas ante 429 y su recuperación por timeout; la preferencia inicial no elimina esa recuperación.

**Recomendación empírica: Mistral Small 3.2 obtuvo el mejor equilibrio de calidad, tiempo y precio en esta muestra.** No se cambia silenciosamente la elección explícita de DeepSeek. La comparación no demuestra que DeepSeek sea el mejor ni certifica la calidad del video generado.

## Prueba real

Se hicieron **42 redacciones y 49 llamadas HTTP reales a DeepInfra**, en dos rondas. Consumo informado por la API: **USD 0,04455019**. Dos rechazos HTTP 429 no devolvieron recibo de uso; no se contabilizan como un costo conocido cero. La cota conservadora, reservando el máximo para esas dos llamadas, es USD 0,05285327, por debajo del límite total de USD 0,25. No se compraron videos en Kie.

- Guion y prompts estáticos del proyecto local `video-fix-1`, sin añadirles instrucciones de la evaluación: aspiradora (escena 6), personaje con toalla (escena 5) y baño → diagrama (escenas 6 y 7).
- Las escenas individuales conservan su ventana real de aproximadamente 2,9804 s y un encargo de 4 s. El par usa los prompts originales en ventanas controladas de 3 + 3 s. No se modificó el proyecto.
- Dos repeticiones por caso/modelo, temperatura 0,85, `top_p` 0,95, 1.600 tokens de salida, timeout de 120 s, concurrencia 2 y hasta dos intentos del redactor.
- Se reutilizan el redactor, su validador y el transporte reales. Cada modelo queda fijado en los tres tiers para aislar la comparación. El benchmark no pasa por el dispatcher global de backoff ni cambia a otro modelo. Esto importa al interpretar los 429; la aplicación sí conserva ese manejo.
- `response.model` coincide con el modelo solicitado en todas las respuestas HTTP 200. Se guardan tokens, costo reportado, latencia, motivo de finalización y contenido. Ninguna clave ni header de autorización se guarda.
- Evaluación técnica de texto por Codex con etiquetas anónimas; rúbrica y puntuaciones guardadas antes de revelar las asignaciones. Cinco criterios de igual peso, de 0 a 5: acción del sujeto, fidelidad narrativa, continuidad, tiempo/transición y claridad. No es un panel humano, ni una prueba estadística, ni una evaluación del MP4.
- Los SHA-256 de `project.json`, `scenes.json` y `script.txt` coinciden antes/después y entre rondas.

## Resultado con las instrucciones conservadas

| Modelo            | Prompts válidos | Calidad de salidas válidas /25 | Mediana por redacción | USD por 1.000 solicitudes equivalentes |
| ----------------- | --------------- | ------------------------------ | --------------------- | -------------------------------------- |
| Mistral Small 3.2 | 6/6             | 19,83                          | 8,58 s                | 0,1991                                 |
| DeepSeek V3.2     | 6/6             | 17,83                          | 13,58 s               | 0,4841                                 |
| Qwen3 235B        | 6/6             | 15,83                          | 12,43 s               | 0,3104                                 |
| GLM 4.7           | 2/6             | 18,00 sobre solo 2 salidas     | 144,75 s              | 5,3774                                 |

El costo por 1.000 es una extrapolación del consumo de esta muestra, con el caché observado y los reintentos incluidos; no es una tarifa fija. GLM agotó 1.600 tokens con contenido vacío y `finish_reason: length` en nueve llamadas. Se descarta para este presupuesto concreto, sin afirmar que falle con cualquier configuración.

Mistral produjo gestos de limpieza más directos y menos elementos inventados en el caso del personaje. DeepSeek mantuvo continuidad explícita, pero en la aspiradora tendió a mover la manguera; el cuerpo principal no ganó movimiento de forma fiable. Qwen añadió sonido o acciones incompatibles con una manguera ya conectada en varias salidas. Ninguno eliminó todos los defectos semánticos; un JSON válido no garantiza una buena animación.

## Variante adicional descartada

Se probaron instrucciones extra sobre cuerpo principal, materiales, conexiones físicas y transición explícita, con los mismos tres casos y dos repeticiones para DeepSeek, Qwen y Mistral. No se alteró la rúbrica.

| Modelo            | Prompts válidos | Calidad de salidas válidas /25 | Observación                                                                |
| ----------------- | --------------- | ------------------------------ | -------------------------------------------------------------------------- |
| DeepSeek V3.2     | 5/6             | 17,60                          | Una redacción sin salida por dos rechazos 429; no es un defecto del texto. |
| Mistral Small 3.2 | 6/6             | 17,00                          | No mejoró el movimiento principal de forma consistente.                    |
| Qwen3 235B        | 6/6             | 15,67                          | Una salida requirió reparación; siguieron contradicciones.                 |

La variante se descartó. Es una iteración sobre los mismos casos, no una validación independiente; no permite atribuir causalmente diferencias pequeñas a la redacción. La aplicación conserva las instrucciones anteriores y el cambio a DeepSeek desde el primer intento. Las instrucciones experimentales y todos los resultados permanecen en la evidencia para auditoría.

## Precios consultados

USD por millón de tokens de entrada / salida, catálogo público verificado el 2026-09-16:

- [DeepSeek V3.2](https://deepinfra.com/deepseek-ai/DeepSeek-V3.2): 0,26 / 0,38; entrada cacheada 0,13.
- [Qwen3 235B](https://deepinfra.com/Qwen/Qwen3-235B-A22B-Instruct-2507): 0,09 / 0,55.
- [Mistral Small 3.2](https://deepinfra.com/mistralai/Mistral-Small-3.2-24B-Instruct-2506): 0,075 / 0,20.
- [GLM 4.7](https://deepinfra.com/zai-org/GLM-4.7): 0,40 / 1,75; entrada cacheada 0,08.

Precios obtenidos también del [catálogo API oficial](https://docs.deepinfra.com/api-reference/models/models-info); consumo leído de `usage.estimated_cost`, documentado en la [guía oficial](https://docs.deepinfra.com/quickstart). Estos importes de texto son independientes de los créditos Kie para generar video.

## Reproducción y alcance

```sh
# Sin --run: muestra los casos, sin pedir credenciales ni comprar nada.
node scripts/benchmark-animation-writers.mjs \
  --project /ruta/a/video-fix-1 --output /ruta/fuera/del/proyecto

# Con --run: consume la cuenta DeepInfra, hasta USD 0,25 como máximo.
node scripts/benchmark-animation-writers.mjs \
  --project /ruta/a/video-fix-1 --output /ruta/a/evidencia \
  --keychain --run
```

En macOS, `--keychain` lee únicamente la clave DeepInfra del almacén existente y la mantiene en memoria. También se admite `DEEPINFRA_API_KEY`. `--models` acepta IDs del catálogo separados por comas y `--budget-usd` permite reducir el límite. El runner requiere las escenas 5, 6 y 7 del fixture descrito; no es un evaluador genérico de cualquier proyecto.

Único archivo de producto modificado: `pipeline/animation/prompt.ts`. Se preservan selección/reproducción del editor, duración/velocidad, transiciones, UI, saldo Kie, imágenes, rutas, contratos sidecar, exportación y recibos ya pagados. Las generaciones previas no se reescriben.

Evidencia local completa, sin secretos: vault VIMO-TAURI → `Reportes/2026-09-16-animation-writer-benchmark/benchmark-evidence.json` y `benchmark-review.md`. Incluye los 42 resultados, incluso fallos y variante descartada.

## Validación de la entrega

- `pnpm format`, `pnpm lint`, `pnpm build` y `tsc --noEmit -p tsconfig.pipeline.json`: aprobados.
- 39 comprobaciones del proveedor: HTTP simulado, FFmpeg real; selección inicial DeepSeek y tareas equilibradas Qwen verificadas.
- 15 comprobaciones del servicio: clips pagados preservados y redactor incompleto bloqueado antes de comprar video.
- 28 comprobaciones con el sidecar recién empaquetado: NDJSON, límites, conservación de recibos, exportación y render reales.
- Benchmark real independiente: 49 llamadas de texto a DeepInfra; no es una simulación de esas llamadas.
- PDF de tres páginas verificado, sin recursos remotos ni desbordamiento A4; HTML legible a 390 px.

Sidecar SHA-256: `2156e507a81997b21f833d78fb9f6b6168e1926cba861ad27a031315fd9ee182`. Ejecutable Tauri SHA-256: `aa276f4c4ce7ebac68f59a20ce1c5c93c257cd590ee3df12dd7158ef705958d3`. La modificación está en el sidecar; el ejecutable Rust permanece igual.

```sh
cd /Users/sebas/Documents/VIMO-TAURI/.claude/worktrees/feat+vimo-character-modal-improvements
PATH="/Users/sebas/node-v22.23.2-darwin-arm64/bin:$PATH" pnpm tauri build --bundles app
open src-tauri/target/release/bundle/macos/Vimo.app
```

El checkout raíz sigue en `dev`; compilar allí no incluye esta rama. No se hizo push, PR, publicación ni notarización.
