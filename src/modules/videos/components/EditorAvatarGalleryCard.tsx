import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Check,
  History,
  Image as ImageIcon,
  ImageOff,
  Loader2,
  Pause,
  Play,
  UserRound,
} from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { formatTime } from '@/modules/common/utilities/formatTime'
import { videosApi } from '@/modules/videos/api'
import { EditorAvatarSceneActions } from '@/modules/videos/components/EditorAvatarSceneActions'
import { useAvatarRenderPercent } from '@/modules/videos/hooks/useAvatarRenderPercent'
import { useLibraryEditorTask } from '@/modules/videos/hooks/useLibraryEditorTask'
import { avatarSceneState } from '@/modules/videos/utilities/avatarRegeneration'
import { errorKeyOf } from '@/modules/videos/utilities/errorKeyOf'
import { formatSlotSeconds } from '@/modules/videos/utilities/formatSlotSeconds'
import { sceneImageSource } from '@/modules/videos/utilities/sceneImageSource'
import { aspectClass } from '@/modules/videos/utilities/videoFormat'
import { avatarSceneSpan } from '@pipeline/types/avatar.ts'
import type { SceneDetail } from '@pipeline/types/video-project.ts'
import type { VideoFormat } from '@pipeline/types/video-format.ts'

interface EditorAvatarGalleryCardProps {
  projectId: string
  // La escena de avatar y todas las del proyecto: las acciones son las del
  // panel («Regenerar todos» y la confirmación miran todas las escenas).
  scene: SceneDetail
  scenes: SceneDetail[]
  videoFormat: VideoFormat
  // Cache-buster transitorio de la imagen fija de la escena (la del look).
  version?: number
  // Otra tarea del proyecto o un guardado del editor en curso (lo mismo que
  // apaga el panel de la escena), o la galería mandando un lote: las acciones
  // del avatar esperan.
  busy: boolean
  // Proyecto demo: no se genera nada.
  locked: boolean
  // El clip de esta tarjeta va a reproducirse (o arrancó por otro camino): la
  // galería pausa el que se estaba reproduciendo, así nunca andan dos a la vez.
  onClipPlay(video: HTMLVideoElement): void
}

// Una aparición del avatar en la vista ampliada del editor (entrega 2f, spec
// §22.4): su clip con «Reproducir» / «Pausar» o, sin clip, la imagen del look;
// su número y su tramo, como las tarjetas de imagen; su estado con la regla y
// los textos del bloque de la pista (avatarBlockState y TimelineAvatarItem:
// lista, desactualizada, con la imagen fija —planeada o fallida— o generando,
// con el porcentaje cuando su render arrancó); y debajo, las mismas acciones
// del panel de la escena
// (EditorAvatarSceneActions: «Generar», «Regenerar» o «Regenerar avatar» con
// su costo y la confirmación y, con V o IV, la sección «Movimiento»). No tiene
// botón para elegirla: no entra en la selección de imágenes ni en sus acciones
// en lote. Con el foco en su avance cuando la tarea termina, el foco vuelve a
// la tarjeta: el panel de la escena queda detrás del modal de la galería y el
// foco mandado ahí se escapa del diálogo (medido en Chrome). El clip queda
// montado mientras haya uno (se pausa, no se desmonta): sacar un nodo dentro
// del diálogo de Radix con el foco en el aire lo devuelve al diálogo
// (ERRORES-CONOCIDOS: radix-focusscope-devuelve-el-foco-al-dialogo-si-se-
// desmonta-un-nodo-durante-el-blur). El clip es el normalizado, que no trae
// audio: se ve mudo (en el visor del editor la voz la pone la narración).
export function EditorAvatarGalleryCard({
  projectId,
  scene,
  scenes,
  videoFormat,
  version,
  busy,
  locked,
  onClipPlay,
}: EditorAvatarGalleryCardProps) {
  const { t, i18n } = useTranslation()
  const editorTask = useLibraryEditorTask(projectId)
  const rendering = editorTask.task?.sceneAvatarRendering ?? {}
  const sceneRendering = rendering[scene.id]
  // En cola (el servicio renderiza de a tres), sin porcentaje: como el bloque.
  const percent = useAvatarRenderPercent(
    sceneRendering && !sceneRendering.queued ? sceneRendering : undefined,
  )
  const cardRef = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [failedClip, setFailedClip] = useState<string | null>(null)
  const [failedLook, setFailedLook] = useState<string | null>(null)

  const avatar = scene.avatar
  const state = avatarSceneState(scene, rendering)
  if (!avatar || !state) return null

  const lookSource = sceneImageSource(scene, version)
  const lookVisible = lookSource !== '' && lookSource !== failedLook
  const clipSource = avatar.clipPath
    ? videosApi.videoSource(avatar.clipPath, avatar.clipMtimeMs)
    : ''
  const clipPlayable = clipSource !== '' && clipSource !== failedClip

  // Un clip pausado (o que terminó) arranca; uno que se reproduce se pausa. El
  // de otra tarjeta se pausa ANTES de arrancar este, así no hay un instante
  // con los dos andando. Si el navegador no lo puede reproducir, vuelve a
  // «Reproducir».
  const togglePlayback = () => {
    const video = videoRef.current
    if (!video) return

    if (!video.paused) {
      video.pause()
      return
    }

    onClipPlay(video)
    void video.play().catch(() => setPlaying(false))
  }

  // El título del bloque de la pista (TimelineAvatarItem) para cada estado: va
  // de tooltip en la pastilla, como al pasar sobre el bloque.
  const span = avatarSceneSpan(scene)
  const seconds = formatSlotSeconds(
    span ? span.endSeconds - span.startSeconds : 0,
    i18n.resolvedLanguage ?? 'es',
  )

  const blockTitle = () => {
    if (state === 'generating')
      return t('library.editor.timeline.avatarRendering')

    if (state === 'failed') {
      return t('library.editor.timeline.avatarFailed', {
        reason: t(errorKeyOf(avatar.errorCode)),
      })
    }

    if (state === 'stale') return t('library.editor.timeline.avatarStaleHint')

    if (state === 'planned') return t('library.editor.timeline.avatarPlanned')

    return t('library.editor.timeline.avatarTitle', {
      name: avatar.lookName,
      seconds,
    })
  }

  // La etiqueta visible, siempre corta (rondas 2 y 3 de WP-C): la del bloque
  // donde tiene una («Desactualizado», igual que la caja de las acciones, y
  // «Generando el avatar…» con su porcentaje); «Lista»; y «Con imagen fija»
  // en una planeada o una fallida: en el editor nada la genera sola y así sale
  // en el video, como dicen el aviso de arriba y el bloque de la pista.
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

  // El clip si hay uno (con la imagen del look de póster); si no, la imagen
  // del look; sin ninguna de las dos, el ícono de imagen no disponible.
  const media = () => {
    if (clipSource) {
      return (
        <video
          ref={videoRef}
          src={clipSource}
          poster={lookVisible ? lookSource : undefined}
          muted
          playsInline
          preload="metadata"
          onPlay={(event) => {
            setPlaying(true)
            onClipPlay(event.currentTarget)
          }}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onEmptied={() => setPlaying(false)}
          onError={() => setFailedClip(clipSource)}
          className="h-full w-full object-contain"
        />
      )
    }

    if (lookVisible) {
      return (
        <img
          src={lookSource}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
          onError={() => setFailedLook(lookSource)}
          className="pointer-events-none h-full w-full select-none object-contain [-webkit-user-drag:none]"
        />
      )
    }

    return <ImageOff aria-hidden className="h-8 w-8 text-muted-foreground" />
  }

  return (
    <article
      ref={cardRef}
      tabIndex={-1}
      data-gallery-scene={scene.id}
      aria-label={t('library.editor.imageGallery.avatarCardAria', {
        index: scene.id,
      })}
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-2xl border-2 bg-card outline-none transition-colors',
        state === 'generating' ? 'border-amethyst' : 'border-amethyst/40',
      )}
    >
      <div
        className={cn(
          'relative flex w-full shrink-0 items-center justify-center overflow-hidden bg-amethyst/10',
          aspectClass(videoFormat),
        )}
      >
        {media()}

        {/* La ficha del tipo, como en el bloque de la pista: el busto sobre
            morado. */}
        <span
          aria-hidden
          className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-md bg-amethyst text-white"
        >
          <UserRound className="h-3.5 w-3.5" />
        </span>

        <span
          data-avatar-state={state}
          title={blockTitle()}
          className={cn(
            'absolute right-2 top-2 flex max-w-[calc(100%-3rem)] items-start gap-1 rounded-xl px-2 py-0.5 font-display text-[10px] font-bold leading-4',
            stateTone(),
          )}
        >
          {stateIcon()}
          {/* Nunca se corta: en una tarjeta angosta (cinco columnas con la
              ventana mínima de 1024 px) «Generando el avatar…» con su
              porcentaje no entra en una línea y sigue en la siguiente. */}
          <span className="min-w-0">
            {stateLabel()}
            {percent !== undefined && (
              <span className="ml-1 whitespace-nowrap font-mono tabular-nums">
                {t('library.editor.timeline.avatarRenderingPercent', {
                  percent,
                })}
              </span>
            )}
          </span>
        </span>

        {clipPlayable && (
          <button
            type="button"
            aria-label={t(
              playing
                ? 'library.editor.imageGallery.avatarPause'
                : 'library.editor.imageGallery.avatarPlay',
            )}
            onClick={togglePlayback}
            className="absolute bottom-2 left-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white outline-none transition-colors hover:bg-black/75 focus-visible:ring-2 focus-visible:ring-amethyst"
          >
            {playing ? (
              <Pause aria-hidden className="h-4 w-4" />
            ) : (
              <Play aria-hidden className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      <div className="space-y-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-sm font-bold">
            {t('library.editor.panel.sceneTitle', { id: scene.id })}
          </h3>
          {scene.startSeconds !== undefined &&
            scene.endSeconds !== undefined && (
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {formatTime(scene.startSeconds)} –{' '}
                {formatTime(scene.endSeconds)}
              </span>
            )}
        </div>
        <p
          className="line-clamp-2 min-h-[3.25em] font-body text-xs leading-relaxed text-muted-foreground"
          title={scene.text}
        >
          {scene.text}
        </p>
        {!clipPlayable && (
          <p className="flex items-start gap-1.5 font-body text-[11px] leading-relaxed text-muted-foreground">
            <ImageIcon aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t('library.editor.imageGallery.avatarNoClip')}
          </p>
        )}

        {/* Las del panel de la escena, con su costo, su confirmación y su
            avance; al terminar, el foco que estaba en el avance vuelve acá. */}
        <EditorAvatarSceneActions
          projectId={projectId}
          scene={scene}
          scenes={scenes}
          busy={busy}
          locked={locked}
          focusFallback={() => cardRef.current}
        />
      </div>
    </article>
  )
}
