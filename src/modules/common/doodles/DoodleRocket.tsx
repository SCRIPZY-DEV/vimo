import { useDoodleDraw } from '@/modules/common/hooks/useDoodleDraw'

/** Trazo completo: transition de 1.5s + stagger máximo de 1.4s en los paths. */
const ROCKET_DRAW_DURATION_MS = 2900

interface Props {
  className?: string
  delay?: number
  loop?: boolean
  size?: number
  /** Avisa cuando el cohete terminó de dibujarse (ignorado en modo loop). */
  onDrawComplete?: () => void
}

const DoodleRocket = ({
  className = '',
  delay = 500,
  size,
  loop,
  onDrawComplete,
}: Props) => {
  const drawn = useDoodleDraw({
    delayMs: delay,
    loop,
    drawDurationMs: ROCKET_DRAW_DURATION_MS,
    onDrawComplete,
  })

  const s = (da: number, d: number) => ({
    strokeDasharray: da,
    strokeDashoffset: drawn ? 0 : da,
    transition: `stroke-dashoffset 1.5s ease ${d}s`,
  })

  return (
    <svg
      className={className}
      width={size ?? 100}
      height={size ? Math.round(size * 1.3) : 130}
      viewBox="0 0 100 130"
    >
      <path
        d="M50 10 C50 10 25 40 25 75 L40 90 L50 80 L60 90 L75 75 C75 40 50 10 50 10Z"
        fill="hsl(var(--saffron))"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="3"
        strokeLinecap="round"
        style={s(300, 0)}
      />
      <circle
        cx="50"
        cy="50"
        r="8"
        fill="none"
        stroke="hsl(var(--coral))"
        strokeWidth="2"
        style={s(60, 0.8)}
      />
      <path
        d="M25 75 L15 80 L25 85"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2"
        style={s(30, 1)}
      />
      <path
        d="M75 75 L85 80 L75 85"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2"
        style={s(30, 1)}
      />
      <path
        d="M40 95 Q45 115 42 125"
        fill="none"
        stroke="hsl(var(--coral))"
        strokeWidth="3"
        strokeLinecap="round"
        style={s(40, 1.2)}
      />
      <path
        d="M50 92 Q52 118 50 125"
        fill="none"
        stroke="hsl(var(--coral))"
        strokeWidth="3"
        strokeLinecap="round"
        style={s(40, 1.3)}
      />
      <path
        d="M60 95 Q55 115 58 125"
        fill="none"
        stroke="hsl(var(--coral))"
        strokeWidth="3"
        strokeLinecap="round"
        style={s(40, 1.4)}
      />
    </svg>
  )
}

export default DoodleRocket
