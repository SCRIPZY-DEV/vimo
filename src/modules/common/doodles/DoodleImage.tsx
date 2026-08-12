import { useDoodleDraw } from '@/modules/common/hooks/useDoodleDraw'

interface Props {
  size?: number
  delay?: number
  loop?: boolean
  className?: string
}

const DoodleImage = ({ size = 48, delay = 0, className = '', loop }: Props) => {
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
        x="6"
        y="10"
        width="38"
        height="30"
        rx="3"
        fill="hsla(var(--ocean) / 0.08)"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        style={s(140, 0)}
      />
      <path
        d="M6 34L16 24L24 32L32 22L44 34"
        fill="none"
        stroke="hsl(var(--ocean))"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={s(60, 0.5)}
      />
      <circle
        cx="16"
        cy="18"
        r="3"
        fill="hsl(var(--saffron))"
        stroke="hsl(var(--saffron))"
        strokeWidth="1"
        style={{ opacity: drawn ? 1 : 0, transition: 'opacity 0.3s ease 1s' }}
      />
    </svg>
  )
}

export default DoodleImage
