import { useDoodleDraw } from '@/modules/common/hooks/useDoodleDraw'

interface Props {
  size?: number
  delay?: number
  loop?: boolean
  className?: string
}

const DoodleLaptop = ({
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
        y="10"
        width="30"
        height="22"
        rx="3"
        fill="hsla(var(--ocean) / 0.08)"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        style={s(110, 0)}
      />
      <path
        d="M6 36H44C44 38 42 40 40 40H10C8 40 6 38 6 36Z"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        strokeLinejoin="round"
        style={s(85, 0.5)}
      />
      <path
        d="M18 18L22 22M22 18L18 22"
        fill="none"
        stroke="hsl(var(--coral))"
        strokeWidth="1.5"
        strokeLinecap="round"
        style={s(20, 0.8)}
      />
      <path
        d="M28 20H34"
        fill="none"
        stroke="hsl(var(--ocean))"
        strokeWidth="1.5"
        strokeLinecap="round"
        style={s(6, 0.9)}
      />
    </svg>
  )
}

export default DoodleLaptop
