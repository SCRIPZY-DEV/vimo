import { useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '@/modules/common/ui/dialog'
import { avatarsApi } from '@/modules/avatars/api'
import { AvatarDeleteMenu } from '@/modules/avatars/components/AvatarDeleteMenu'
import { AvatarTrainingStatus } from '@/modules/avatars/components/AvatarTrainingStatus'
import { GenerateLookCard } from '@/modules/avatars/components/GenerateLookCard'
import { LookPlayerDialog } from '@/modules/avatars/components/LookPlayerDialog'
import type { LookPlayerAction } from '@/modules/avatars/components/LookPlayerDialog'
import { LookPreview } from '@/modules/avatars/components/LookPreview'
import { StockLookCard } from '@/modules/avatars/components/StockLookCard'
import {
  STOCK_GRID_CLASS,
  VIMO_AVATAR_ENGINE,
} from '@/modules/avatars/constants'
import { useAvatarDeleteMenu } from '@/modules/avatars/hooks/useAvatarDeleteMenu'
import { useAvatarMutations } from '@/modules/avatars/hooks/useAvatarMutations'
import { useHeyGenAccess } from '@/modules/avatars/hooks/useHeyGenAccess'
import { useOpenLook } from '@/modules/avatars/hooks/useOpenLook'
import { useStockLooks } from '@/modules/avatars/hooks/useStockLooks'
import type { SizedLibraryLook } from '@/modules/avatars/types/look'
import { lookUnusableReasonKey } from '@/modules/avatars/utilities/lookUsability'
import type {
  AvatarAspectRatio,
  AvatarLookSummary,
  AvatarSummary,
} from '@pipeline/types/avatar.ts'

interface AvatarDetailDialogProps {
  // La entrada actual de la biblioteca: quien lo monta la relee de la lista,
  // así los cambios del sondeo y del look principal se ven al instante.
  avatar: AvatarSummary
  // Formato con el que «Crear escenario» abre solo, desde el enlace de la
  // tarjeta del avatar de Crear (ADR-0057 §9); sin él, se abre con un clic.
  scenarioAspectRatio?: AvatarAspectRatio
  // Adónde vuelve el foco al cerrar: la tarjeta que lo abrió. Sin
  // `DialogTrigger` (se abre por estado) Radix lo dejaría en `<body>`.
  returnFocusRef?: RefObject<HTMLElement | null>
  onClose: () => void
  // «Eliminar de la lista»: lo hace la biblioteca, que sabe adónde va el foco
  // cuando la tarjeta desaparece, y cierra.
  onRemove: () => void
  // «Eliminar permanentemente de HeyGen», ya confirmado con «Seguro»: también
  // lo hace la biblioteca. Solo se ofrece en un avatar propio y si la
  // biblioteca lo pasa.
  onDeleteFromHeyGen?: () => void
  // El borrado en HeyGen está en vuelo: el botón de eliminar dice
  // «Eliminando…» y el panel no se cierra hasta que termine.
  deleting?: boolean
  // El de otro avatar está en vuelo (uno a la vez): el botón de eliminar
  // todavía no hace nada (`aria-disabled`, sigue enfocable).
  deleteDisabled?: boolean
}

// El panel de un avatar de la biblioteca, como en HeyGen: arriba, la vista
// previa grande de su look principal (el video al pasar el mouse), el nombre,
// sus chips, de dónde salió, el estado del entrenamiento y el botón de
// eliminar (`AvatarDeleteMenu`, entrega 2d: «Eliminar de la lista» y, en un
// avatar propio, «Eliminar permanentemente de HeyGen» con «Seguro»); abajo,
// todos sus looks, con el principal marcado y «Usar como principal» en los
// demás que sirven, encabezados por la ficha «Crear escenario» (un look nuevo
// desde una descripción). Un clic en un look abre su reproductor, con «Usar
// como principal» al pie (se cierra solo al lograrlo). Las vistas previas que
// no están en disco salen del listado de HeyGen (gratis), con esqueleto
// mientras llegan. Se monta solo mientras está abierto. El contenido es el
// primitivo de Radix y no el `DialogContent` del kit, que trae su caja de
// tarjeta y su X chica: acá la caja tiene su propio layout y su X redonda.
export function AvatarDetailDialog({
  avatar,
  scenarioAspectRatio,
  returnFocusRef,
  onClose,
  onRemove,
  onDeleteFromHeyGen,
  deleting = false,
  deleteDisabled = false,
}: AvatarDetailDialogProps) {
  const { t } = useTranslation()
  const { setMainLook, saving } = useAvatarMutations()
  const { canUseHeyGen } = useHeyGenAccess()
  const deleteMenu = useAvatarDeleteMenu()
  const [makingMainId, setMakingMainId] = useState<string | null>(null)
  const [previewActive, setPreviewActive] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  // El reproductor de un look de la grilla; al cerrarlo, el foco vuelve a su
  // ficha.
  const {
    openLookId,
    gridRef: looksRef,
    returnFocusRef: lookReturnRef,
    open: openLook,
    close: closeLook,
    closeIfOpen: closeLookIfOpen,
  } = useOpenLook<HTMLUListElement>()

  // Mismo listado (y misma caché) que los looks del stock: un avatar propio
  // se lista entre los privados de la cuenta.
  const remote = useStockLooks({
    ownership: avatar.ownership === 'own' ? 'private' : 'public',
    groupId: avatar.groupId,
    enabled: canUseHeyGen,
  })
  const remoteById = new Map(remote.looks.map((look) => [look.lookId, look]))

  const mainLook = avatar.looks.find(
    (look) => look.lookId === avatar.mainLookId,
  )
  const remoteMain = avatar.mainLookId
    ? remoteById.get(avatar.mainLookId)
    : undefined
  const mainImage = avatar.previewPath
    ? avatarsApi.imageSource(avatar.previewPath)
    : remoteMain?.previewImageUrl
  const supportsVimo =
    mainLook?.supportedEngines.includes(VIMO_AVATAR_ENGINE) ?? false
  // Mientras entrena (o si falló) todavía no se saben sus motores: «No
  // compatible» solo se afirma de un avatar listo.
  const unsupported = avatar.status === 'ready' && !supportsVimo

  const openedLook = avatar.looks.find((look) => look.lookId === openLookId)

  // La vista previa de un look: la de disco o, si no está, la del listado de
  // HeyGen; el video siempre sale del listado.
  const lookMedia = (look: AvatarLookSummary) => {
    const remoteLook = remoteById.get(look.lookId)
    return {
      imageUrl: look.previewPath
        ? avatarsApi.imageSource(look.previewPath)
        : remoteLook?.previewImageUrl,
      videoUrl: remoteLook?.previewVideoUrl,
    }
  }

  // El formato del look en su ficha y en su reproductor (`LookChips`): la
  // biblioteca guarda solo la orientación, así que las medidas de la imagen
  // salen del listado de HeyGen cuando las trae (un look de 4:5 o de 5:4 no
  // tiene orientación).
  const withImageSize = (look: AvatarLookSummary): SizedLibraryLook => {
    const remoteLook = remoteById.get(look.lookId)
    if (!remoteLook?.imageWidth || !remoteLook.imageHeight) return look

    return {
      ...look,
      imageWidth: remoteLook.imageWidth,
      imageHeight: remoteLook.imageHeight,
    }
  }

  // Desde la ficha o desde el reproductor; si lo logra con el reproductor de
  // ese look abierto, lo cierra (ya es el principal).
  const makeMain = async (lookId: string) => {
    setMakingMainId(lookId)
    const entry = await setMainLook({ id: avatar.id, lookId }).catch(() => null)
    setMakingMainId(null)
    if (entry) closeLookIfOpen(lookId)
  }

  // El pie del reproductor: el principal lo dice; un look que sirve se puede
  // hacer principal; uno que no, dice por qué.
  const playerAction = (look: AvatarLookSummary): LookPlayerAction => {
    if (look.lookId === avatar.mainLookId) return { kind: 'main' }

    const reasonKey = lookUnusableReasonKey(look)
    if (reasonKey) return { kind: 'unusable', reasonKey }

    return {
      kind: 'make-main',
      busy: makingMainId === look.lookId,
      disabled: saving,
      onMakeMain: () => void makeMain(look.lookId),
    }
  }

  return (
    // Con el borrado en HeyGen en vuelo no se cierra (Escape, clic afuera ni
    // la X): la persona ve cómo termina, también si falla.
    <Dialog open onOpenChange={(open) => !open && !deleting && onClose()}>
      <DialogPortal>
        <DialogOverlay className="backdrop-blur-sm" />
        <DialogPrimitive.Content
          ref={contentRef}
          // Al abrir, el foco va al panel y no al primer botón (que es
          // «Eliminar»): así dos Enter seguidos no abren sus opciones.
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            contentRef.current?.focus()
          }}
          onCloseAutoFocus={(event) => {
            if (!returnFocusRef?.current) return

            event.preventDefault()
            returnFocusRef.current.focus()
          }}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100vw-3rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl outline-none duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-6 p-6 sm:flex-row sm:gap-8 sm:p-8">
              <div
                onMouseEnter={() => setPreviewActive(true)}
                onMouseLeave={() => setPreviewActive(false)}
                className="w-full shrink-0 sm:w-64"
              >
                <LookPreview
                  imageUrl={mainImage}
                  videoUrl={remoteMain?.previewVideoUrl}
                  alt={t('avatars.stock.previewAria', { name: avatar.name })}
                  active={previewActive}
                  doodleSize={96}
                  className="aspect-[4/5] w-full rounded-2xl shadow-card ring-1 ring-border"
                />
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-4 sm:pt-2">
                <div className="space-y-1.5 pr-10">
                  <DialogDescription className="font-display text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {t(`avatars.detalle.origen.${avatar.ownership}`)}
                  </DialogDescription>
                  <DialogTitle className="break-words font-display text-2xl font-extrabold leading-tight text-foreground">
                    {avatar.name}
                  </DialogTitle>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {mainLook && (
                    <span className="rounded bg-muted px-2 py-0.5 font-display text-[11px] font-bold text-muted-foreground">
                      {t(`avatars.types.${mainLook.lookType}`)}
                    </span>
                  )}
                  {supportsVimo && (
                    <span className="rounded bg-saffron/15 px-2 py-0.5 font-display text-[11px] font-bold text-foreground">
                      {t(`avatars.engines.${VIMO_AVATAR_ENGINE}`)}
                    </span>
                  )}
                  {unsupported && (
                    <span className="rounded bg-destructive/15 px-2 py-0.5 font-display text-[11px] font-bold text-foreground">
                      {t('avatars.tarjeta.noCompatible')}
                    </span>
                  )}
                  <span className="rounded-full bg-muted px-2.5 py-0.5 font-display text-[11px] font-bold tabular-nums text-muted-foreground">
                    {t('avatars.stock.looksCount', {
                      count: avatar.looks.length,
                    })}
                  </span>
                </div>

                <AvatarTrainingStatus
                  status={avatar.status}
                  errorCode={avatar.errorCode}
                  className="max-w-sm"
                />

                <div className="mt-auto pt-2">
                  <AvatarDeleteMenu
                    menu={deleteMenu}
                    variant="panel"
                    name={avatar.name}
                    onRemoveFromList={onRemove}
                    onDeleteFromHeyGen={
                      avatar.ownership === 'own'
                        ? onDeleteFromHeyGen
                        : undefined
                    }
                    deleting={deleting}
                    disabled={deleteDisabled}
                  />
                </div>
              </div>
            </div>

            <section className="space-y-5 border-t border-border px-6 pb-8 pt-6 sm:px-8">
              <header className="space-y-1">
                <h3 className="font-display text-lg font-bold text-foreground">
                  {t('avatars.detalle.looks')}
                </h3>
                <p className="max-w-2xl font-body text-sm leading-relaxed text-muted-foreground">
                  {t('avatars.detalle.looksHint')}
                </p>
                {avatar.status === 'processing' && (
                  <p className="font-body text-sm font-semibold text-foreground">
                    {t('avatars.detalle.entrenando')}
                  </p>
                )}
                {avatar.status !== 'processing' &&
                  avatar.looks.length === 0 && (
                    <p className="font-body text-sm font-semibold text-foreground">
                      {t('avatars.stock.vacioLooks')}
                    </p>
                  )}
              </header>

              <ul ref={looksRef} className={STOCK_GRID_CLASS}>
                {/* «Crear escenario» abre la grilla, en un `li` flex del
                    ancho de una ficha. Un avatar que no pudo entrenar no
                    tiene de qué partir: no la muestra. */}
                {avatar.status !== 'failed' && (
                  <li className="flex">
                    <GenerateLookCard
                      avatar={avatar}
                      openWithAspectRatio={scenarioAspectRatio}
                    />
                  </li>
                )}
                {avatar.looks.map((look) => {
                  const { imageUrl, videoUrl } = lookMedia(look)
                  return (
                    <li key={look.lookId}>
                      <StockLookCard
                        look={withImageSize(look)}
                        imageUrl={imageUrl}
                        videoUrl={videoUrl}
                        previewLoading={!imageUrl && remote.isLoading}
                        onOpen={openLook}
                        main={look.lookId === avatar.mainLookId}
                        busy={makingMainId === look.lookId}
                        disabled={saving}
                        onMakeMain={(lookId) => void makeMain(lookId)}
                      />
                    </li>
                  )
                })}
              </ul>
            </section>
          </div>

          {/* Encima del panel (Radix los apila: Escape cierra solo el
              reproductor). */}
          {openedLook && (
            <LookPlayerDialog
              look={withImageSize(openedLook)}
              {...lookMedia(openedLook)}
              videoLoading={remote.isLoading}
              action={playerAction(openedLook)}
              returnFocusRef={lookReturnRef}
              onClose={closeLook}
            />
          )}

          {/* Apagada mientras elimina de HeyGen: el foco espera en el botón
              de eliminar, que sigue enfocable (`aria-disabled`), así Tab no
              sale del panel. */}
          <DialogClose
            aria-label={t('avatars.detalle.cerrar')}
            disabled={deleting}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-muted/80 text-muted-foreground backdrop-blur-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron disabled:pointer-events-none disabled:opacity-40"
          >
            <X aria-hidden className="h-4 w-4" />
          </DialogClose>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}
