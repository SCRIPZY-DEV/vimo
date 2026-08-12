import { useDoodleDraw } from '@/modules/common/hooks/useDoodleDraw'

interface Props {
  className?: string
  delay?: number
  loop?: boolean
  size?: number
}

const DoodleLightbulb = ({
  className = '',
  delay = 300,
  size,
  loop,
}: Props) => {
  const drawn = useDoodleDraw({ delayMs: delay, loop })

  const s = (da: number, d: number) => ({
    strokeDasharray: da,
    strokeDashoffset: drawn ? 0 : da,
    transition: `stroke-dashoffset 1.5s ease ${d}s`,
  })

  return (
    <svg
      className={className}
      width={size ?? 120}
      height={size ? Math.round(size * 1.17) : 140}
      viewBox="0 0 120 140"
    >
      <path
        d="M60 15 C35 15 20 35 20 55 C20 75 40 80 42 95 L78 95 C80 80 100 75 100 55 C100 35 85 15 60 15Z"
        fill="hsla(var(--saffron) / 0.15)"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="3"
        strokeLinecap="round"
        style={s(300, 0)}
      />
      <line
        x1="42"
        y1="100"
        x2="78"
        y2="100"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="3"
        style={s(40, 0.5)}
      />
      <line
        x1="45"
        y1="107"
        x2="75"
        y2="107"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="3"
        style={s(30, 0.7)}
      />
      <line
        x1="50"
        y1="114"
        x2="70"
        y2="114"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="3"
        style={s(20, 0.9)}
      />
      {[
        { x1: 60, y1: 2, x2: 60, y2: 10, d: 1.2 },
        { x1: 25, y1: 20, x2: 30, y2: 27, d: 1.3 },
        { x1: 95, y1: 20, x2: 90, y2: 27, d: 1.4 },
        { x1: 8, y1: 55, x2: 16, y2: 55, d: 1.5 },
        { x1: 104, y1: 55, x2: 112, y2: 55, d: 1.6 },
      ].map((l, i) => (
        <line
          key={i}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          stroke="hsl(var(--saffron))"
          strokeWidth="2"
          strokeLinecap="round"
          style={s(10, l.d)}
        />
      ))}
    </svg>
  )
}

export default DoodleLightbulb
