import { useDoodleDraw } from '@/modules/common/hooks/useDoodleDraw'

interface Props {
  size?: number
  delay?: number
  loop?: boolean
  className?: string
}

const DoodlePersonaje = ({
  size = 48,
  delay = 0,
  className = '',
  loop,
}: Props) => {
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
      {/* Cabeza */}
      <circle
        cx="25"
        cy="17"
        r="9"
        fill="hsla(var(--saffron) / 0.12)"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        style={s(60, 0)}
      />
      {/* Hombros / busto */}
      <path
        d="M11 43C11 33 17 29 25 29C33 29 39 33 39 43"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={s(50, 0.5)}
      />
      {/* Sonrisa */}
      <path
        d="M21 18C22.5 20.5 27.5 20.5 29 18"
        fill="none"
        stroke="hsl(var(--saffron))"
        strokeWidth="2"
        strokeLinecap="round"
        style={s(12, 0.9)}
      />
      {/* Chispa */}
      <circle
        cx="40"
        cy="11"
        r="2"
        fill="hsl(var(--coral))"
        style={{ opacity: drawn ? 1 : 0, transition: 'opacity 0.3s ease 1.1s' }}
      />
    </svg>
  )
}

export default DoodlePersonaje
