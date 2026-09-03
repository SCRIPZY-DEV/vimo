import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { formatSecondsShort } from '@/modules/videos/utilities/formatElapsed'

interface PhaseProgressPanelProps {
  Icon: LucideIcon
  title: string
  percent: number
  // Voz y música lo traen del sidecar; el render no reporta tiempo propio.
  elapsedSeconds?: number
  // Qué esperar mientras la barra sube: el proveedor de voz, el tramo del
  // render en curso.
  hint?: string
}

// Panel de la fase que corre con una barra de avance (voz, música de fondo o
// render): título, tiempo · porcentaje y barra en ocean. Port de los dos
// paneles inline de PantallaProgreso.tsx del origen, que eran el mismo
// markup; el render lo reutiliza porque el origen no tiene barra para esa fase.
export function PhaseProgressPanel({
  Icon,
  title,
  percent,
  elapsedSeconds,
  hint,
}: PhaseProgressPanelProps) {
  const width = Math.min(100, Math.max(0, percent))
  const percentLabel = `${Math.round(width)}%`
  const meta =
    elapsedSeconds === undefined
      ? percentLabel
      : `${formatSecondsShort(elapsedSeconds)} · ${percentLabel}`

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 rounded-xl border border-ocean/40 bg-ocean/5 p-4"
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-ocean" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-display text-sm font-semibold">{title}</p>
          <p className="font-mono text-xs text-muted-foreground">{meta}</p>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-ocean transition-all duration-500"
            style={{ width: `${width}%` }}
          />
        </div>
        {hint && (
          <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
        )}
      </div>
    </motion.div>
  )
}
