# Catálogo: redacción retomable sin imágenes de relleno

Fecha: 2026-09-12. Decisión: [ADR-0036](../../adr/ADR-0036-prompts-de-catalogo-sin-relleno.md).

## Qué estaba mal

- Catálogo no usaba la política interactiva de las previews. Su cliente era
  no-streaming, con Qwen balanced, 120 s por intento y reintentos anidados.
- El director agrupaba hasta 80 escenas por llamada. Ante fallos podía inventar
  un plan mínimo provisional; el clasificador también podía ocultar un fallo.
- Cancelar interrumpía el LLM pero `guaranteePrompts` continuaba al relleno y lo
  persistía. Reproducción con la señal ya cancelada: 1 escena guardada, 1414
  caracteres y `promptIsFallback: true`. Reanudar aceptaba ese prompt por longitud.
- Anclar realismo antes de validar podía convertir un texto vacío en un sufijo
  largo pero sin escena. Imágenes tenía otra capa de relleno independiente.
- Las escrituras incrementales paralelas compartían `scenes.json.tmp` sin cola.

## Cómo se corrigió

Cliente exclusivo de Catálogo: streaming, Scout → GPT OSS Turbo → Ultra, hasta
40 s por intento y seis solicitudes simultáneas compartidas por biblia, director
y redactor. 429/5xx/red/timeout cambian de candidato sin esperar repetidamente al
mismo modelo. JSON inválido, contenido vacío y stream truncado también cambian de
modelo, pero solo para ese pedido. Clave/saldo/cancelación no activan fallback.
Cada unidad tiene hasta tres candidatos; la duración total depende de escenas,
colas y reparaciones de identidad, no está limitada a 40 s por video.

El director usa lotes dinámicos de hasta 12 y exige cobertura, lugar, emoción y
tratamiento válidos antes de aceptar un plan. El redactor conserva guion, fragmento,
identidad y estilo al rotar. Valida narrativa antes de añadir anclas y rechaza
duplicados exactos entre fragmentos diferentes (no compara similitud semántica).

No hay relleno determinístico en generación o reescritura de Catálogo. Imágenes
comprueba de forma independiente que las escenas por generar tienen prompts
narrativos no marcados como fallback. Si se agotan los modelos, falla de forma
retomable y no paga imágenes de reemplazo genéricas.

Cancelar propaga la señal, espera el cierre de tareas y deja solo avances válidos.
Una cola serializa los checkpoints. Reanudar escribe solo pendientes y corrige
rellenos anteriores sin imagen. Imágenes ya pagadas no se borran ni rehacen solas.
Un relleno con tarea remota pendiente se bloquea para revisar esa tarea antes de
cambiar su prompt/hash. Mi estilo, las previews, el transporte Tauri y TTS conservan
su política; el cliente streaming comparte solo una opción de validación opt-in.

## Puntos tocados

- `pipeline/stages/shared/{catalog-llm,catalog-prompt,llm,visual-bible}.ts`.
- `pipeline/providers/llm/verbatim-client.ts`: exigir cierre SSE completo opt-in.
- `pipeline/stages/scene-prompts/{scene-prompts,prompt-writer,scene-director,character-presence}.ts`.
- `pipeline/stages/images/images.ts`: barrera contra gasto de relleno.
- `pipeline/stages/voice/voice.ts`: observar la promesa de biblia especulativa;
  no modifica síntesis ni sus recibos.
- `src/modules/videos/constants.ts` y `public/locales/{es,en,pt}.json`: errores
  traducidos, sin reintentos automáticos adicionales sobre modelos agotados.
- `scripts/check-catalog-prompts.mjs`, `scripts/check-packaged-catalog.mjs`.
- ADR-0036, índices ADR, arquitectura y este informe; registros en Obsidian.

## Evidencia y límites

`node --test scripts/check-catalog-prompts.mjs`: 35 casos HTTP simulados, incluidos
cancelación/reanudación, fallo de los tres modelos, duplicación, planes parciales,
timeout, SSE, cero gasto de imágenes ante prompts inválidos y recorrido completo
director → redactor → Fal simulado con guardado real de las imágenes fixture.
También cubre cancelar el director y un rechazo content-policy cuya reescritura
falla: no debe originar una segunda imagen genérica. Son 88 casos al sumar las
regresiones previas de identidad, previews y voz.

`node scripts/check-packaged-catalog.mjs`: ejecuta el SEA con un servidor LLM en
loopback y comprueba rotación, fallo sin relleno, cancelación por stdin y reanudación.
Las fases de voz/transcripción se siembran como cache-hit; no evalúa su generación.
Build Tauri macOS ARM y smoke SEA 4/4 aprobados; UI de personajes 3/3 y smoke de
recibos de voz del SEA 3/3 aprobados. Format, lint, build, tipos del pipeline y
1185 claves alineadas en los tres idiomas.

No se usaron claves reales ni se generaron imágenes pagadas. Estas pruebas verifican
contratos y recuperación, no garantizan calidad semántica de cualquier respuesta
remota, latencia real, ni funcionamiento en Windows sin ejecutar allí el artefacto.

## Cómo probarlo en la app

1. Reemplazar la app con el nuevo instalador y abrirla de nuevo. El build no instala.
2. Crear un proyecto nuevo desde Catálogo, elegir Cartoon (para distinguirlo de
   Realista), cuatro escenas y un personaje. Usar un guion con cuatro momentos:
   reparar antena exterior, regar invernadero, observar la Tierra y aterrizar.
3. Generar y comprobar que los prompts corresponden a esos cuatro momentos y al
   estilo elegido. Deben llegar antes de las solicitudes de imagen.
4. En otra ejecución, cancelar durante prompts y reanudar: conservar los ya listos,
   escribir pendientes y no inventar un video terminado por haber cancelado.
5. Interrumpir internet durante texto y restablecerla. Si no quedan modelos útiles,
   debe aparecer el error retomable; no deben aparecer solicitudes nuevas de imagen
   basadas en relleno. Verificar el historial del proveedor, no solo la animación UI.
6. Para un proyecto antiguo con imágenes genéricas ya pagadas, revisar los prompts
   en el editor y regenerar explícitamente las escenas elegidas. Esa acción sí puede
   consumir créditos; no se realiza automáticamente durante esta reparación.

Modelos comprobados en fichas oficiales: [Scout](https://deepinfra.com/meta-llama/Llama-4-Scout-17B-16E-Instruct),
[Turbo](https://deepinfra.com/openai/gpt-oss-120b-Turbo),
[Ultra](https://deepinfra.com/openai/gpt-oss-120b-Ultra). La disponibilidad pública
no demuestra latencia ni calidad con la cuenta del usuario.
