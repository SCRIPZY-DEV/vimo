import { useState } from 'react'
import type { MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Loader2, Plus } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { AvatarTrainingStatus } from '@/modules/avatars/components/AvatarTrainingStatus'
import { LookPreview } from '@/modules/avatars/components/LookPreview'
import type { HeyGenAvatarGroup } from '@pipeline/types/avatar.ts'

interface StockGroupCardProps {
  group: HeyGenAvatarGroup
  // Ya está en la biblioteca (mismo grupo de HeyGen): no se vuelve a agregar.
  added: boolean
  // Esta tarjeta se está agregando.
  adding: boolean
  // Hay un alta en vuelo (de esta u otra tarjeta).
  disabled: boolean
  onOpen: (group: HeyGenAvatarGroup) => void
  onAdd: (group: HeyGenAvatarGroup) => void
}

// Un avatar de HeyGen en el primer nivel del stock, como en HeyGen: la vista
// previa vertical (el video al pasar el mouse) con un zoom suave y, abajo, un
// velo con «Ver looks» y «Agregar»; debajo, el nombre y cuántos looks tiene.
// Toda la tarjeta abre sus looks con el mouse; con el teclado se llega por
// «Ver looks», que aparece con el foco. Un avatar propio que todavía entrena
// (o no pudo entrenar) muestra su estado y no se agrega. Presentacional.
export function StockGroupCard({
  group,
  added,
  adding,
  disabled,
  onOpen,
  onAdd,
}: StockGroupCardProps) {
  const { t } = useTranslation()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)

  // Los grupos del stock público no traen `status`: están listos.
  const trainingStatus =
    group.status && group.status !== 'ready' ? group.status : null
  const canAdd = !added && !trainingStatus

  // Los botones del velo no dejan subir el clic: si no, la tarjeta también
  // abriría los looks.
  const openLooks = (event: MouseEvent) => {
    event.stopPropagation()
    onOpen(group)
  }
  const add = (event: MouseEvent) => {
    event.stopPropagation()
    onAdd(group)
  }

  return (
    <article
      onClick={() => onOpen(group)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return

        setFocused(false)
      }}
      className="group flex cursor-pointer flex-col gap-2.5"
    >
      <div className="relative overflow-hidden rounded-2xl bg-muted shadow-sm ring-1 ring-border transition-shadow duration-300 group-hover:shadow-xl">
        <LookPreview
          imageUrl={group.previewImageUrl}
          videoUrl={group.previewVideoUrl}
          alt={t('avatars.stock.previewAria', { name: group.name })}
          active={hovered || focused}
          doodleSize={64}
          className="aspect-[4/5] w-full transition-transform duration-500 ease-out group-hover:scale-105"
        />

        {added && (
          <span className="pointer-events-none absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-saffron px-2.5 py-1 font-display text-[11px] font-bold text-charcoal shadow-sm">
            <Check aria-hidden strokeWidth={3} className="h-3 w-3" />
            {t('avatars.stock.agregado')}
          </span>
        )}

        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-3 pt-14 transition-opacity duration-200',
            adding
              ? 'opacity-100'
              : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100',
          )}
        >
          {/* Los botones nombran al avatar para el lector de pantalla (hay
              uno por tarjeta). `data-group-id`: el diálogo devuelve el foco
              acá al volver de los looks o tras agregar. */}
          <button
            type="button"
            data-group-id={group.groupId}
            aria-label={t('avatars.stock.verLooksAria', { name: group.name })}
            onClick={openLooks}
            className="pointer-events-auto inline-flex h-8 min-w-0 flex-1 items-center justify-center rounded-full border border-white/25 bg-white/15 px-3 font-display text-xs font-bold text-white backdrop-blur-md transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <span className="truncate">{t('avatars.stock.verLooks')}</span>
          </button>
          {canAdd && (
            <button
              type="button"
              disabled={disabled}
              aria-label={t('avatars.stock.agregarAria', { name: group.name })}
              onClick={add}
              className="pointer-events-auto inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-full bg-saffron px-3 font-display text-xs font-bold text-charcoal shadow-sm transition-colors hover:bg-saffron/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-70"
            >
              {adding ? (
                <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus aria-hidden strokeWidth={3} className="h-3.5 w-3.5" />
              )}
              {t('avatars.stock.agregar')}
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-0.5">
        <h3 className="min-w-0 truncate font-display text-sm font-bold text-foreground">
          {group.name}
        </h3>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-display text-[10px] font-bold tabular-nums text-muted-foreground">
          {t('avatars.stock.looksCount', { count: group.looksCount })}
        </span>
      </div>

      {trainingStatus && (
        <AvatarTrainingStatus status={trainingStatus} className="px-0.5" />
      )}
    </article>
  )
}
