import { useDoodleDraw } from '@/modules/common/hooks/useDoodleDraw'

interface Props {
  size?: number
  delay?: number
  loop?: boolean
  className?: string
}

const DoodleTrophy = ({
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
      <path
        d="M15 8H35V22C35 30 30 34 25 34C20 34 15 30 15 22V8Z"
        fill="hsla(var(--saffron) / 0.15)"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        strokeLinejoin="round"
        style={s(100, 0)}
      />
      <path
        d="M15 14H8C8 14 6 14 6 18C6 22 10 24 15 22"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2"
        strokeLinecap="round"
        style={s(40, 0.4)}
      />
      <path
        d="M35 14H42C42 14 44 14 44 18C44 22 40 24 35 22"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2"
        strokeLinecap="round"
        style={s(40, 0.5)}
      />
      <path
        d="M25 34V40M18 40H32"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={s(25, 0.7)}
      />
      <path
        d="M22 18L25 14L28 18"
        fill="none"
        stroke="hsl(var(--saffron))"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={s(15, 0.9)}
      />
    </svg>
  )
}

export default DoodleTrophy
