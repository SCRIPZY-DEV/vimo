import { useDoodleDraw } from '@/modules/common/hooks/useDoodleDraw'

interface Props {
  size?: number
  delay?: number
  loop?: boolean
  className?: string
}

// Ícono del modo demo (ADR-0029): un botón de play dibujado a mano.
const DoodlePlay = ({ size = 48, delay = 0, className = '', loop }: Props) => {
  const drawn = useDoodleDraw({ delayMs: delay, loop })

  const s = (da: number, d: number) => ({
    strokeDasharray: da,
    strokeDashoffset: drawn ? 0 : da,
    transition: `stroke-dashoffset 1s ease ${d}s`,
  })

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 50 50"
      className={className}
      style={{ opacity: drawn ? 1 : 0, transition: 'opacity 0.3s ease' }}
    >
      <circle
        cx="25"
        cy="25"
        r="17"
        fill="hsla(var(--saffron) / 0.15)"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        style={s(110, 0)}
      />
      <path
        d="M21 17.5L34.5 25L21 32.5Z"
        fill="hsla(var(--saffron) / 0.35)"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={s(48, 0.4)}
      />
    </svg>
  )
}

export default DoodlePlay
