import { useDoodleDraw } from '@/modules/common/hooks/useDoodleDraw'

interface Props {
  size?: number
  delay?: number
  loop?: boolean
  className?: string
}

const DoodleMicrophone = ({
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
        x="18"
        y="8"
        width="14"
        height="22"
        rx="7"
        fill="hsla(var(--coral) / 0.1)"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        style={s(80, 0)}
      />
      <path
        d="M12 26C12 34 18 38 25 38C32 38 38 34 38 26"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={s(50, 0.5)}
      />
      <path
        d="M25 38V44M20 44H30"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={s(20, 0.8)}
      />
      <path
        d="M22 16H28M22 20H28"
        fill="none"
        stroke="hsl(var(--coral))"
        strokeWidth="1.5"
        strokeLinecap="round"
        style={s(15, 1)}
      />
    </svg>
  )
}

export default DoodleMicrophone
