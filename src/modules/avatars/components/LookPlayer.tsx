import { useState } from 'react'
import type { KeyboardEvent, ReactNode, RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Loader2,
  Maximize,
  Minimize,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from 'lucide-react'
import DoodleCharacter from '@/modules/common/doodles/DoodleCharacter'
import { cn } from '@/modules/common/utilities/cn'
import { formatTime } from '@/modules/common/utilities/formatTime'
import { LOOK_PLAYER_SKIP_SECONDS } from '@/modules/avatars/constants'
import { useLookPlayback } from '@/modules/avatars/hooks/useLookPlayback'

interface LookPlayerProps {
  videoUrl?: string
  imageUrl?: string
  // El video todavía se busca (la lista de looks de HeyGen no llegó): el
  // escenario espera con un spinner en vez de decir que no hay video.
  videoLoading?: boolean
  // Nombra el escenario para el lector de pantalla («Vista previa de Dante»).
  label: string
  // La caja del escenario: el diálogo la enfoca al abrir y mientras trabaja,
  // y es la que pasa a pantalla completa.
  stageRef: RefObject<HTMLDivElement | null>
}

// El escenario del reproductor de un look, como el modal de HeyGen: una caja
// 16:9 oscura con la imagen del look desenfocada de fondo y, encima, el video
// entero en su formato real (un look vertical queda al centro). No arranca
// solo y tiene sonido: el botón grande del centro, el de la barra, un clic en
// el video o Espacio/Enter con el foco en el escenario lo reproducen (las
// flechas saltan LOOK_PLAYER_SKIP_SECONDS). La barra, sobre un degradado,
// lleva reproducir/pausar, la línea de tiempo con el progreso pintado, el
// tiempo, silenciar, la velocidad y la pantalla completa si el navegador la
// permite; mientras reproduce se esconde y vuelve con el mouse o el foco del
// teclado. Sin video, la imagen entera y el aviso (o un spinner mientras el
// video se busca); si el video no carga, lo dice en vez de dejar un botón que
// no responde. Todo su estado es el de un video: quien lo monta le cambia la
// `key` al cambiar la URL. Al desmontarse (se cierra el diálogo) el video
// sale del documento y deja de sonar solo.
export function LookPlayer({
  videoUrl,
  imageUrl,
  videoLoading = false,
  label,
  stageRef,
}: LookPlayerProps) {
  const { t, i18n } = useTranslation()
  const playback = useLookPlayback(stageRef)
  // La URL que no cargó (como en LookPreview): otra imagen vuelve a probar.
  const [failedImage, setFailedImage] = useState<string | null>(null)

  const image = imageUrl && imageUrl !== failedImage ? imageUrl : undefined
  // Un solo criterio de «hay video» (una URL vacía no es un video).
  const hasVideo = Boolean(videoUrl)
  const playable = hasVideo && !playback.failed
  const canFullscreen = document.fullscreenEnabled === true
  const position = Math.min(playback.currentSeconds, playback.durationSeconds)
  const progress =
    playback.durationSeconds > 0
      ? (position / playback.durationSeconds) * 100
      : 0

  // El botón grande desaparece al arrancar: el foco pasa al escenario (si se
  // quedara en un botón que se desmonta, el diálogo lo devolvería a su caja y
  // Espacio ya no pausaría).
  const playFromCenter = () => {
    playback.togglePlay()
    stageRef.current?.focus()
  }

  // Solo con el foco en el escenario mismo: en un control de la barra, Espacio
  // y las flechas son de ese control.
  const handleStageKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return

    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      if (!event.repeat) playback.togglePlay()
      return
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      playback.skip(-LOOK_PLAYER_SKIP_SECONDS)
      return
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      playback.skip(LOOK_PLAYER_SKIP_SECONDS)
    }
  }

  const media = () => {
    if (!hasVideo) {
      return (
        <>
          {image ? (
            <img
              src={image}
              alt=""
              draggable={false}
              onError={() => setFailedImage(image)}
              className="absolute inset-0 h-full w-full object-contain"
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center">
              <DoodleCharacter size={96} />
            </span>
          )}
          {videoLoading ? (
            <span
              role="status"
              className="absolute inset-0 flex items-center justify-center"
            >
              <Loader2
                aria-hidden
                className="h-10 w-10 transform-gpu animate-spin text-white/90"
              />
              <span className="sr-only">
                {t('avatars.reproductor.cargando')}
              </span>
            </span>
          ) : (
            <StageNotice>{t('avatars.reproductor.sinVideo')}</StageNotice>
          )}
        </>
      )
    }

    return (
      <>
        <video
          {...playback.videoProps}
          src={videoUrl}
          poster={image}
          playsInline
          preload="metadata"
          onClick={playback.togglePlay}
          className={cn(
            'absolute inset-0 h-full w-full object-contain',
            playable && 'cursor-pointer',
          )}
        />
        {playback.failed && (
          <StageNotice>{t('avatars.reproductor.errorVideo')}</StageNotice>
        )}
      </>
    )
  }

  return (
    <div
      ref={stageRef}
      role="group"
      aria-label={label}
      // Sin video no hay nada que manejar con el teclado: el diálogo puede
      // enfocarlo igual, pero Tab no se detiene acá.
      tabIndex={playable ? 0 : -1}
      onKeyDown={playable ? handleStageKey : undefined}
      // `isolate` y `transform-gpu` en lo que va encima: el video es una capa
      // compuesta y, dentro de una caja con `overflow-hidden` redondeada,
      // WebKit la pinta sobre sus hermanos posicionados si no tienen la suya.
      className="group relative isolate aspect-video w-full overflow-hidden rounded-2xl bg-black outline-none focus-visible:ring-2 focus-visible:ring-saffron focus-visible:ring-offset-2 focus-visible:ring-offset-background [&:fullscreen]:rounded-none"
    >
      {image && (
        <img
          src={image}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl"
        />
      )}

      {media()}

      {playable && !playback.playing && (
        <button
          type="button"
          aria-label={t('common.player.play')}
          onClick={playFromCenter}
          className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 transform-gpu items-center justify-center rounded-full bg-white/90 text-charcoal shadow-xl ring-1 ring-black/5 backdrop-blur-md transition-transform duration-200 hover:scale-105 hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-saffron"
        >
          <Play aria-hidden className="ml-1 h-7 w-7 fill-current" />
        </button>
      )}

      {playable && playback.playing && playback.buffering && (
        <Loader2
          aria-hidden
          className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 transform-gpu animate-spin text-white/90"
        />
      )}

      {playable && (
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 bottom-0 transform-gpu bg-gradient-to-t from-black/85 via-black/45 to-transparent px-4 pb-3 pt-14 transition-opacity duration-200',
            playback.playing
              ? 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 group-has-[:focus-visible]:opacity-100'
              : 'opacity-100',
          )}
        >
          <input
            type="range"
            min={0}
            max={playback.durationSeconds}
            step={0.05}
            value={position}
            disabled={playback.durationSeconds === 0}
            onChange={(event) => playback.seek(Number(event.target.value))}
            aria-label={t('common.player.position')}
            aria-valuetext={formatTime(position)}
            // El tramo ya reproducido, pintado en saffron sobre la pista.
            style={{
              backgroundImage: `linear-gradient(to right, hsl(var(--saffron)) ${progress}%, rgb(255 255 255 / 0.28) ${progress}%)`,
            }}
            className="pointer-events-auto block h-1.5 w-full cursor-pointer appearance-none rounded-full accent-saffron focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron disabled:cursor-default [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md"
          />

          <div className="mt-2 flex items-center gap-1">
            <ControlButton
              label={t(
                playback.playing ? 'common.player.pause' : 'common.player.play',
              )}
              onClick={playback.togglePlay}
            >
              {playback.playing ? (
                <Pause aria-hidden className="h-[18px] w-[18px] fill-current" />
              ) : (
                <Play aria-hidden className="h-[18px] w-[18px] fill-current" />
              )}
            </ControlButton>
            <span className="ml-1 font-mono text-xs tabular-nums text-white/85">
              {formatTime(position)} / {formatTime(playback.durationSeconds)}
            </span>

            <ControlButton
              label={t(
                playback.muted
                  ? 'avatars.reproductor.activarSonido'
                  : 'avatars.reproductor.silenciar',
              )}
              onClick={playback.toggleMute}
              className="ml-auto"
            >
              {playback.muted ? (
                <VolumeX aria-hidden className="h-[18px] w-[18px]" />
              ) : (
                <Volume2 aria-hidden className="h-[18px] w-[18px]" />
              )}
            </ControlButton>
            <button
              type="button"
              onClick={playback.cycleRate}
              className="pointer-events-auto h-8 shrink-0 rounded-full bg-white/10 px-3 font-display text-xs font-bold text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron"
            >
              {t('avatars.reproductor.velocidad', {
                rate: playback.rate.toLocaleString(i18n.resolvedLanguage),
              })}
            </button>
            {canFullscreen && (
              <ControlButton
                label={t(
                  playback.fullscreen
                    ? 'avatars.reproductor.salirPantallaCompleta'
                    : 'avatars.reproductor.pantallaCompleta',
                )}
                onClick={playback.toggleFullscreen}
              >
                {playback.fullscreen ? (
                  <Minimize aria-hidden className="h-[18px] w-[18px]" />
                ) : (
                  <Maximize aria-hidden className="h-[18px] w-[18px]" />
                )}
              </ControlButton>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface ControlButtonProps {
  label: string
  onClick: () => void
  className?: string
  children: ReactNode
}

// Un control redondo de la barra del reproductor: solo ícono, el nombre va en
// `aria-label` (ya traducido).
function ControlButton({
  label,
  onClick,
  className,
  children,
}: ControlButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        'pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron',
        className,
      )}
    >
      {children}
    </button>
  )
}

interface StageNoticeProps {
  children: ReactNode
}

// Una línea al pie del escenario, sobre un degradado: por qué no hay video.
function StageNotice({ children }: StageNoticeProps) {
  return (
    <p
      role="status"
      className="absolute inset-x-0 bottom-0 transform-gpu bg-gradient-to-t from-black/85 via-black/45 to-transparent px-6 pb-4 pt-14 text-center font-body text-sm font-medium text-white/90"
    >
      {children}
    </p>
  )
}
