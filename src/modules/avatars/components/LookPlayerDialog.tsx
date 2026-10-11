import { useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Loader2, X } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '@/modules/common/ui/dialog'
import { LookChips } from '@/modules/avatars/components/LookChips'
import { LookPlayer } from '@/modules/avatars/components/LookPlayer'
import type { AvatarLookSummary, HeyGenLook } from '@pipeline/types/avatar.ts'

// Lo que ofrece el pie según desde dónde se abre el reproductor: en el stock,
// cargar el avatar a la biblioteca con este look como principal (`load`) o, si
// ya está, abrirlo (`open-library`); en el panel de un avatar, hacerlo su look
// principal (`make-main`) o decir que ya lo es (`main`); un look que no sirve
// dice por qué y no ofrece nada (`unusable`, con la clave del motivo).
export type LookPlayerAction =
  | { kind: 'load'; busy: boolean; onLoad: () => void }
  | { kind: 'open-library'; onOpen: () => void }
  | {
      kind: 'make-main'
      busy: boolean
      disabled: boolean
      onMakeMain: () => void
    }
  | { kind: 'main' }
  | { kind: 'unusable'; reasonKey: string }

interface LookPlayerDialogProps {
  look: HeyGenLook | AvatarLookSummary
  imageUrl?: string
  videoUrl?: string
  // El video todavía se busca (en el panel de un avatar, la lista de looks de
  // HeyGen no llegó): el escenario espera en vez de decir «sin video».
  videoLoading?: boolean
  action: LookPlayerAction
  // Adónde vuelve el foco al cerrar: la ficha que lo abrió. Sin
  // `DialogTrigger` (se monta solo mientras está abierto) Radix lo dejaría en
  // `<body>`.
  returnFocusRef?: RefObject<HTMLElement | null>
  onClose: () => void
}

// El reproductor de un look, como el modal de HeyGen: el nombre, sus chips y
// para qué sirve; el escenario con el video entero (LookPlayer); y al pie, la
// acción que corresponde (LookPlayerAction). Se abre encima del diálogo de
// stock o del panel de un avatar (diálogos de Radix anidados: Escape cierra
// solo este). Mientras carga el avatar a la biblioteca no se cierra (la X se
// apaga) y el foco espera en el escenario: si se quedara en el botón apagado,
// Tab saldría a la página de atrás; si la carga falla, el foco vuelve al
// botón. Se monta solo mientras está abierto, así el video deja de sonar al
// cerrarlo. El contenido es el primitivo de Radix y no el `DialogContent` del
// kit, que trae su caja de tarjeta y su X chica.
export function LookPlayerDialog({
  look,
  imageUrl,
  videoUrl,
  videoLoading = false,
  action,
  returnFocusRef,
  onClose,
}: LookPlayerDialogProps) {
  const { t } = useTranslation()
  const contentRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const actionRef = useRef<HTMLButtonElement>(null)
  // El botón del pie se apagó con el foco encima: al terminar (con fallo; con
  // éxito el reproductor se cierra) el foco vuelve a él.
  const refocusActionRef = useRef(false)

  const busy =
    (action.kind === 'load' || action.kind === 'make-main') && action.busy
  const locked = action.kind === 'load' && action.busy

  // De layout: el foco se mueve en el mismo commit que apaga el botón, antes
  // de cualquier tecla.
  useLayoutEffect(() => {
    if (busy) {
      stageRef.current?.focus()
      refocusActionRef.current = true
      return
    }
    if (!refocusActionRef.current) return

    refocusActionRef.current = false
    const active = document.activeElement
    const focusLost =
      active === stageRef.current ||
      active === contentRef.current ||
      active === document.body
    if (focusLost) actionRef.current?.focus()
  }, [busy])

  // El reproductor se vuelve a montar cuando cambia el video (`key`): su
  // estado (reproduciendo, falló, el tiempo) es siempre el de ese video. Si
  // el escenario viejo tenía el foco, lo recibe el nuevo: el viejo salió del
  // documento y Radix lo dejaría en la caja del diálogo.
  useLayoutEffect(() => {
    if (document.activeElement !== document.body) return

    stageRef.current?.focus()
  }, [videoUrl])

  const footerText = () => {
    if (action.kind === 'main') return t('avatars.reproductor.esPrincipal')
    if (action.kind === 'open-library')
      return t('avatars.reproductor.yaEnBiblioteca')
    if (action.kind === 'unusable') return t(action.reasonKey)

    return null
  }

  const footerButton = () => {
    if (action.kind === 'load') {
      return (
        <Button
          ref={actionRef}
          disabled={action.busy}
          onClick={action.onLoad}
          className="shrink-0 rounded-xl font-display font-bold"
        >
          {action.busy && (
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
          )}
          {t(
            action.busy
              ? 'avatars.reproductor.cargando'
              : 'avatars.reproductor.cargar',
          )}
        </Button>
      )
    }
    if (action.kind === 'open-library') {
      return (
        <Button
          ref={actionRef}
          variant="outline"
          onClick={action.onOpen}
          className="shrink-0 rounded-xl font-display font-bold"
        >
          {t('avatars.stock.abrirEnBiblioteca')}
        </Button>
      )
    }
    if (action.kind === 'make-main') {
      return (
        <Button
          ref={actionRef}
          disabled={action.disabled || action.busy}
          onClick={action.onMakeMain}
          className="shrink-0 rounded-xl font-display font-bold"
        >
          {action.busy && (
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
          )}
          {t('avatars.detalle.usarPrincipal')}
        </Button>
      )
    }

    return null
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !locked && onClose()}>
      <DialogPortal>
        <DialogOverlay className="bg-black/50 backdrop-blur-sm" />
        <DialogPrimitive.Content
          ref={contentRef}
          // Al abrir, el foco va al escenario y no al botón del pie: Espacio
          // reproduce y dos Enter seguidos no cargan nada.
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            stageRef.current?.focus()
          }}
          onCloseAutoFocus={(event) => {
            const target = returnFocusRef?.current
            if (!target?.isConnected) return

            event.preventDefault()
            target.focus()
          }}
          // El ancho se achica con el alto de la ventana: el escenario 16:9,
          // la cabecera y el pie entran sin scroll también a 1024×640.
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-2rem)] w-[min(calc(100vw-3rem),calc((100vh-18rem)*16/9+3rem))] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl outline-none duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-2 px-6 pb-4 pr-16 pt-6">
              <DialogTitle className="break-words font-display text-xl font-extrabold leading-tight text-foreground">
                {look.name}
              </DialogTitle>
              <LookChips look={look} />
              <DialogDescription className="font-body text-sm leading-relaxed text-muted-foreground">
                {t('avatars.reproductor.descripcion')}
              </DialogDescription>
            </div>

            <div className="px-6 pb-6">
              <LookPlayer
                key={videoUrl ?? ''}
                videoUrl={videoUrl}
                imageUrl={imageUrl}
                videoLoading={videoLoading}
                label={t('avatars.stock.previewAria', { name: look.name })}
                stageRef={stageRef}
              />
            </div>
          </div>

          <div className="flex min-h-[4.5rem] items-center gap-4 border-t border-border bg-background px-6 py-3">
            <p className="min-w-0 flex-1 font-body text-sm text-muted-foreground">
              {footerText()}
            </p>
            {footerButton()}
          </div>

          <DialogClose
            aria-label={t('avatars.reproductor.cerrar')}
            disabled={locked}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-muted/80 text-muted-foreground backdrop-blur-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron disabled:pointer-events-none disabled:opacity-40"
          >
            <X aria-hidden className="h-4 w-4" />
          </DialogClose>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}
