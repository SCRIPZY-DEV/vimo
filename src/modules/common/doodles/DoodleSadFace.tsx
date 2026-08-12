import { useDoodleDraw } from '@/modules/common/hooks/useDoodleDraw'

interface Props {
  size?: number
  delay?: number
  loop?: boolean
  className?: string
}

const DoodleSadFace = ({
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
      <circle
        cx="25"
        cy="25"
        r="18"
        fill="hsla(var(--coral) / 0.1)"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        style={s(120, 0)}
      />
      <circle
        cx="18"
        cy="20"
        r="2"
        fill="hsl(var(--doodle-ink))"
        style={{ opacity: drawn ? 1 : 0, transition: 'opacity 0.3s ease 0.6s' }}
      />
      <circle
        cx="32"
        cy="20"
        r="2"
        fill="hsl(var(--doodle-ink))"
        style={{ opacity: drawn ? 1 : 0, transition: 'opacity 0.3s ease 0.7s' }}
      />
      <path
        d="M18 34C20 30 24 28 25 28C26 28 30 30 32 34"
        fill="none"
        stroke="hsl(var(--coral))"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={s(25, 0.8)}
      />
      <path
        d="M16 14L14 10"
        fill="none"
        stroke="hsl(var(--ocean))"
        strokeWidth="2"
        strokeLinecap="round"
        style={s(6, 1)}
      />
    </svg>
  )
}

export default DoodleSadFace
