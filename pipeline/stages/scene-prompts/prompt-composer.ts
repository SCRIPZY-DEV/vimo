import {
  CAMERA_HINT_ROTATION,
  CONTEXT_WINDOW_MAX_CHARS,
  PROMPT_SAFETY_BLOCK,
  SHOT_TYPE_ROTATION,
  SHOT_VARIETY_ROTATION,
  SILENT_PAUSE_BLOCK,
  SILENT_SCENE_WINDOW_CHARS,
  buildBackgroundBlock,
  buildImageTextLanguageBlock,
} from '../../prompts/scene-prompt-blocks.ts'
import type { Scene } from '../../types/scenes.ts'
import { sanitizeNarration } from '../../utils/content-safety.ts'
import { deriveEraFromBible } from '../../utils/story-era.ts'

// Compositor del user prompt por escena (port VERBATIM de construirUserPrompt
// del parser del origen, ~6.8KB en la rama automática). Los bloques textuales
// viven en prompts/scene-prompt-blocks (datos editables); acá vive solo el
// ensamblado: qué bloque entra, en qué orden y con qué rotación por índice.

// Ventana de narración alrededor de la escena actual (port de
// construirVentanaContexto): expande alternando atrás/adelante hasta juntar
// ~maxChars — la consistencia global la fija la biblia; la ventana aporta
// solo el beat narrativo LOCAL (y ahorra mandar el guion entero por escena).
export function buildContextWindow(
  orderedScenes: Scene[],
  currentId: number,
  maxChars = CONTEXT_WINDOW_MAX_CHARS,
): string {
  const index = orderedScenes.findIndex((scene) => scene.id === currentId)
  if (index === -1) return ''

  let low = index
  let high = index
  let total = (orderedScenes[index].text ?? '').trim().length
  while (total < maxChars && (low > 0 || high < orderedScenes.length - 1)) {
    if (low > 0) {
      low--
      total += (orderedScenes[low].text ?? '').trim().length + 1
    }
    if (total < maxChars && high < orderedScenes.length - 1) {
      high++
      total += (orderedScenes[high].text ?? '').trim().length + 1
    }
  }

  return orderedScenes
    .slice(low, high + 1)
    .map((scene) => (scene.text ?? '').trim())
    .filter((text) => text.length > 0)
    .join(' ')
}

export interface NarrationFragment {
  text: string
  // true si el corte cayó en un silencio: `text` es la narración vecina (o el
  // inicio del guion), no lo que se dice en esta escena.
  isSilent: boolean
}

// La narración que un redactor ilustra para una escena: la propia si la hay;
// si la escena es muda, la ventana de vecinas, y como último recurso el inicio
// del guion. Toda escena con tiempos lleva prompt e imagen (el render lo
// exige), así que ninguna queda sin fragmento.
export function narrationFragmentFor(
  scene: Scene,
  orderedScenes: Scene[],
  fullScript: string,
): NarrationFragment {
  const own = (scene.text ?? '').trim()
  if (own) return { text: own, isSilent: false }

  const window = buildContextWindow(
    orderedScenes,
    scene.id,
    SILENT_SCENE_WINDOW_CHARS,
  )
  return {
    text: window || fullScript.slice(0, SILENT_SCENE_WINDOW_CHARS).trim(),
    isSilent: true,
  }
}

export interface ScenePromptInputs {
  // Fragmento a ilustrar: narración auto-cortada o pedido manual del usuario.
  fragment: string
  sceneId: number
  totalScenes: number
  styleName: string
  contextWindow: string
  startSeconds?: number
  endSeconds?: number
  visualBible?: string
  // true cuando `fragment` es una descripción que el USUARIO escribió a
  // propósito (regeneración manual): se dibuja LO QUE PIDE, no la narración.
  isUserRequest: boolean
  // true cuando la escena es muda y `fragment` es la narración vecina: la rama
  // automática avisa que hay que ilustrar la pausa entre esas líneas. Sin
  // efecto en la rama de pedido manual.
  isSilentPause: boolean
  // Bloque DURO de personajes + SCENE PLAN del director, ya ensamblados
  // (vacíos cuando no aplican). Se inyectan arriba del task en ambas ramas.
  mandatoryBlock: string
  // Nombre inglés del idioma del guion; "" → el LLM lo infiere.
  imageTextLanguage: string
}

export function buildSceneUserPrompt(inputs: ScenePromptInputs): string {
  const languageBlock = buildImageTextLanguageBlock(inputs.imageTextLanguage)
  const range =
    inputs.startSeconds != null && inputs.endSeconds != null
      ? `${inputs.startSeconds.toFixed(1)}s - ${inputs.endSeconds.toFixed(1)}s`
      : `(unknown range)`

  // Suavizar el texto narrativo que ve el LLM para que no eche mano de
  // palabras marcables al redactar (los reemplazos preservan el beat).
  const safeFragment = sanitizeNarration(inputs.fragment)
  const safeWindow = sanitizeNarration(inputs.contextWindow)

  // Rotaciones determinísticas por índice de escena: punto de vista para
  // escenas atmosféricas, ángulo de cámara y TIPO de plano.
  const varietyHint =
    SHOT_VARIETY_ROTATION[inputs.sceneId % SHOT_VARIETY_ROTATION.length]
  const cameraHint =
    CAMERA_HINT_ROTATION[inputs.sceneId % CAMERA_HINT_ROTATION.length]
  const shotTypeHint =
    SHOT_TYPE_ROTATION[inputs.sceneId % SHOT_TYPE_ROTATION.length]

  // Ancla de época: si la biblia fija una era no-presente, el párrafo STORY
  // ERA del bloque de fondo invierte el default present-day.
  const eraGlobalLock = deriveEraFromBible(inputs.visualBible)
  const backgroundBlock = buildBackgroundBlock(eraGlobalLock)

  // El contexto global fija el LOOK del mundo — no obliga a que cada escena
  // ocurra en la locación que menciona.
  const contextSection = inputs.visualBible
    ? `\n# GLOBAL VISUAL CONTEXT (the consistent LOOK for every scene)\nThis defines the art direction, color palette, lighting, mood, era and the recurring characters/world for all ${inputs.totalScenes} images, so the whole video feels like one cohesive piece. Render every image in THIS visual style.\n\nConsistency is about the LOOK — NOT about repeating the same subject or the same shot:\n- Keep the same art style, palette, lighting, mood and world in every scene.\n- Recurring characters or signature objects keep their design WHEN they appear, but they do NOT have to appear in every scene. Show whatever THIS scene's narration is actually about — a place, a detail, a secondary character, an object, an action, a wide establishing shot or a close-up.\n- Deliberately VARY the composition, camera angle, framing, distance, subject and action from one scene to the next so the video feels dynamic and never monotonous.\n- The GLOBAL VISUAL CONTEXT pins the LOOK of the world — it does NOT force every scene to happen in the location it mentions; you may cut to another place, a detail or a visual metaphor when THIS scene's narration calls for it, keeping the same look and palette.\n\n--- GLOBAL VISUAL CONTEXT ---\n${inputs.visualBible}\n--- END GLOBAL VISUAL CONTEXT ---\n`
    : ''

  // Rama de pedido manual: el fragmento ES lo que hay que dibujar.
  if (inputs.isUserRequest) {
    return `You are generating image prompt ${inputs.sceneId} of ${inputs.totalScenes} for a Spanish ${inputs.styleName} narrated video.
${contextSection}${inputs.mandatoryBlock}
# YOUR TASK
The user has EXPLICITLY written what THIS scene must show. It is a deliberate instruction — NOT an auto-extracted fragment — so depict the requested subject and action FAITHFULLY. Do NOT swap it for something else from the surrounding story.${inputs.mandatoryBlock.includes('MANDATORY CHARACTER') ? "\n(Reminder: every MANDATORY CHARACTER block above still applies. Every listed character MUST appear with its canonical identity. Apply the user's requested change ONLY to the character/trait it explicitly names; keep all other mandatory characters exactly as defined and in a coherent place in the scene — never drop the character the request does not mention.)" : ''}

--- USER REQUEST (what to depict) ---
${safeFragment}
--- END USER REQUEST ---

Generate ONE image prompt that shows the USER REQUEST above, rendered in the ${inputs.styleName} style and visually consistent with the GLOBAL VISUAL CONTEXT (world, color palette, art direction, mood) so it matches the other scenes of this video. The USER REQUEST defines WHAT to show; the style and global context define HOW it looks (lighting, palette, atmosphere). Keep the requested subject front and center.
${backgroundBlock}${languageBlock}
${PROMPT_SAFETY_BLOCK}

Output the JSON object only, no preamble.`
  }

  return `You are generating image prompt ${inputs.sceneId} of ${inputs.totalScenes} for a Spanish ${inputs.styleName} narrated video.
${contextSection}${inputs.mandatoryBlock}
# SURROUNDING NARRATION (CONTEXT WINDOW)
Below is the narration immediately around this moment (the lines just before and after). Use it to understand what is happening narratively right here — who, where, what action, what emotion. The persistent world (characters, setting, palette) is already fixed by the GLOBAL VISUAL CONTEXT above; this window is only for the LOCAL narrative beat.

--- SURROUNDING NARRATION ---
${safeWindow}
--- END SURROUNDING NARRATION ---

# YOUR TASK
Generate ONE image prompt for the moment that occurs at video time ${range} (scene ${inputs.sceneId} of ${inputs.totalScenes}).
${inputs.isSilentPause ? SILENT_PAUSE_BLOCK : ''}
The fragment below was extracted automatically by audio timestamp, so it MAY:
  - Start mid-sentence or mid-word.
  - End mid-sentence or mid-word.
  - Lack pronoun antecedents or connectors.

Do NOT generate the image based on the literal cut-off words. Instead:
  1. Read the surrounding narration above to see what is actually happening at this point.
  2. Understand the narrative beat (which character, where, what action, what emotion).
  3. Decide the SUBJECT of THIS image from the narration:
     - If the narration here names or clearly refers to a SPECIFIC subject — a character, a place, an object, an action — make THAT subject the clear focus of the image. If it is a recurring character/object from the GLOBAL VISUAL CONTEXT, draw it with its established design so it stays consistent across the video.
     - If the narration here is ABSTRACT — an emotion, an idea, an opinion or a life lesson with no concrete action or place to point at — do NOT default to a character standing in the usual location and do NOT show a generic empty place: stage a clear VISUAL METAPHOR or allusive mini-scene that embodies the idea (e.g. "promises break" → a snapped rope still swinging). If a MANDATORY CHARACTER block above puts a character in this scene, build the metaphor AROUND that character with their canonical identity fully intact; otherwise stage the symbolic scene on its own, following the character rules above.
     - If the narration here says someone thinks, remembers, imagines or dreams something, you may draw a THOUGHT BUBBLE above them holding ONE simple picture of that thought — imagery only, NEVER any words, letters or text inside the bubble.
     - If the narration here implies OTHER people (looks, judgement, laughter, a crowd, someone watching), show them too — anonymous and clearly distinct from each other and from any main character (the anti-clone rules above apply); skip this ONLY if a block above forbids people in this scene. COLLECTIVES COUNT AS PEOPLE: when the narration names groups, institutions or collectives (governments, armies, analysts, officials, teams, "people" in general, a nation acting), do NOT default to yet another solo shot or an empty symbol — staging that COLLECTIVE as a GROUP of several distinct anonymous characters (a briefing room, a command center, a crowd, a team at work) is usually the strongest visual; give each one clothing colors and hair different from each other and from any main character. THE COUNTERPART IS NEVER OMITTED: when the narration describes an interaction (a handshake, a signing, a meeting, an argument) or names another figure acting (a president, a leader, a rival), DRAW that other party too, sharing the frame with the main character — a real, named public figure is drawn RECOGNIZABLE: keep their most iconic public features (signature hair and facial hair, kit and shirt number, tattoos) stylized in this same art style, never watered down into an anonymous stranger; anyone unnamed stays an anonymous generic — do NOT leave the main character interacting with empty air or acting out someone else's action alone.
     - If the narration here is GENERIC or atmospheric and does NOT introduce a specific new subject (e.g. "an island with green leaves", "the sea at night", a reflective or transitional line), depict that SAME described setting/idea but NOT as a plain repeat of the previous frames: change the point of view — for this scene prefer ${varietyHint} — or focus on a different detail, plant, creature, texture or moment of light within it, so the video keeps moving visually instead of showing the same image again.
     - SHOT TYPE VARIETY — whatever subject you pick, the video must MIX scene types like a professional edit: action beats, expressive emotion close-ups, visual metaphors, reaction/interaction shots, cut-aways and explanatory visuals — never the same type of shot in the same place scene after scene. Unless the narration clearly demands otherwise, for THIS scene prefer ${shotTypeHint}. If a block above forbids people in this scene — or allows people ONLY when the narration implies them — ignore any people-based part of that hint and pick the strongest people-free visual instead (a metaphor, a symbolic object, a fresh detail of the place). If this TYPE hint and the camera-angle hint in step 4 point different ways, the TYPE hint wins.
  4. Render it in the global visual style (same palette, lighting, mood and art direction). ALWAYS vary the composition, camera angle, framing and distance from the neighbouring scenes so consecutive images never look like duplicates — for THIS scene prefer ${cameraHint}, unless the narration clearly demands a specific framing. State the chosen framing EXPLICITLY inside the prompt you write (include the words — "wide shot", "close-up", "medium shot", "seen from behind", "over-the-shoulder", "low-angle"... — as part of the image description): image generators only respect a framing that is written in the prompt. Likewise, whenever a character or figure appears in this scene, name their facial EXPRESSION and body language explicitly in the prompt (determined, worried, relieved, dejected...) — generators default to a blank face unless the emotion is written. And whenever the scene shows an INTERIOR (a gym, an office, a bedroom, a hallway), also write the words "plain bare walls, no posters, no signs, no readable text anywhere" in the prompt — generators hang wordy posters on interior walls unless that phrase is written (skip it ONLY when a rule above asks you to write a labelled diagram in this very scene). If this scene's best visual is an explanatory diagram or labelled illustration, the camera hints do not apply — lay the diagram out clearly and readably instead, but the era rules (BACKGROUND & SETTING / STORY ERA) still apply: the diagram remains an artifact of the story's era.

--- FRAGMENT (audio time ${range}) ---
${safeFragment}
--- END FRAGMENT ---
${backgroundBlock}${languageBlock}
${PROMPT_SAFETY_BLOCK}

Output the JSON object only, no preamble.`
}
