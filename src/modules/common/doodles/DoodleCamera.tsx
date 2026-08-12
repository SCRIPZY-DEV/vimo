import { useDoodleDraw } from '@/modules/common/hooks/useDoodleDraw'

interface Props {
  className?: string
  delay?: number
  loop?: boolean
  size?: number
}

const DoodleCamera = ({ className = '', delay = 700, size, loop }: Props) => {
  const drawn = useDoodleDraw({ delayMs: delay, loop })

  const s = (da: number, d: number) => ({
    strokeDasharray: da,
    strokeDashoffset: drawn ? 0 : da,
    transition: `stroke-dashoffset 1.2s ease ${d}s`,
  })

  return (
    <svg
      className={className}
      width={size ?? 110}
      height={size ? Math.round(size * 0.82) : 90}
      viewBox="0 0 110 90"
    >
      <rect
        x="10"
        y="25"
        width="90"
        height="55"
        rx="8"
        fill="hsla(var(--saffron) / 0.15)"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="3"
        style={s(300, 0)}
      />
      <path
        d="M40 25 L45 12 L65 12 L70 25"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="3"
        strokeLinejoin="round"
        style={s(80, 0.5)}
      />
      <circle
        cx="55"
        cy="52"
        r="16"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="3"
        style={s(110, 0.8)}
      />
      <circle
        cx="55"
        cy="52"
        r="8"
        fill="hsla(var(--saffron) / 0.3)"
        stroke="hsl(var(--saffron))"
        strokeWidth="2"
        style={s(60, 1.2)}
      />
      <circle
        cx="85"
        cy="35"
        r="4"
        fill="hsl(var(--coral))"
        style={{ opacity: drawn ? 1 : 0, transition: 'opacity 0.3s ease 1.5s' }}
      />
    </svg>
  )
}

export default DoodleCamera
