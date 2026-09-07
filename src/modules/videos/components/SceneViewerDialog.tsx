import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Check, ChevronLeft, ChevronRight, Copy } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { cn } from '@/modules/common/utilities/cn'
import { SceneViewerCanvas } from '@/modules/videos/components/SceneViewerCanvas'
import {
  COPIED_FEEDBACK_MS,
  SUPPORT_NOTE_CLASS,
} from '@/modules/videos/constants'
import type { VideoFormat } from '@pipeline/types/video-format.ts'
import type { SceneView } from '@/modules/videos/types/create'

interface SceneViewerDialogProps {
  scenes: SceneView[]
  sceneId: number
  videoFormat: VideoFormat
  onClose: () => void
  onNavigate: (sceneId: number) => void
}

// Visor a pantalla completa de una escena (port de VisorDeEscena del
// origen): imagen grande, su prompt con botón de copiar y flechas para
// recorrer las escenas, también con el teclado. Se navega por id, no por
// índice (los ids son estables aunque la lista crezca entre eventos), y sin
// dar la vuelta: con cuarenta escenas, saltar de la última a la primera se
// siente como un error. Va por portal a document.body a propósito: colgado
// del árbol, el `space-y` del padre le metía margen a un `fixed` y las
// celdas con `transform` lo convertían en su marco de referencia.
export function SceneViewerDialog({
  scenes,
  sceneId,
  videoFormat,
  onClose,
  onNavigate,
}: SceneViewerDialogProps) {
  const { t } = useTranslation()
  const panel = useRef<HTMLDivElement>(null)
  // «Copiado» se recuerda por escena: al cambiar de escena se olvida solo.
  const [copiedSceneId, setCopiedSceneId] = useState<number | null>(null)

  const index = scenes.findIndex((scene) => scene.id === sceneId)
  const scene = index >= 0 ? scenes[index] : null
  const previousId = index > 0 ? scenes[index - 1].id : null
  const nextId =
    index >= 0 && index < scenes.length - 1 ? scenes[index + 1].id : null
  const copied = copiedSceneId === sceneId

  // Teclado, bloqueo del scroll de fondo y foco al abrir.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key === 'ArrowLeft' && previousId !== null) {
        event.preventDefault()
        onNavigate(previousId)
        return
      }
      if (event.key === 'ArrowRight' && nextId !== null) {
        event.preventDefault()
        onNavigate(nextId)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose, onNavigate, previousId, nextId])

  useEffect(() => {
    if (copiedSceneId === null) return undefined
    const timer = setTimeout(() => setCopiedSceneId(null), COPIED_FEEDBACK_MS)
    return () => clearTimeout(timer)
  }, [copiedSceneId])

  if (!scene) return null

  const prompt = scene.imagePrompt?.trim() ?? ''

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(prompt)
    setCopiedSceneId(scene.id)
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t('create.viewer.aria', {
          id: scene.id,
          index: index + 1,
          total: scenes.length,
        })}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-5xl space-y-5 rounded-3xl border-2 border-border bg-card p-5 shadow-2xl outline-none sm:p-7"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-display text-sm font-extrabold uppercase tracking-widest text-saffron">
              {t('create.viewer.title', { id: scene.id })}
            </p>
            <p className={cn(SUPPORT_NOTE_CLASS, 'text-muted-foreground')}>
              {t('create.viewer.position', {
                index: index + 1,
                total: scenes.length,
              })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={t('create.viewer.previous')}
              disabled={previousId === null}
              onClick={() => previousId !== null && onNavigate(previousId)}
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-2 border-border text-foreground transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-30 [&_svg]:pointer-events-none"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label={t('create.viewer.next')}
              disabled={nextId === null}
              onClick={() => nextId !== null && onNavigate(nextId)}
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-2 border-border text-foreground transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-30 [&_svg]:pointer-events-none"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-full px-3 py-2 font-display text-base font-extrabold text-foreground transition-colors hover:bg-muted"
            >
              {t('create.viewer.close')}
            </button>
          </div>
        </div>

        <SceneViewerCanvas scene={scene} videoFormat={videoFormat} />

        <div className="space-y-3 rounded-2xl border-2 border-border p-5">
          <p className="font-display text-xs font-extrabold uppercase tracking-widest text-muted-foreground">
            {t('create.viewer.promptTitle')}
          </p>
          {prompt ? (
            <>
              <p className="font-body text-sm leading-relaxed text-foreground">
                {prompt}
              </p>
              <Button
                variant="outline"
                onClick={() => void copyPrompt()}
                className="btn-squish rounded-xl font-display font-bold"
              >
                {copied ? (
                  <Check className="mr-2 h-4 w-4" />
                ) : (
                  <Copy className="mr-2 h-4 w-4" />
                )}
                {copied ? t('create.viewer.copied') : t('create.viewer.copy')}
              </Button>
            </>
          ) : (
            <p className={cn(SUPPORT_NOTE_CLASS, 'text-muted-foreground')}>
              {t('create.viewer.noPrompt')}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
