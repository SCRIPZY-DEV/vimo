import { useDoodleDraw } from '@/modules/common/hooks/useDoodleDraw'

interface Props {
  size?: number
  delay?: number
  loop?: boolean
  className?: string
}

const DoodleMagnifier = ({
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
        cx="22"
        cy="22"
        r="12"
        fill="hsla(var(--ocean) / 0.1)"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        style={s(80, 0)}
      />
      <path
        d="M31 31L42 42"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="3"
        strokeLinecap="round"
        style={s(20, 0.5)}
      />
      <path
        d="M17 19C18 15 22 13 26 15"
        fill="none"
        stroke="hsl(var(--ocean))"
        strokeWidth="1.5"
        strokeLinecap="round"
        style={s(15, 0.8)}
      />
    </svg>
  )
}

export default DoodleMagnifier
