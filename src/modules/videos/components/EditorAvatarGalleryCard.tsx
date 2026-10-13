import { useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ImageOff,
  Image as ImageIcon,
  Pause,
  Play,
  SlidersHorizontal,
  UserRound,
  X,
} from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { cn } from '@/modules/common/utilities/cn'
import { formatTime } from '@/modules/common/utilities/formatTime'
import { videosApi } from '@/modules/videos/api'
import { EditorAvatarSceneActions } from '@/modules/videos/components/EditorAvatarSceneActions'
import { EditorAvatarStatePill } from '@/modules/videos/components/EditorAvatarStatePill'
import { AVATAR_CARD_EXPANDED_GRID_CLASSES } from '@/modules/videos/constants'
import { useAvatarCardFocus } from '@/modules/videos/hooks/useAvatarCardFocus'
import { useAvatarRenderPercent } from '@/modules/videos/hooks/useAvatarRenderPercent'
import { useLibraryEditorTask } from '@/modules/videos/hooks/useLibraryEditorTask'
import { avatarSceneState } from '@/modules/videos/utilities/avatarRegeneration'
import { sceneImageSource } from '@/modules/videos/utilities/sceneImageSource'
import { aspectClass } from '@/modules/videos/utilities/videoFormat'
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
  // Está desplegada (entrega 2g, §23.4): la galería deja una sola a la vez.
  expanded: boolean
  onExpand(): void
  onCollapse(): void
  // El clip de esta tarjeta va a reproducirse (o arrancó por otro camino): la
  // galería pausa el que se estaba reproduciendo, así nunca andan dos a la vez.
  onClipPlay(video: HTMLVideoElement): void
}

// Una aparición del avatar en la vista ampliada del editor (entrega 2f, spec
// §22.4): su clip con «Reproducir» / «Pausar» o, sin clip, la imagen del look;
// su número y su tramo, como las tarjetas de imagen; y su estado con la regla
// y los textos del bloque de la pista (EditorAvatarStatePill: lista,
// desactualizada, con la imagen fija —planeada o fallida— o generando, con el
// porcentaje cuando su render arrancó). No tiene botón para elegirla: no entra
// en la selección de imágenes ni en sus acciones en lote. El clip queda
// montado mientras haya uno (se pausa, no se desmonta): sacar un nodo dentro
// del diálogo de Radix con el foco en el aire lo devuelve al diálogo
// (ERRORES-CONOCIDOS: radix-focusscope-devuelve-el-foco-al-dialogo-si-se-
// desmonta-un-nodo-durante-el-blur). El clip es el normalizado, que no trae
// audio: se ve mudo (en el visor del editor la voz la pone la narración).
//
// Desde la entrega 2g (§23.4) la tarjeta está plegada por defecto: se ve como
// una de imagen, con su mismo borde (el morado la hacía parecer elegida) y sin
// acciones, solo «Ajustar avatar»; un clic en la tarjeta también la despliega.
// Desplegada ocupa la fila entera de la grilla: a la izquierda el clip, con su
// número, su tramo y su texto debajo; a la derecha «Cerrar», arriba, y las
// mismas acciones del panel de la escena (EditorAvatarSceneActions con
// `layout="columns"`: en una columna la duración y el movimiento, y en la otra
// las notas, el costo y las acciones). El medio y su pastilla son los mismos
// nodos en los dos estados, así el clip que se reproduce no se corta al plegar
// ni desplegar. Foco (useAvatarCardFocus): al desplegar va al primer control (el
// «−» de la duración, o el avance si la escena se está generando; a «Cerrar» si
// no hay ninguno) y la tarjeta entra entera en la vista; al plegar con
// «Cerrar», a «Ajustar avatar» (si otra tarjeta la pliega al desplegarse, no le
// roba el foco); y con el foco en el avance cuando la tarea termina, vuelve a
// la tarjeta: el panel de la escena queda detrás del modal y el foco mandado
// ahí se escapa del diálogo (medido en Chrome).
export function EditorAvatarGalleryCard({
  projectId,
  scene,
  scenes,
  videoFormat,
  version,
  busy,
  locked,
  expanded,
  onExpand,
  onCollapse,
  onClipPlay,
}: EditorAvatarGalleryCardProps) {
  const { t } = useTranslation()
  const editorTask = useLibraryEditorTask(projectId)
  const rendering = editorTask.task?.sceneAvatarRendering ?? {}
  const sceneRendering = rendering[scene.id]
  // En cola (el servicio renderiza de a diez: `AVATAR_RENDER_CONCURRENCY`), sin
  // porcentaje: como el bloque.
  const percent = useAvatarRenderPercent(
    sceneRendering && !sceneRendering.queued ? sceneRendering : undefined,
  )
  const videoRef = useRef<HTMLVideoElement>(null)
  const { cardRef, actionsRef, expandRef, closeRef, markClosedByPerson } =
    useAvatarCardFocus(expanded)
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

  const closeByPerson = () => {
    markClosedByPerson()
    onCollapse()
  }

  // Un clic en la tarjeta plegada la despliega, salvo el que cae en uno de sus
  // botones («Reproducir» o «Ajustar avatar», que ya tienen lo suyo).
  const unfoldFromCard = (event: MouseEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest('button'))
      return

    onExpand()
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
      onClick={expanded ? undefined : unfoldFromCard}
      className={cn(
        'min-w-0 overflow-hidden rounded-2xl border-2 bg-card outline-none transition-colors',
        expanded
          ? cn(
              'col-span-full grid grid-cols-1 border-amethyst/50 sm:grid-rows-[auto_1fr] sm:gap-x-4',
              AVATAR_CARD_EXPANDED_GRID_CLASSES[videoFormat],
            )
          : 'flex cursor-pointer flex-col border-border',
      )}
    >
      <div
        className={cn(
          'relative flex w-full shrink-0 items-center justify-center overflow-hidden bg-amethyst/10 sm:col-start-1 sm:row-start-1',
          aspectClass(videoFormat),
        )}
      >
        {media()}

        {/* La ficha del tipo, como en el bloque de la pista: el busto sobre
            morado. Desplegada, abajo a la derecha: arriba la pastilla del
            estado necesita todo el ancho del clip angosto de un video
            vertical («Desactualizado» no entra al lado de la ficha). */}
        <span
          aria-hidden
          className={cn(
            'absolute flex h-6 w-6 items-center justify-center rounded-md bg-amethyst text-white',
            expanded ? 'bottom-2 right-2' : 'left-2 top-2',
          )}
        >
          <UserRound className="h-3.5 w-3.5" />
        </span>

        <EditorAvatarStatePill
          scene={scene}
          state={state}
          percent={percent}
          fullWidth={expanded}
        />

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

      <div
        className={cn(
          'sm:col-start-1 sm:row-start-2',
          expanded ? 'space-y-2 p-3' : 'space-y-3 p-3',
        )}
      >
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
          <p
            title={
              expanded
                ? t('library.editor.imageGallery.avatarNoClip')
                : undefined
            }
            className={cn(
              'flex items-start gap-1.5 font-body text-[11px] text-muted-foreground',
              expanded ? 'leading-snug' : 'leading-relaxed',
            )}
          >
            <ImageIcon aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className={cn(expanded && 'line-clamp-2')}>
              {t('library.editor.imageGallery.avatarNoClip')}
            </span>
          </p>
        )}
        {!expanded && (
          <Button
            ref={expandRef}
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={false}
            aria-label={t('library.editor.imageGallery.avatarExpand', {
              index: scene.id,
            })}
            onClick={onExpand}
            className="w-full rounded-xl font-display text-xs font-bold"
          >
            <SlidersHorizontal aria-hidden className="h-4 w-4" />
            {t('library.editor.avatar.ajustar')}
          </Button>
        )}
      </div>

      {/* Desplegada: «Cerrar» arriba a la derecha y, debajo, las mismas
          acciones del panel de la escena, con su costo, su confirmación y su
          avance; al terminar, el foco que estaba en el avance vuelve a la
          tarjeta. */}
      {expanded && (
        <div className="flex min-w-0 flex-col gap-2 p-3 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:pl-0">
          <div className="flex justify-end">
            <Button
              ref={closeRef}
              type="button"
              variant="outline"
              size="sm"
              aria-label={t('library.editor.imageGallery.avatarCollapse', {
                index: scene.id,
              })}
              onClick={closeByPerson}
              className="h-8 rounded-lg px-3 font-display text-xs font-bold"
            >
              <X aria-hidden className="h-3.5 w-3.5" />
              {t('library.editor.avatar.cerrarAjustes')}
            </Button>
          </div>
          <div ref={actionsRef}>
            <EditorAvatarSceneActions
              projectId={projectId}
              scene={scene}
              scenes={scenes}
              busy={busy}
              locked={locked}
              layout="columns"
              focusFallback={() => cardRef.current}
            />
          </div>
        </div>
      )}
    </article>
  )
}
