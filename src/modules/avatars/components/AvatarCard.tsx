import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import { CharacterPortrait } from '@/modules/common/components/CharacterPortrait'
import { Button } from '@/modules/common/ui/button'
import { avatarsApi } from '@/modules/avatars/api'
import { AvatarTrainingStatus } from '@/modules/avatars/components/AvatarTrainingStatus'
import { VIMO_AVATAR_ENGINE } from '@/modules/avatars/constants'
import type { AvatarSummary } from '@pipeline/types/avatar.ts'

interface AvatarCardProps {
  avatar: AvatarSummary
  disabled: boolean
  onDelete: (avatar: AvatarSummary) => void
}

// Una tarjeta por avatar: vista previa vertical anclada arriba (la cara
// siempre a la vista), nombre, tipo y solo el motor que Vimo usa; mientras
// entrena o si falló, el estado del entrenamiento. Borrado en dos pasos, como
// las tarjetas de personajes (el ícono se vuelve un botón rojo «Seguro»).
export function AvatarCard({ avatar, disabled, onDelete }: AvatarCardProps) {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState(false)

  const preview = avatar.previewPath
    ? avatarsApi.imageSource(avatar.previewPath)
    : null
  const supportsVimo = avatar.supportedEngines.includes(VIMO_AVATAR_ENGINE)
  // Mientras entrena (o si falló) todavía no se saben sus motores: «No
  // compatible» solo se afirma de un avatar listo.
  const unsupported = avatar.status === 'ready' && !supportsVimo

  return (
    <article
      onMouseLeave={() => setConfirming(false)}
      className="flex h-full flex-col overflow-hidden rounded-2xl border-2 border-border bg-card shadow-card"
    >
      <CharacterPortrait
        src={preview}
        doodleSize={72}
        focus="top"
        className="aspect-[4/5]"
      />

      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="truncate font-display text-base font-bold text-foreground">
          {avatar.name}
        </h3>
        <div className="flex flex-wrap gap-1">
          <span className="rounded bg-muted px-1.5 py-0.5 font-display text-[10px] font-bold text-muted-foreground">
            {t(`avatars.types.${avatar.lookType}`)}
          </span>
          {supportsVimo && (
            <span className="rounded bg-saffron/15 px-1.5 py-0.5 font-display text-[10px] font-bold text-foreground">
              {t(`avatars.engines.${VIMO_AVATAR_ENGINE}`)}
            </span>
          )}
          {unsupported && (
            <span className="rounded bg-destructive/15 px-1.5 py-0.5 font-display text-[10px] font-bold text-foreground">
              {t('avatars.tarjeta.noCompatible')}
            </span>
          )}
        </div>

        <AvatarTrainingStatus status={avatar.status} />

        <div className="mt-auto flex items-center justify-end pt-1">
          {confirming ? (
            <Button
              variant="destructive"
              size="sm"
              disabled={disabled}
              onClick={() => onDelete(avatar)}
              onBlur={() => setConfirming(false)}
              className="rounded-lg font-display"
            >
              {t('avatars.tarjeta.confirmar')}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              disabled={disabled}
              onClick={() => setConfirming(true)}
              aria-label={t('avatars.tarjeta.eliminar')}
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}
