import { useState } from 'react'
import type { FocusEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { Skeleton } from '@/modules/common/ui/skeleton'
import { cn } from '@/modules/common/utilities/cn'
import { avatarsApi } from '@/modules/avatars/api'
import { AvatarTrainingStatus } from '@/modules/avatars/components/AvatarTrainingStatus'
import { LookPreview } from '@/modules/avatars/components/LookPreview'
import {
  CARD_SIDE_LOOKS,
  VIMO_AVATAR_ENGINE,
} from '@/modules/avatars/constants'
import { useHeyGenAccess } from '@/modules/avatars/hooks/useHeyGenAccess'
import { useHoverIntent } from '@/modules/avatars/hooks/useHoverIntent'
import { useStockLooks } from '@/modules/avatars/hooks/useStockLooks'
import type { AvatarSummary } from '@pipeline/types/avatar.ts'

interface AvatarCardProps {
  avatar: AvatarSummary
  disabled: boolean
  onOpen: (avatar: AvatarSummary) => void
  onDelete: (avatar: AvatarSummary) => void
}

// Una tarjeta por avatar: vista previa vertical anclada arriba (la cara
// siempre a la vista) y, si tiene otros looks a mano, dos miniaturas a la
// derecha como en HeyGen, en un mosaico sin huecos. Al pasar el mouse, cada
// imagen reproduce el video de su look (el foco del teclado en el nombre, el
// de la principal): los videos salen del listado de HeyGen del avatar, que se
// pide la primera vez que la persona se detiene en la tarjeta
// (`useHoverIntent`; gratis, con la misma caché que su panel). Debajo, compacto: el nombre, cuántos looks tiene y el borrado en
// dos pasos (el ícono se vuelve un botón rojo «Seguro»), y en otra fila el
// tipo y solo el motor que Vimo usa (los del look principal); mientras
// entrena, el estado del entrenamiento, y si falló, el motivo. La tarjeta
// llena la fila de la grilla (`h-full`) con el contenido arriba y sin empujar
// nada hacia abajo: solo junto a una tarjeta más alta de su fila queda aire
// al pie. La imagen y el nombre abren el panel del avatar.
export function AvatarCard({
  avatar,
  disabled,
  onOpen,
  onDelete,
}: AvatarCardProps) {
  const { t } = useTranslation()
  const { canUseHeyGen } = useHeyGenAccess()
  const [confirming, setConfirming] = useState(false)
  // Qué imagen está bajo el mouse: la principal o la miniatura de un look.
  const [mainHovered, setMainHovered] = useState(false)
  const [hoveredLookId, setHoveredLookId] = useState<string | null>(null)
  // El foco visible del teclado en el nombre: activa la principal. El foco
  // que la biblioteca devuelve al nombre al cerrar el panel con el mouse no
  // es visible y no la activa.
  const [nameFocused, setNameFocused] = useState(false)
  // Una tarjeta que nadie miró (o que el mouse solo cruzó) no gasta un
  // proceso del sidecar: los looks se piden con el mouse quieto sobre las
  // imágenes o con el foco del teclado en el nombre.
  const hoverIntent = useHoverIntent()
  // Mismo listado (y misma caché) que el panel del avatar: un avatar propio
  // se lista entre los privados de la cuenta.
  const remote = useStockLooks({
    ownership: avatar.ownership === 'own' ? 'private' : 'public',
    groupId: avatar.groupId,
    enabled: hoverIntent.hoveredOnce && canUseHeyGen,
  })
  const remoteVideos = new Map(
    remote.looks.map((look) => [look.lookId, look.previewVideoUrl]),
  )

  const preview = avatar.previewPath
    ? avatarsApi.imageSource(avatar.previewPath)
    : undefined
  const mainVideo = avatar.mainLookId
    ? remoteVideos.get(avatar.mainLookId)
    : undefined
  const mainActive = mainHovered || nameFocused
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

  const focusName = (event: FocusEvent<HTMLButtonElement>) => {
    const visible = event.currentTarget.matches(':focus-visible')
    setNameFocused(visible)
    if (visible) hoverIntent.focusedWithKeyboard()
  }

  const mainTile = (
    <span
      data-look-id={avatar.mainLookId ?? undefined}
      onMouseEnter={() => setMainHovered(true)}
      onMouseLeave={() => setMainHovered(false)}
      className={cn(
        'block h-full w-full',
        sideLooks.length > 0 && 'col-span-2 row-span-2',
      )}
    >
      <LookPreview
        imageUrl={preview}
        videoUrl={mainVideo}
        alt={t('avatars.stock.previewAria', { name: avatar.name })}
        active={mainActive}
        videoPending={mainActive && remote.isLoading}
        doodleSize={72}
        className="h-full w-full"
      />
    </span>
  )

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
        onMouseEnter={hoverIntent.pointerMoved}
        onMouseMove={hoverIntent.pointerMoved}
        onMouseLeave={hoverIntent.pointerLeft}
        className="relative block aspect-[4/5] w-full overflow-hidden"
      >
        {sideLooks.length === 0 ? (
          mainTile
        ) : (
          <span className="grid h-full w-full grid-cols-3 grid-rows-2 gap-px bg-border">
            {mainTile}
            {sideLooks.map((look) => {
              if (look.status === 'processing') {
                return (
                  <span
                    key={look.lookId}
                    className={cn(
                      'relative block h-full w-full bg-muted',
                      tallSide && 'row-span-2',
                    )}
                  >
                    <Skeleton className="absolute inset-0 rounded-none bg-muted-foreground/15" />
                    <Loader2
                      aria-hidden
                      className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
                    />
                  </span>
                )
              }

              const active = hoveredLookId === look.lookId
              return (
                <span
                  key={look.lookId}
                  data-look-id={look.lookId}
                  onMouseEnter={() => setHoveredLookId(look.lookId)}
                  onMouseLeave={() =>
                    setHoveredLookId((current) =>
                      current === look.lookId ? null : current,
                    )
                  }
                  className={cn(
                    'block h-full w-full',
                    tallSide && 'row-span-2',
                  )}
                >
                  <LookPreview
                    imageUrl={
                      look.previewPath
                        ? avatarsApi.imageSource(look.previewPath)
                        : undefined
                    }
                    videoUrl={remoteVideos.get(look.lookId)}
                    alt={t('avatars.stock.previewAria', { name: look.name })}
                    active={active}
                    videoPending={active && remote.isLoading}
                    doodleSize={28}
                    className="h-full w-full"
                  />
                </span>
              )
            })}
          </span>
        )}
      </button>

      <div className="space-y-1.5 px-3 py-2.5">
        <div className="flex items-center gap-2">
          {/* `data-avatar-id`: la biblioteca devuelve el foco acá al cerrar
              el panel del avatar. */}
          <button
            type="button"
            data-avatar-id={avatar.id}
            disabled={disabled}
            onClick={() => onOpen(avatar)}
            onFocus={focusName}
            onBlur={() => setNameFocused(false)}
            className="min-w-0 truncate rounded-sm text-left font-display text-base font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron"
          >
            {avatar.name}
          </button>
          {avatar.looks.length > 1 && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-display text-[10px] font-bold tabular-nums text-muted-foreground">
              {t('avatars.stock.looksCount', { count: avatar.looks.length })}
            </span>
          )}
          <div className="ml-auto shrink-0">
            {confirming ? (
              <Button
                variant="destructive"
                size="sm"
                disabled={disabled}
                onClick={() => onDelete(avatar)}
                onBlur={() => setConfirming(false)}
                className="h-8 rounded-lg px-3 font-display"
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
                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive-text"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {(mainLook || unsupported) && (
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
        )}

        <AvatarTrainingStatus
          status={avatar.status}
          errorCode={avatar.errorCode}
        />
      </div>
    </article>
  )
}
