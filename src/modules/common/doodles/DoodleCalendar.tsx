import { useDoodleDraw } from '@/modules/common/hooks/useDoodleDraw'

interface Props {
  size?: number
  delay?: number
  loop?: boolean
  className?: string
}

const DoodleCalendar = ({
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
      <rect
        x="8"
        y="12"
        width="34"
        height="32"
        rx="4"
        fill="hsla(var(--saffron) / 0.08)"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        style={s(140, 0)}
      />
      <path
        d="M8 22H42"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2"
        style={s(34, 0.4)}
      />
      <path
        d="M18 8V16M32 8V16"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={s(20, 0.3)}
      />
      <circle
        cx="20"
        cy="30"
        r="2"
        fill="hsl(var(--saffron))"
        style={{ opacity: drawn ? 1 : 0, transition: 'opacity 0.3s ease 0.8s' }}
      />
      <circle
        cx="30"
        cy="30"
        r="2"
        fill="hsl(var(--coral))"
        style={{ opacity: drawn ? 1 : 0, transition: 'opacity 0.3s ease 0.9s' }}
      />
      <circle
        cx="20"
        cy="38"
        r="2"
        fill="hsl(var(--ocean))"
        style={{ opacity: drawn ? 1 : 0, transition: 'opacity 0.3s ease 1s' }}
      />
    </svg>
  )
}

export default DoodleCalendar
