import type { SubcommandHandler } from '../../runner/subcommand.ts'
import { styleDelete } from './style-delete.ts'
import { styleSave } from './style-save.ts'
import { stylesList } from './styles-list.ts'

// Subcomandos del dominio de estilos propios («Mi estilo»). Cada dominio
// exporta su propio mapa y main.ts los esparce en SUBCOMMANDS.
export const stylesSubcommands: Record<string, SubcommandHandler> = {
  'styles-list': stylesList,
  'style-save': styleSave,
  'style-delete': styleDelete,
}
