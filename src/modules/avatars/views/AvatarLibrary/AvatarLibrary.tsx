import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { ImagePlus, Plus } from 'lucide-react'
import DoodleHappyFace from '@/modules/common/doodles/DoodleHappyFace'
import { usePageTitle } from '@/modules/common/hooks/usePageTitle'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { ViewSpinner } from '@/modules/common/components/ViewSpinner'
import { Button } from '@/modules/common/ui/button'
import { cn } from '@/modules/common/utilities/cn'
import { MissingApiKeysNotice } from '@/modules/api-keys/components/MissingApiKeysNotice'
import { MODULE_API_KEY_REQUIREMENTS } from '@/modules/api-keys/constants'
import { useRequiredApiKeys } from '@/modules/api-keys/hooks/useRequiredApiKeys'
import { AvatarCard } from '@/modules/avatars/components/AvatarCard'
import { CreatePhotoAvatarDialog } from '@/modules/avatars/components/CreatePhotoAvatarDialog'
import { StockLooksDialog } from '@/modules/avatars/components/StockLooksDialog'
import { useAvatarMutations } from '@/modules/avatars/hooks/useAvatarMutations'
import { useAvatars } from '@/modules/avatars/hooks/useAvatars'
import { useProcessingAvatarsRefresh } from '@/modules/avatars/hooks/useProcessingAvatarsRefresh'

type OpenDialog = 'stock' | 'photo' | null

// Biblioteca de avatares (ADR-0057, entrega 1): los de stock de HeyGen y los
// creados desde una foto, listos para elegir al crear un video (entrega 2).
export function AvatarLibrary() {
  const { t } = useTranslation()
  const { isNative, entries, isLoading, errorKey } = useAvatars()
  const { deleteAvatar } = useAvatarMutations()
  const { missingKeys, ready } = useRequiredApiKeys({
    requirements: MODULE_API_KEY_REQUIREMENTS.avatars,
  })
  const [dialog, setDialog] = useState<OpenDialog>(null)

  usePageTitle(t('avatars.pageTitle'))
  useProcessingAvatarsRefresh(entries)

  // Hablar con HeyGen exige su clave: los botones esperan a que el llavero
  // responda (`ready` es falso mientras carga) y, sin clave, al aviso.
  const canUseHeyGen = isNative && ready

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-8 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3">
          <DoodleHappyFace size={48} delay={100} />
          <div>
            <h1 className="font-display text-3xl font-extrabold text-foreground">
              {t('avatars.titulo')}
            </h1>
            <p className="font-handwritten text-lg text-muted-foreground">
              {t('avatars.tagline')}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="lg"
            variant="outline"
            disabled={!canUseHeyGen}
            onClick={() => setDialog('stock')}
            className="rounded-xl font-display font-bold"
          >
            <Plus className="mr-2 h-4 w-4" />
            {t('avatars.agregarStock')}
          </Button>
          <Button
            size="lg"
            disabled={!canUseHeyGen}
            onClick={() => setDialog('photo')}
            className="rounded-xl font-display font-bold"
          >
            <ImagePlus className="mr-2 h-4 w-4" />
            {t('avatars.crearFoto')}
          </Button>
        </div>
      </motion.div>

      {!isNative && (
        <p className="font-body text-sm text-saffron">
          {t('avatars.soloEscritorio')}
        </p>
      )}
      <p className="font-body text-sm text-muted-foreground">
        {t('avatars.intro')}
      </p>

      {missingKeys && (
        <MissingApiKeysNotice
          requirements={MODULE_API_KEY_REQUIREMENTS.avatars}
        />
      )}
      {errorKey && <ErrorMessage>{t(errorKey)}</ErrorMessage>}
      {isLoading && <ViewSpinner className="py-12" />}

      {!isLoading && entries.length === 0 && isNative && !errorKey && (
        <button
          type="button"
          disabled={!canUseHeyGen}
          onClick={() => setDialog('stock')}
          className="flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border p-12 text-center transition-colors hover:border-saffron/50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <DoodleHappyFace size={64} />
          <span className="font-display text-lg font-bold text-foreground">
            {t('avatars.vacio.titulo')}
          </span>
          <span className="max-w-md font-body text-sm text-muted-foreground">
            {t('avatars.vacio.texto')}
          </span>
        </button>
      )}

      {entries.length > 0 && (
        <motion.ul
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'grid auto-rows-fr grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4',
            !isNative && 'pointer-events-none opacity-60',
          )}
        >
          {entries.map((entry) => (
            <li key={entry.id}>
              <AvatarCard
                avatar={entry}
                disabled={!isNative}
                onDelete={(avatar) => deleteAvatar(avatar.id)}
              />
            </li>
          ))}
        </motion.ul>
      )}

      {dialog === 'stock' && (
        <StockLooksDialog entries={entries} onClose={() => setDialog(null)} />
      )}
      {dialog === 'photo' && (
        <CreatePhotoAvatarDialog onClose={() => setDialog(null)} />
      )}
    </div>
  )
}
