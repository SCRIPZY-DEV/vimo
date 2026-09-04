import type { SubcommandHandler } from '../../runner/subcommand.ts'
import { designStyleCharacter } from './design-style-character.ts'
import { generateStyleSamples } from './generate-style-samples.ts'
import { listPromptModels } from './list-prompt-models.ts'
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
}
