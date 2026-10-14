import { useDoodleDraw } from '@/modules/common/hooks/useDoodleDraw'

/** Trazo completo: transition de 0.35s + stagger máximo de 0.2s en los paths. */
const HOME_DRAW_DURATION_MS = 550

interface Props {
  className?: string
  delay?: number
  loop?: boolean
  size?: number
  /** Avisa cuando la casita terminó de dibujarse (ignorado en modo loop). */
  onDrawComplete?: () => void
}

// Casita: el destino del botón de inicio del editor (ADR-0056). Trazo corto,
// de medio segundo, porque se dibuja al pasar el mouse y no al abrir una
// pantalla. Mismo lenguaje que el cohete: tinta, techo azafrán, puerta coral.
const DoodleHome = ({
  className = '',
  delay = 0,
  size,
  loop,
  onDrawComplete,
}: Props) => {
  const drawn = useDoodleDraw({
    delayMs: delay,
    loop,
    drawDurationMs: HOME_DRAW_DURATION_MS,
    onDrawComplete,
  })

  const s = (da: number, d: number) => ({
    strokeDasharray: da,
    strokeDashoffset: drawn ? 0 : da,
    transition: `stroke-dashoffset 0.35s ease ${d}s`,
  })

  return (
    <svg
      className={className}
      width={size ?? 100}
      height={size ?? 100}
      viewBox="0 0 100 100"
    >
      {/* Techo */}
      <path
        d="M50 14 L14 48 L86 48 Z"
        fill="hsl(var(--saffron))"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="3"
        strokeLinejoin="round"
        style={s(180, 0)}
      />
      {/* Paredes */}
      <path
        d="M24 48 L24 86 L76 86 L76 48"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={s(130, 0.1)}
      />
      {/* Puerta */}
      <path
        d="M42 86 L42 62 Q50 56 58 62 L58 86"
        fill="hsl(var(--coral))"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="3"
        strokeLinejoin="round"
        style={s(70, 0.2)}
      />
    </svg>
  )
}

export default DoodleHome
