import type { SubcommandHandler } from '../../runner/subcommand.ts'
import { avatarAdd } from './avatar-add.ts'
import { avatarBalance } from './avatar-balance.ts'
import { avatarCreatePhoto } from './avatar-create-photo.ts'
import { avatarDelete } from './avatar-delete.ts'
import { avatarGenerateLook } from './avatar-generate-look.ts'
import { avatarHeygenDelete } from './avatar-heygen-delete.ts'
import { avatarRefresh } from './avatar-refresh.ts'
import { avatarSetMainLook } from './avatar-set-main-look.ts'
import { avatarStockGroups } from './avatar-stock-groups.ts'
import { avatarStockLooks } from './avatar-stock-looks.ts'
import { avatarStockTypes } from './avatar-stock-types.ts'
import { avatarsList } from './avatars-list.ts'

// Todos llevan «avatar» en el nombre para que el diagnóstico los agrupe en su
// familia (ADR-0038), como hacen los de personajes y estilos.
export const avatarsSubcommands: Record<string, SubcommandHandler> = {
  'avatars-list': avatarsList,
  'avatar-stock-groups': avatarStockGroups,
  'avatar-stock-looks': avatarStockLooks,
  'avatar-stock-types': avatarStockTypes,
  'avatar-add': avatarAdd,
  'avatar-create-photo': avatarCreatePhoto,
  'avatar-refresh': avatarRefresh,
  'avatar-set-main-look': avatarSetMainLook,
  'avatar-generate-look': avatarGenerateLook,
  'avatar-balance': avatarBalance,
  'avatar-delete': avatarDelete,
  // Borra el avatar de la cuenta de HeyGen, no solo de la biblioteca.
  'avatar-heygen-delete': avatarHeygenDelete,
}
