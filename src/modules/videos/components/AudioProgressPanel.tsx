import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { formatSecondsShort } from '@/modules/videos/utilities/formatElapsed'

interface AudioProgressPanelProps {
  Icon: LucideIcon
  title: string
  elapsedSeconds: number
  percent: number
  // Solo la voz lo muestra: qué esperar del proveedor mientras la barra sube.
  hint?: string
}

// Panel de una síntesis de audio en curso (voz o música de fondo): título,
// tiempo · porcentaje y barra en ocean. Port de los dos paneles inline de
// PantallaProgreso.tsx del origen, que eran el mismo markup.
export function AudioProgressPanel({
  Icon,
  title,
  elapsedSeconds,
  percent,
  hint,
}: AudioProgressPanelProps) {
  const width = Math.min(100, Math.max(0, percent))

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
          <p className="font-mono text-xs text-muted-foreground">
            {formatSecondsShort(elapsedSeconds)} · {Math.round(width)}%
          </p>
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
