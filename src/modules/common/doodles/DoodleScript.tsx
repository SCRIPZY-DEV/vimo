import { useDoodleDraw } from '@/modules/common/hooks/useDoodleDraw'

interface Props {
  size?: number
  delay?: number
  loop?: boolean
  className?: string
}

const DoodleScript = ({
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
        x="10"
        y="6"
        width="30"
        height="38"
        rx="3"
        fill="hsla(var(--saffron) / 0.08)"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        style={s(140, 0)}
      />
      <path
        d="M16 16H34M16 22H30M16 28H32M16 34H26"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="1.5"
        strokeLinecap="round"
        style={s(80, 0.5)}
      />
      <path
        d="M10 6L16 6L16 12L10 6Z"
        fill="hsl(var(--saffron))"
        stroke="hsl(var(--saffron))"
        strokeWidth="1"
        style={{ opacity: drawn ? 1 : 0, transition: 'opacity 0.3s ease 1s' }}
      />
    </svg>
  )
}

export default DoodleScript
