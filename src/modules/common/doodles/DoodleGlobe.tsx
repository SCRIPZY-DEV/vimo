import { useDoodleDraw } from '@/modules/common/hooks/useDoodleDraw'

interface Props {
  size?: number
  delay?: number
  loop?: boolean
  className?: string
}

const DoodleGlobe = ({ size = 48, delay = 0, className = '', loop }: Props) => {
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
        fill="hsla(var(--ocean) / 0.08)"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        style={s(120, 0)}
      />
      <ellipse
        cx="25"
        cy="25"
        rx="8"
        ry="18"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="1.5"
        style={s(80, 0.4)}
      />
      <path
        d="M7 25H43"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="1.5"
        style={s(36, 0.6)}
      />
      <path
        d="M10 16H40"
        fill="none"
        stroke="hsl(var(--ocean))"
        strokeWidth="1"
        strokeLinecap="round"
        style={s(30, 0.8)}
      />
      <path
        d="M10 34H40"
        fill="none"
        stroke="hsl(var(--ocean))"
        strokeWidth="1"
        strokeLinecap="round"
        style={s(30, 0.9)}
      />
    </svg>
  )
}

export default DoodleGlobe
