import type { SubcommandHandler } from '../../runner/subcommand.ts'
import { avatarAdd } from './avatar-add.ts'
import { avatarCreatePhoto } from './avatar-create-photo.ts'
import { avatarDelete } from './avatar-delete.ts'
import { avatarRefresh } from './avatar-refresh.ts'
import { avatarStockLooks } from './avatar-stock-looks.ts'
import { avatarsList } from './avatars-list.ts'

// Todos llevan «avatar» en el nombre para que el diagnóstico los agrupe en su
// familia (ADR-0038), como hacen los de personajes y estilos.
export const avatarsSubcommands: Record<string, SubcommandHandler> = {
  'avatars-list': avatarsList,
  'avatar-stock-looks': avatarStockLooks,
  'avatar-add': avatarAdd,
  'avatar-create-photo': avatarCreatePhoto,
  'avatar-refresh': avatarRefresh,
  'avatar-delete': avatarDelete,
}
