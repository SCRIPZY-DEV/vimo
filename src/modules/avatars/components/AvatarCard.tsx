import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Trash2 } from 'lucide-react'
import { CharacterPortrait } from '@/modules/common/components/CharacterPortrait'
import { Button } from '@/modules/common/ui/button'
import { Skeleton } from '@/modules/common/ui/skeleton'
import { cn } from '@/modules/common/utilities/cn'
import { avatarsApi } from '@/modules/avatars/api'
import { AvatarTrainingStatus } from '@/modules/avatars/components/AvatarTrainingStatus'
import {
  CARD_SIDE_LOOKS,
  VIMO_AVATAR_ENGINE,
} from '@/modules/avatars/constants'
import type { AvatarSummary } from '@pipeline/types/avatar.ts'

interface AvatarCardProps {
  avatar: AvatarSummary
  disabled: boolean
  onOpen: (avatar: AvatarSummary) => void
  onDelete: (avatar: AvatarSummary) => void
}

// Una tarjeta por avatar: vista previa vertical anclada arriba (la cara
// siempre a la vista) y, si tiene otros looks a mano, dos miniaturas a la
// derecha como en HeyGen; nombre, cuántos looks tiene, el tipo y solo el
// motor que Vimo usa (los del look principal); mientras entrena, el estado
// del entrenamiento, y si falló, el motivo. La imagen y el nombre abren el
// panel del avatar. Borrado en dos pasos, como las tarjetas de personajes (el
// ícono se vuelve un botón rojo «Seguro»).
export function AvatarCard({
  avatar,
  disabled,
  onOpen,
  onDelete,
}: AvatarCardProps) {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState(false)

  const preview = avatar.previewPath
    ? avatarsApi.imageSource(avatar.previewPath)
    : null
  // El tipo y los motores son los del look principal (un avatar es un grupo de
  // HeyGen con sus looks); sin principal todavía, la tarjeta no los muestra.
  const mainLook = avatar.looks.find(
    (look) => look.lookId === avatar.mainLookId,
  )
  const supportsVimo =
    mainLook?.supportedEngines.includes(VIMO_AVATAR_ENGINE) ?? false
  // Mientras entrena (o si falló) todavía no se saben sus motores: «No
  // compatible» solo se afirma de un avatar listo.
  const unsupported = avatar.status === 'ready' && !supportsVimo
  // A la derecha, los primeros otros looks con vista previa en disco (el
  // sidecar baja la del principal y las de los dos siguientes) o que se están
  // generando; con uno solo, ocupa todo el alto, sin huecos.
  const sideLooks = avatar.looks
    .filter(
      (look) =>
        look.lookId !== avatar.mainLookId &&
        (look.previewPath !== undefined || look.status === 'processing'),
    )
    .slice(0, CARD_SIDE_LOOKS)
  const tallSide = sideLooks.length === 1

  return (
    <article
      onMouseLeave={() => setConfirming(false)}
      className="flex h-full flex-col overflow-hidden rounded-2xl border-2 border-border bg-card shadow-card transition-colors hover:border-saffron/50"
    >
      {/* El clic en la imagen es un atajo del mouse: con el teclado se abre
          desde el nombre. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        onClick={() => onOpen(avatar)}
        className="relative block aspect-[4/5] w-full overflow-hidden"
      >
        {sideLooks.length === 0 ? (
          <CharacterPortrait
            src={preview}
            doodleSize={72}
            focus="top"
            className="h-full w-full"
          />
        ) : (
          <div className="grid h-full w-full grid-cols-3 grid-rows-2 gap-0.5 bg-card">
            <CharacterPortrait
              src={preview}
              doodleSize={72}
              focus="top"
              className="col-span-2 row-span-2"
            />
            {sideLooks.map((look) => {
              if (look.status === 'processing') {
                return (
                  <div
                    key={look.lookId}
                    className={cn('relative', tallSide && 'row-span-2')}
                  >
                    <Skeleton className="absolute inset-0 rounded-none bg-muted-foreground/15" />
                    <Loader2
                      aria-hidden
                      className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
                    />
                  </div>
                )
              }

              return (
                <CharacterPortrait
                  key={look.lookId}
                  src={
                    look.previewPath
                      ? avatarsApi.imageSource(look.previewPath)
                      : null
                  }
                  doodleSize={28}
                  focus="top"
                  className={cn(tallSide && 'row-span-2')}
                />
              )
            })}
          </div>
        )}
      </button>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-center gap-2">
          {/* `data-avatar-id`: la biblioteca devuelve el foco acá al cerrar
              el panel del avatar. */}
          <button
            type="button"
            data-avatar-id={avatar.id}
            disabled={disabled}
            onClick={() => onOpen(avatar)}
            className="min-w-0 truncate rounded-sm text-left font-display text-base font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron"
          >
            {avatar.name}
          </button>
          {avatar.looks.length > 1 && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-display text-[10px] font-bold tabular-nums text-muted-foreground">
              {t('avatars.stock.looksCount', { count: avatar.looks.length })}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {mainLook && (
            <span className="rounded bg-muted px-1.5 py-0.5 font-display text-[10px] font-bold text-muted-foreground">
              {t(`avatars.types.${mainLook.lookType}`)}
            </span>
          )}
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

        <AvatarTrainingStatus
          status={avatar.status}
          errorCode={avatar.errorCode}
        />

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
