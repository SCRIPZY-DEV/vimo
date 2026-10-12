import { FLOW_PHASE_KEYS } from '@/modules/common/constants'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { AlertTriangle, Loader2, Search } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { SceneThumbnail } from '@/modules/videos/components/SceneThumbnail'
import { SUPPORT_NOTE_CLASS } from '@/modules/videos/constants'
import { formatSceneSeconds } from '@/modules/videos/utilities/formatSceneSeconds'
import { aspectClass } from '@/modules/videos/utilities/videoFormat'
import type { VideoFormat } from '@pipeline/types/video-format.ts'
import type { SceneView } from '@/modules/videos/types/create'

interface SceneCellProps {
  scene: SceneView
  videoFormat: VideoFormat
  onOpen: () => void
}

// Una escena de la grilla de imágenes (port de CeldaEscena del origen): la
// miniatura con la forma del video, el estado encima (spinner y porcentaje,
// aviso de error o «?» a la espera), el número y los tiempos siempre
// visibles, y el velo con «Ampliar» al pasar el mouse.
export function SceneCell({ scene, videoFormat, onOpen }: SceneCellProps) {
  const { t } = useTranslation()
  // Hover a mano además de group-hover: en el origen los eventos de puntero
  // no siempre actualizaban :hover, y en el webview conviene conservarlo.
  const [hovered, setHovered] = useState(false)

  const ready = scene.imageStatus === 'ok'
  const generating = scene.imageStatus === 'generating'
  const progress =
    generating && typeof scene.imageProgress === 'number'
      ? Math.min(100, Math.max(0, scene.imageProgress))
      : null

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        'group relative overflow-hidden rounded-xl border-2',
        aspectClass(videoFormat),
        ready && 'border-saffron/40',
        generating && 'border-ocean/60',
        scene.imageStatus === 'error' && 'border-destructive/60',
        scene.imageStatus === 'pending' && 'border-border bg-muted/30',
      )}
    >
      {ready && <SceneThumbnail scene={scene} />}

      {/* `pb-6`: el bloque centrado (spinner y porcentaje) sube un poco para
          no pisar la franja de tiempos de abajo en las tarjetas 16:9. */}
      {!ready && (
        <div
          className={cn(
            'absolute inset-0 flex flex-col items-center justify-center gap-2 pb-6',
            generating && 'bg-ocean/10',
            scene.imageStatus === 'error' && 'bg-destructive/10',
          )}
        >
          {generating && (
            <Loader2 className="h-6 w-6 animate-spin text-ocean" />
          )}
          {progress !== null && (
            <span className="font-mono text-sm font-bold tabular-nums text-ocean">
              {Math.round(progress)}%
            </span>
          )}
          {generating &&
            scene.imagePhase &&
            Object.hasOwn(FLOW_PHASE_KEYS, scene.imagePhase) && (
              <span className="px-2 text-center text-xs text-ocean">
                {t(FLOW_PHASE_KEYS[scene.imagePhase])}
              </span>
            )}
          {scene.imageStatus === 'error' && (
            <AlertTriangle className="h-6 w-6 text-destructive" />
          )}
          {scene.imageStatus === 'pending' && (
            <span
              className={cn(SUPPORT_NOTE_CLASS, 'text-muted-foreground/50')}
            >
              {t(
                scene.imagePhase === 'awaiting_sync'
                  ? 'extension.awaitingSync'
                  : 'extension.queued',
              )}
            </span>
          )}
        </div>
      )}

      {/* Cubre toda la celda: el velo y la píldora aparecen al pasar el
          mouse o al enfocar con el teclado. */}
      <button
        type="button"
        aria-label={t('create.progress.cell.enlargeAria', { id: scene.id })}
        onClick={onOpen}
        className="absolute inset-0 z-10 flex cursor-pointer items-center justify-center focus:outline-none"
      >
        <span
          className={cn(
            'absolute inset-0 bg-black/45 transition-opacity duration-200',
            'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
            hovered && 'opacity-100',
          )}
        />
        {/* Píldora más chica que la del origen: en una tarjeta de ~200px la
            de allá (px-4, text-sm) tapaba la celda entera. */}
        <span
          className={cn(
            'relative flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 shadow-lg transition-all duration-200',
            'font-display text-xs font-extrabold text-neutral-900',
            'scale-90 opacity-0 group-hover:scale-100 group-hover:opacity-100 group-focus-within:scale-100 group-focus-within:opacity-100',
            hovered && 'scale-100 opacity-100',
          )}
        >
          <Search className="h-3.5 w-3.5" />
          {t('create.progress.cell.enlarge')}
        </span>
      </button>

      <span className="pointer-events-none absolute left-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-lg bg-black/70 font-display text-xs font-bold text-white backdrop-blur-sm">
        {scene.id}
      </span>

      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/70 to-transparent p-2">
        <span className="font-display text-[10px] font-bold tabular-nums text-white/90">
          {formatSceneSeconds(scene.startSeconds ?? 0)}–
          {formatSceneSeconds(scene.endSeconds ?? 0)}
        </span>
      </div>

      {progress !== null && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 h-1 bg-black/30">
          <div
            className="h-full bg-ocean transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </motion.div>
  )
}
