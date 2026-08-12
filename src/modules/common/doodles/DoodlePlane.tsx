import { useDoodleDraw } from '@/modules/common/hooks/useDoodleDraw'

interface Props {
  size?: number
  delay?: number
  loop?: boolean
  className?: string
}

const DoodlePlane = ({ size = 48, delay = 0, className = '', loop }: Props) => {
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
        d="M6 26L44 10L30 42L24 28L6 26Z"
        fill="hsla(var(--ocean) / 0.1)"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        strokeLinejoin="round"
        style={s(120, 0)}
      />
      <path
        d="M24 28L44 10"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="1.5"
        style={s(30, 0.5)}
      />
      <path
        d="M24 28L24 38L30 32"
        fill="none"
        stroke="hsl(var(--saffron))"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        style={s(25, 0.7)}
      />
    </svg>
  )
}

export default DoodlePlane
