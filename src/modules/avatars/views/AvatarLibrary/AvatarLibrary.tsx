import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
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
import { AvatarBalanceBadge } from '@/modules/avatars/components/AvatarBalanceBadge'
import { AvatarCard } from '@/modules/avatars/components/AvatarCard'
import { AvatarDetailDialog } from '@/modules/avatars/components/AvatarDetailDialog'
import { CreatePhotoAvatarDialog } from '@/modules/avatars/components/CreatePhotoAvatarDialog'
import { StockLooksDialog } from '@/modules/avatars/components/StockLooksDialog'
import {
  AVATAR_ASPECT_RATIOS,
  AVATAR_PANEL_PARAM,
  AVATAR_SCENARIO_PARAM,
} from '@/modules/avatars/constants'
import { useAvatarMutations } from '@/modules/avatars/hooks/useAvatarMutations'
import { useAvatars } from '@/modules/avatars/hooks/useAvatars'
import { useHeyGenAccess } from '@/modules/avatars/hooks/useHeyGenAccess'
import { useProcessingAvatarsRefresh } from '@/modules/avatars/hooks/useProcessingAvatarsRefresh'

type OpenDialog = 'stock' | 'photo' | null

// Biblioteca de avatares (ADR-0057): los de stock de HeyGen y los creados
// desde una foto, un avatar por tarjeta con sus looks, listos para elegir al
// crear un video (entrega 2). En la cabecera, el saldo de HeyGen.
export function AvatarLibrary() {
  const { t } = useTranslation()
  const { isNative, entries, isLoading, errorKey } = useAvatars()
  const { deleteAvatar } = useAvatarMutations()
  // Hablar con HeyGen exige su clave: los botones esperan a que el llavero
  // responda y, sin clave, al aviso.
  const { canUseHeyGen, missingKey } = useHeyGenAccess()
  const [searchParams, setSearchParams] = useSearchParams()
  const [dialog, setDialog] = useState<OpenDialog>(null)
  // `?avatar=<id>&scenario=<formato>` (avatarScenarioPath, desde la tarjeta
  // del avatar de Crear, ADR-0057 §9): el panel de ese avatar abre solo, con
  // «Crear escenario» listo en ese formato. Vale una vez: cerrar el panel o
  // abrir otro lo consume, y al consumirlo sale también de la URL (volver con
  // el historial no lo reabre).
  const [linkedId, setLinkedId] = useState(() =>
    searchParams.get(AVATAR_PANEL_PARAM),
  )
  const linkedRatio = AVATAR_ASPECT_RATIOS.find(
    (ratio) => ratio === searchParams.get(AVATAR_SCENARIO_PARAM),
  )
  // El panel de un avatar se arma con su entrada actual de la lista: lo que
  // cambia el sondeo se ve al instante y, si la entrada desaparece, se cierra.
  const [selectedId, setSelectedId] = useState<string | null>(linkedId)
  const listRef = useRef<HTMLUListElement>(null)
  const stockButtonRef = useRef<HTMLButtonElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  // Adónde vuelve el foco al cerrar el panel: el nombre de la tarjeta del
  // avatar. Se busca al cerrar, porque el panel también se abre desde el stock
  // con un avatar recién agregado. Se limpia al abrir un panel: si se cierra
  // solo porque su entrada desapareció, el foco no salta a la tarjeta de un
  // cierre anterior.
  const panelReturnRef = useRef<HTMLElement | null>(null)

  usePageTitle(t('avatars.pageTitle'))
  useProcessingAvatarsRefresh(entries)

  const selectedAvatar = entries.find((entry) => entry.id === selectedId)
  // Si la entrada desaparece (se quitó, o el sondeo ya no la trae), el panel
  // se cierra del todo: no se vuelve a abrir solo si la entrada reaparece.
  // Mientras la lista carga no se decide: el panel de un enlace espera a su
  // entrada.
  if (selectedId !== null && !selectedAvatar && !isLoading) setSelectedId(null)

  const consumeLink = () => {
    setLinkedId(null)
    if (
      !searchParams.has(AVATAR_PANEL_PARAM) &&
      !searchParams.has(AVATAR_SCENARIO_PARAM)
    )
      return

    const rest = new URLSearchParams(searchParams)
    rest.delete(AVATAR_PANEL_PARAM)
    rest.delete(AVATAR_SCENARIO_PARAM)
    setSearchParams(rest, { replace: true })
  }

  const openPanel = (id: string) => {
    panelReturnRef.current = null
    consumeLink()
    setSelectedId(id)
  }

  // Desde el stock, directo al resultado: el diálogo se cierra y queda
  // abierto el panel del avatar.
  const showAvatar = (id: string) => {
    setDialog(null)
    openPanel(id)
  }

  // El nombre de la tarjeta de un avatar (`data-avatar-id`), el camino del
  // teclado para abrir su panel.
  const cardNameButton = (id: string | null) => {
    if (!id) return null

    return (
      listRef.current?.querySelector<HTMLElement>(
        `[data-avatar-id="${CSS.escape(id)}"]`,
      ) ?? null
    )
  }

  const closePanel = () => {
    panelReturnRef.current = cardNameButton(selectedId)
    consumeLink()
    setSelectedId(null)
  }

  // Adónde va el foco cuando la biblioteca queda vacía: «Agregar de stock»,
  // o el título si ese botón está apagado (sin clave o fuera de la app).
  const emptyLibraryFocus = () => {
    if (stockButtonRef.current && !stockButtonRef.current.disabled)
      return stockButtonRef.current

    return titleRef.current
  }

  // Quitar desde el panel: la tarjeta sale de la lista, así que el foco va a
  // la vecina (la siguiente, o la anterior si era la última) o, si la
  // biblioteca queda vacía, a `emptyLibraryFocus`. Nunca a `<body>`.
  const removeFromPanel = (id: string) => {
    const index = entries.findIndex((entry) => entry.id === id)
    const neighbour = entries[index + 1] ?? entries[index - 1]
    panelReturnRef.current = neighbour
      ? cardNameButton(neighbour.id)
      : emptyLibraryFocus()
    deleteAvatar(id)
    consumeLink()
    setSelectedId(null)
  }

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
            <h1
              ref={titleRef}
              tabIndex={-1}
              className="font-display text-3xl font-extrabold text-foreground outline-none"
            >
              {t('avatars.titulo')}
            </h1>
            <p className="font-handwritten text-lg text-muted-foreground">
              {t('avatars.tagline')}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <AvatarBalanceBadge />
          <Button
            ref={stockButtonRef}
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

      {missingKey && (
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

      {/* Cada fila mide lo que su tarjeta más alta (sin `auto-rows-fr`, que
          igualaba todas las filas a la más alta de la grilla) y cada tarjeta
          llena su fila: las de una misma fila miden lo mismo y una tarjeta
          con el estado del entrenamiento no estira las demás filas. */}
      {entries.length > 0 && (
        <motion.ul
          ref={listRef}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4',
            !isNative && 'pointer-events-none opacity-60',
          )}
        >
          {entries.map((entry) => (
            <li key={entry.id}>
              <AvatarCard
                avatar={entry}
                disabled={!isNative}
                onOpen={(avatar) => openPanel(avatar.id)}
                onDelete={(avatar) => deleteAvatar(avatar.id)}
              />
            </li>
          ))}
        </motion.ul>
      )}

      {dialog === 'stock' && (
        <StockLooksDialog
          entries={entries}
          onOpenAvatar={showAvatar}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'photo' && (
        <CreatePhotoAvatarDialog onClose={() => setDialog(null)} />
      )}
      {selectedAvatar && (
        <AvatarDetailDialog
          avatar={selectedAvatar}
          scenarioAspectRatio={
            selectedAvatar.id === linkedId ? linkedRatio : undefined
          }
          returnFocusRef={panelReturnRef}
          onClose={closePanel}
          onRemove={() => removeFromPanel(selectedAvatar.id)}
        />
      )}
    </div>
  )
}
