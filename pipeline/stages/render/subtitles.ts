import type { NarrationSentence } from '../../narration/sentences.ts'
import type { ProjectPaths } from '../../project/paths.ts'
import type { Scene } from '../../types/scenes.ts'
import type { FrameSize } from '../../types/video-format.ts'
import { writeFileAtomic } from '../../utils/atomic-fs.ts'
import {
  SUBTITLE_FONT_DIVISOR,
  SUBTITLE_FONT_NAME,
  SUBTITLE_MARGIN_HORIZONTAL_DIVISOR,
  SUBTITLE_MARGIN_VERTICAL_DIVISOR,
  SUBTITLE_OUTLINE,
  SUBTITLE_SHADOW,
} from './constants.ts'

// Subtítulos quemados: el texto de cada escena se escribe abajo del video. Se
// DERIVA de scenes.json (text + startSeconds/endSeconds ya están ahí), así que
// no hace falta nada nuevo del transcriptor. Entra solo en la mezcla final: el
// cache de chunks sigue siendo válido.
//
// Se escribe ASS y no SRT a propósito: con SRT, libass toma su resolución de
// referencia (384×288) y escala el tamaño de fuente al frame — el texto salía
// gigante. Con PlayResX/Y = el frame, lo que se pide es lo que se ve.

function timecode(seconds: number): string {
  const total = Math.max(0, seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const wholeSeconds = Math.floor(total % 60)
  // ASS mide en centésimas, no en milésimas.
  const centiseconds = Math.round((total - Math.floor(total)) * 100)
  const pad = (value: number) => String(value).padStart(2, '0')

  return `${hours}:${pad(minutes)}:${pad(wholeSeconds)}.${pad(centiseconds)}`
}

// Las llaves abren overrides de estilo en ASS y un salto de línea corta el
// evento: el texto del guion viaja como texto, no como marcado.
function escapeDialogue(text: string): string {
  return text.replace(/[{}]/g, '').replace(/\r?\n/g, '\\N').trim()
}

function header(frame: FrameSize): string {
  const fontSize = Math.round(
    Math.min(frame.width, frame.height) / SUBTITLE_FONT_DIVISOR,
  )
  const marginVertical = Math.round(
    frame.height / SUBTITLE_MARGIN_VERTICAL_DIVISOR,
  )
  const marginHorizontal = Math.round(
    frame.width / SUBTITLE_MARGIN_HORIZONTAL_DIVISOR,
  )

  return (
    '[Script Info]\n' +
    'ScriptType: v4.00+\n' +
    `PlayResX: ${frame.width}\n` +
    `PlayResY: ${frame.height}\n` +
    'WrapStyle: 0\n' +
    'ScaledBorderAndShadow: yes\n' +
    '\n' +
    '[V4+ Styles]\n' +
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, ' +
    'OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ' +
    'ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, ' +
    'MarginL, MarginR, MarginV, Encoding\n' +
    `Style: Default,${SUBTITLE_FONT_NAME},${fontSize},&H00FFFFFF,` +
    `&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,` +
    `${SUBTITLE_OUTLINE},${SUBTITLE_SHADOW},2,${marginHorizontal},` +
    `${marginHorizontal},${marginVertical},1\n` +
    '\n' +
    '[Events]\n' +
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, ' +
    'Effect, Text\n'
  )
}

interface SubtitleCue {
  startSeconds: number
  endSeconds: number
  text: string
}

// Hasta dónde habla una frase: su última palabra; la pausa que la sigue
// pertenece a la frase pero no se dice. Sin ese dato (frases armadas a mano),
// la frase entera.
function spokenEnd(sentence: NarrationSentence): number {
  if (!Number.isFinite(sentence.lastWordEndSeconds)) return sentence.endSeconds

  return Math.min(sentence.endSeconds, sentence.lastWordEndSeconds)
}

// Las líneas de una escena: una sola con todo su texto, salvo la de un avatar
// (ADR-0057), que habla hasta 60 s: ahí va una línea por frase de la
// narración, recortada al tramo de la escena. Una frase es de la escena si el
// punto medio de su parte hablada (de su inicio a su última palabra) cae
// adentro: con el tope de silencio del planificador (entrega 2b) la última
// frase de una aparición puede terminar mucho después de la escena y, medida
// entera, sus palabras no se subtitularían en ningún lado. La primera línea
// arranca con la escena y la última termina con ella, así no queda un hueco
// sin subtítulo. Sin frases (un proyecto sin `words.json`), la de avatar
// también sale entera.
function sceneCues(
  scene: Scene,
  sentences: readonly NarrationSentence[],
): SubtitleCue[] {
  const startSeconds = scene.startSeconds!
  const endSeconds = scene.endSeconds!
  const whole = [{ startSeconds, endSeconds, text: scene.text }]
  if (!scene.avatar) return whole

  const inside = sentences.filter((sentence) => {
    const middle = (sentence.startSeconds + spokenEnd(sentence)) / 2
    return (
      middle >= startSeconds &&
      middle < endSeconds &&
      sentence.text.trim().length > 0
    )
  })
  if (inside.length === 0) return whole

  return inside.map((sentence, index) => {
    const isFirst = index === 0
    const isLast = index === inside.length - 1
    return {
      startSeconds: isFirst
        ? startSeconds
        : Math.max(startSeconds, sentence.startSeconds),
      endSeconds: isLast
        ? endSeconds
        : Math.min(endSeconds, sentence.endSeconds),
      text: sentence.text,
    }
  })
}

function dialogueLine(cue: SubtitleCue): string {
  return (
    `Dialogue: 0,${timecode(cue.startSeconds)},` +
    `${timecode(cue.endSeconds)},Default,,0,0,0,,` +
    `${escapeDialogue(cue.text)}\n`
  )
}

// Devuelve la ruta del .ass escrito, o undefined si no hay ni una línea que
// escribir (proyecto sin timestamps, o escenas todas en silencio). Las frases
// de la narración (`detectSentences`) solo las usa una escena de avatar; sin
// ellas, todas salen con una línea por escena, como siempre.
export async function writeSubtitlesFile(
  paths: ProjectPaths,
  scenes: Scene[],
  frame: FrameSize,
  sentences: readonly NarrationSentence[] = [],
): Promise<string | undefined> {
  const cues = scenes.filter(
    (scene) =>
      scene.startSeconds !== undefined &&
      scene.endSeconds !== undefined &&
      scene.text.trim().length > 0,
  )
  if (cues.length === 0) return undefined

  const dialogues = cues
    .flatMap((scene) => sceneCues(scene, sentences))
    .map(dialogueLine)
    .join('')

  await writeFileAtomic(paths.subtitlesFile, `${header(frame)}${dialogues}`)

  return paths.subtitlesFile
}

// La ruta viaja DENTRO del filter_complex: los backslashes de Windows y los
// dos puntos de la letra de unidad rompen el parser de FFmpeg si no se
// escapan (`C:/…` → `C\:/…`).
function escapeFilterPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")
}

export function subtitlesFilter(subtitlesFile: string): string {
  return `subtitles=filename='${escapeFilterPath(subtitlesFile)}'`
}
