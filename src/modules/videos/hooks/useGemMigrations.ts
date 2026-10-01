import { useSyncExternalStore } from 'react'
import i18next from 'i18next'
import { Brand } from '@/modules/common/brand/brand'
import { queryClient } from '@/modules/common/queryClient'
import { videosApi } from '@/modules/videos/api'
import { videosQueryKeys } from '@/modules/videos/constants'
import {
  createGemMigrations,
  migrateStoredGem,
} from '@/modules/videos/utilities/gemMigrations'
import {
  gemRebuildRequest,
  migrationRebuildText,
  migrationStyleSavePayload,
} from '@/modules/videos/utilities/gemTemplate'
import type {
  GemMigrationState,
  GemMigrationSteps,
} from '@/modules/videos/types/styles'

// Los pasos reales de una migración (migrateStoredGem decide el orden): lo
// guardado en el sidecar; el agente con `origin: 'migracion'` (el texto de la
// gema y sus planos); y el guardado de sus secciones con ese texto de
// respaldo, que espera la lista nueva: el aviso se apaga recién cuando la
// galería ya muestra la gema migrada.
const migrationSteps: GemMigrationSteps = {
  async findStored(styleId) {
    const { entries } = await videosApi.listCustomStyles()
    return entries.find((entry) => entry.id === styleId)
  },
  rebuild(style) {
    return videosApi.rebuildGem(
      gemRebuildRequest(
        migrationRebuildText(style),
        'migracion',
        Brand.version,
        i18next.resolvedLanguage,
      ),
    )
  },
  async save(style, response) {
    await videosApi.saveCustomStyle(migrationStyleSavePayload(style, response))
    await queryClient.invalidateQueries({
      queryKey: videosQueryKeys.customStyles,
    })
  },
}

const gemMigrations = createGemMigrations((style) =>
  migrateStoredGem(style.id, migrationSteps),
)

// Automática: una vez por gema y por sesión (spec §4.4).
export const migrateGemOnce = gemMigrations.migrateOnce
// «Reintentar» del aviso.
export const retryGemMigration = gemMigrations.retry

// Las migraciones en vuelo o fallidas, por id de gema.
export function useGemMigrations(): ReadonlyMap<string, GemMigrationState> {
  return useSyncExternalStore(
    gemMigrations.subscribe,
    gemMigrations.getSnapshot,
  )
}
