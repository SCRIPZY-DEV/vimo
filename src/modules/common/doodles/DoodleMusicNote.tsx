import { useDoodleDraw } from '@/modules/common/hooks/useDoodleDraw'

interface Props {
  size?: number
  delay?: number
  loop?: boolean
  className?: string
}

const DoodleMusicNote = ({
  size = 48,
  delay = 0,
  className = '',
  loop,
}: Props) => {
  const drawn = useDoodleDraw({ delayMs: delay, loop })

  const s = (da: number, d: number) => ({
    strokeDasharray: da,
    strokeDashoffset: drawn ? 0 : da,
    transition: `stroke-dashoffset 0.9s ease ${d}s`,
  })

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 50 50"
      className={className}
      style={{ opacity: drawn ? 1 : 0, transition: 'opacity 0.3s ease' }}
    >
      {/* Beam (barra superior que une los dos tallos) */}
      <line
        x1="19"
        y1="11"
        x2="33"
        y2="14"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="3"
        strokeLinecap="round"
        style={s(16, 0)}
      />
      {/* Tallo 1 */}
      <line
        x1="19"
        y1="11"
        x2="19"
        y2="31"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={s(22, 0.1)}
      />
      {/* Tallo 2 */}
      <line
        x1="33"
        y1="14"
        x2="33"
        y2="34"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={s(22, 0.2)}
      />
      {/* Cabeza de nota 1 */}
      <ellipse
        cx="16"
        cy="32"
        rx="4.5"
        ry="3"
        transform="rotate(-18 16 32)"
        fill="hsla(var(--saffron) / 0.85)"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="1.5"
        style={{
          opacity: drawn ? 1 : 0,
          transition: 'opacity 0.3s ease 0.45s',
        }}
      />
      {/* Cabeza de nota 2 */}
      <ellipse
        cx="30"
        cy="35"
        rx="4.5"
        ry="3"
        transform="rotate(-18 30 35)"
        fill="hsla(var(--saffron) / 0.85)"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="1.5"
        style={{ opacity: drawn ? 1 : 0, transition: 'opacity 0.3s ease 0.6s' }}
      />
    </svg>
  )
}

export default DoodleMusicNote
