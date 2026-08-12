import { useDoodleDraw } from '@/modules/common/hooks/useDoodleDraw'

interface Props {
  size?: number
  delay?: number
  loop?: boolean
  className?: string
}

const DoodleChart = ({ size = 48, delay = 0, className = '', loop }: Props) => {
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
      <path
        d="M8 42H42"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={s(34, 0)}
      />
      <path
        d="M8 42V10"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={s(32, 0.2)}
      />
      <rect
        x="14"
        y="28"
        width="6"
        height="14"
        rx="1"
        fill="hsl(var(--ocean))"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="1.5"
        style={s(45, 0.5)}
      />
      <rect
        x="22"
        y="20"
        width="6"
        height="22"
        rx="1"
        fill="hsl(var(--saffron))"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="1.5"
        style={s(60, 0.6)}
      />
      <rect
        x="30"
        y="14"
        width="6"
        height="28"
        rx="1"
        fill="hsl(var(--coral))"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="1.5"
        style={s(72, 0.7)}
      />
      <path
        d="M10 32L17 24L25 18L33 12L40 8"
        fill="none"
        stroke="hsl(var(--saffron))"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={s(50, 0.9)}
      />
    </svg>
  )
}

export default DoodleChart
