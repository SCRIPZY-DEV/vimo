# Los prompts de «Mi estilo» se perdían enteros cuando la fase fallaba

- **Fecha:** 2026-09-21
- **Área:** pipeline (carril verbatim de `scene-prompts`, pasadas de recuperación de imágenes)
- **Guard:** `scripts/test/check-verbatim-prompt-persistence.mjs`

## Causa

En el carril verbatim los prompts se escribían a disco **una sola vez, cuando toda la
fase terminaba bien**:

```ts
// pipeline/stages/scene-prompts/scene-prompts.ts
const lane = await runVerbatimLane(context, scenes, script)
await writeScenesOwned(context.paths, lane.scenes, context.regenerateSceneIds)
```

Si `runVerbatimLane` lanzaba, esa escritura nunca ocurría y el `Map` con todos los
prompts ya cosechados —y **ya pagados en DeepInfra**— se descartaba. La lane lanza por
cuatro caminos, todos frecuentes:

- `throwIfAborted()` — la UI cancela el job cuando el modelo da errores (ADR-0028);
- `llm_empty_response` cuando un grupo con personajes asignados quedó con faltantes;
- `throw failure.reason` — **cualquier** grupo que falle arrastraba a los que sí salieron;
- `isLlmAuthFailure` — una clave rechazada corta sin escalera.

Al reintentar, la lane recalcula qué falta leyendo `scene.imagePrompt` del disco; como no
había nada, **volvía a pedir y a pagar el 100 %** del video. Y cada llamada reenvía la
gema y el guion completos, así que el re-pago es caro. Era exactamente lo que reportó un
usuario: la pantalla «el modelo está devolviendo errores» y el saldo bajando en cada
reintento.

Además volvía falsa la copy de esa misma pantalla (`create.promptModelIssue.error.body`):
«los prompts que ya salieron se conservan».

## Corrección

Los prompts se persisten **al cerrar cada lote** (un lote = una llamada paga de hasta 20
fragmentos), con el mismo patrón que el carril de la casa: un buffer con todas las escenas
y una cadena de promesas que serializa las escrituras, porque los grupos corren en paralelo.

- `verbatim-writer.ts` — el post-proceso que convierte el prompt crudo en el final (tejido
  del sujeto y vestuario) se extrajo a `finalizeVerbatimPrompts`, pura y llamable dos
  veces. El parámetro `only` acota qué escenas se componen, **nunca** qué arma la cadena
  del vestuario: `readSceneWardrobes` sigue corriendo sobre todo lo cosechado, porque su
  regla de continuidad mira la escena anterior. Nuevo hook `onBatchReady`.
- `verbatim-lane.ts` — nueva opción `onPrompts`, y `presenceForScene` reproduce por escena
  la regla de `markSubjectPresence` para que el reparto (`charactersPresent`) viaje también
  en la escritura parcial: de eso depende que la foto de referencia se adjunte a las
  escenas correctas.
- `verbatim-persistence.ts` (nuevo) — el buffer y la cadena.
- `scene-prompts.ts` e `images.ts` — cablean la persistencia.

### Dos decisiones que no son obvias

**Una respuesta que llega después de la cancelación NO se escribe.** El primer diseño
ignoraba el abort («los tokens ya están facturados»), pero eso rompía un guard existente:
en el editor, cancelar significa dejar la escena como estaba, con su imagen vieja intacta,
y un prompt nuevo la contradiría. El arreglo no pierde valor: los lotes que cerraron
**antes** de la cancelación ya están escritos, que es justo lo que antes se perdía entero.
Lo único que se resigna es el lote cuya respuesta llegó tarde.

**La persistencia de las pasadas de recuperación se siembra con `scenes`, nunca con
`cleared`.** `images.ts` le pasa a la lane un array con los prompts a reescribir en blanco.
Ese blanco existe solo para decirle qué re-pedir; si llegara al disco, una pasada cortada a
mitad **borraría prompts buenos** — peor que el bug original. Como el buffer solo reemplaza
los ids que el motor entregó, es imposible por construcción.

## Archivos tocados

- `pipeline/stages/scene-prompts/verbatim/verbatim-writer.ts`
- `pipeline/stages/scene-prompts/verbatim/verbatim-lane.ts`
- `pipeline/stages/scene-prompts/verbatim/verbatim-persistence.ts` (nuevo)
- `pipeline/stages/scene-prompts/scene-prompts.ts`
- `pipeline/stages/images/images.ts`
- `scripts/test/check-verbatim-prompt-persistence.mjs` (nuevo)

## QA

`pnpm format && pnpm lint && pnpm build`, y `node --test` sobre los guards del carril
(`check-scene-wardrobe`, `check-style-character-video`, `check-editor-character-selection`,
`check-catalog-prompts`, `check-character-identity-lock`, `check-preview-regressions`):
verdes **sin tocarlos**, que es la prueba de que el resultado final no cambió.

El guard nuevo cubre seis casos; tres fallan con el código anterior:

1. un lote que muere con 401 no quema a los ya cosechados (**fallaba**);
2. el reintento solo vuelve a pedir las escenas que faltan (**fallaba**);
3. la escritura parcial lleva el reparto del personaje (**fallaba**);
4. una respuesta posterior a la cancelación no se escribe;
5. la corrida exitosa deja en disco lo mismo de siempre, con el progreso sin retroceder;
6. una pasada de recuperación cortada nunca deja un prompt vaciado.

Manual: video de «Mi estilo» con personaje asignado a escenas, matar el job a mitad de la
fase de prompts y confirmar que `scenes.json` conserva lo escrito y que «Reintentar» solo
pide lo que falta.

## Fuera de alcance

De la misma auditoría, pendientes: la ronda de rescate escala al modelo más caro del
catálogo sin avisar; los tokens de las llamadas fallidas no se contabilizan (`count(...)`
solo corre tras un éxito); y el `llm_empty_response` que sintetiza la propia validación
bloquea una hora a un modelo sano por estar en `PROVIDER_TROUBLE_CODES`.
