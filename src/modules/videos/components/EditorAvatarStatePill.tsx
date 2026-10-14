import { useTranslation } from 'react-i18next'
import { Check, History, Image as ImageIcon, Loader2 } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { errorKeyOf } from '@/modules/videos/utilities/errorKeyOf'
import { formatSlotSeconds } from '@/modules/videos/utilities/formatSlotSeconds'
import { avatarSceneSpan } from '@pipeline/types/avatar.ts'
import type { TimelineAvatarState } from '@/modules/videos/utilities/avatarClips'
import type { SceneDetail } from '@pipeline/types/video-project.ts'

interface EditorAvatarStatePillProps {
  scene: SceneDetail
  state: TimelineAvatarState
  // El porcentaje del render cuando su render arrancó; undefined = en cola o
  // sin render.
  percent: number | undefined
  // Nada ocupa el lugar de al lado (la tarjeta desplegada pasa la ficha del
  // busto a la otra esquina): la pastilla puede usar todo el ancho del medio.
  fullWidth?: boolean
}

// La pastilla del estado de una aparición del avatar sobre su medio en la vista
// ampliada (entrega 2f, spec §22.4, rondas 1 a 3), con la regla del bloque de
// la pista (avatarBlockState y TimelineAvatarItem): una etiqueta corta que
// nunca se corta —la del bloque donde la tiene («Desactualizado», como la caja
// de las acciones, y «Generando el avatar…» con su porcentaje), «Lista», y
// «Con imagen fija» en una planeada o una fallida: en el editor nada la
// genera sola y así sale en el video— y, de tooltip, el título que tiene el
// bloque para ese estado (con el look y la duración en una lista, y el motivo
// en una fallida). En una tarjeta angosta (cinco columnas con la ventana
// mínima de 1024 px) «Generando el avatar…» con su porcentaje no entra en una
// línea y sigue en la siguiente. Presentacional.
export function EditorAvatarStatePill({
  scene,
  state,
  percent,
  fullWidth = false,
}: EditorAvatarStatePillProps) {
  const { t, i18n } = useTranslation()
  const avatar = scene.avatar

  // El título del bloque de la pista para cada estado: va de tooltip, como al
  // pasar sobre el bloque.
  const blockTitle = () => {
    if (state === 'generating')
      return t('library.editor.timeline.avatarRendering')

    if (state === 'failed') {
      return t('library.editor.timeline.avatarFailed', {
        reason: t(errorKeyOf(avatar?.errorCode)),
      })
    }

    if (state === 'stale') return t('library.editor.timeline.avatarStaleHint')

    if (state === 'planned') return t('library.editor.timeline.avatarPlanned')

    const span = avatarSceneSpan(scene)
    return t('library.editor.timeline.avatarTitle', {
      name: avatar?.lookName,
      seconds: formatSlotSeconds(
        span ? span.endSeconds - span.startSeconds : 0,
        i18n.resolvedLanguage ?? 'es',
      ),
    })
  }

  const stateLabel = () => {
    if (state === 'generating')
      return t('library.editor.timeline.avatarRendering')

    if (state === 'stale') return t('library.editor.timeline.avatarStale')

    if (state === 'ready') return t('create.progress.avatarReady')

    return t('create.progress.avatarCardFallback')
  }

  const stateTone = () => {
    if (state === 'generating' || state === 'ready')
      return 'bg-amethyst text-white'

    if (state === 'stale') return 'bg-saffron text-charcoal'

    return 'bg-charcoal/80 text-white'
  }

  const stateIcon = () => {
    if (state === 'generating') {
      return (
        <Loader2 aria-hidden className="mt-0.5 h-3 w-3 shrink-0 animate-spin" />
      )
    }

    if (state === 'ready')
      return <Check aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />

    if (state === 'stale')
      return <History aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />

    return <ImageIcon aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
  }

  return (
    <span
      data-avatar-state={state}
      title={blockTitle()}
      className={cn(
        'absolute right-2 top-2 flex items-start gap-1 rounded-xl px-2 py-0.5 font-display text-[10px] font-bold leading-4',
        fullWidth ? 'max-w-[calc(100%-1rem)]' : 'max-w-[calc(100%-3rem)]',
        stateTone(),
      )}
    >
      {stateIcon()}
      <span className="min-w-0">
        {stateLabel()}
        {percent !== undefined && (
          <span className="ml-1 whitespace-nowrap font-mono tabular-nums">
            {t('library.editor.timeline.avatarRenderingPercent', { percent })}
          </span>
        )}
      </span>
    </span>
  )
}
