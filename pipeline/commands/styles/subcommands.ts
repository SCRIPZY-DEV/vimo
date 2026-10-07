import type { SubcommandHandler } from '../../runner/subcommand.ts'
import { designStyleCharacter } from './design-style-character.ts'
import { generateStyleSamples } from './generate-style-samples.ts'
import { listPromptModels } from './list-prompt-models.ts'
import { styleCloneDiscard } from './style-clone-discard.ts'
import { styleCloneDraw } from './style-clone-draw.ts'
import { styleClonePrepare } from './style-clone-prepare.ts'
import { styleCloneSave } from './style-clone-save.ts'
import { styleDelete } from './style-delete.ts'
import { styleSave } from './style-save.ts'
import { stylesList } from './styles-list.ts'

// Subcomandos del dominio de estilos propios («Mi estilo»). Cada dominio
// exporta su propio mapa y main.ts los esparce en SUBCOMMANDS.
export const stylesSubcommands: Record<string, SubcommandHandler> = {
  'styles-list': stylesList,
  'style-save': styleSave,
  'style-delete': styleDelete,
  'generate-style-samples': generateStyleSamples,
  'list-prompt-models': listPromptModels,
  'design-style-character': designStyleCharacter,
  // Creador de estilo con IA (ADR-0050): con «style» en el nombre para que el
  // diagnóstico los agrupe con los demás (ADR-0038).
  'style-clone-prepare': styleClonePrepare,
  'style-clone-draw': styleCloneDraw,
  'style-clone-save': styleCloneSave,
  'style-clone-discard': styleCloneDiscard,
}
