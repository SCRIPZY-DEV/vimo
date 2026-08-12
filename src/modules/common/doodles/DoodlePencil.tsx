import { useDoodleDraw } from '@/modules/common/hooks/useDoodleDraw'

interface Props {
  size?: number
  delay?: number
  loop?: boolean
  className?: string
}

const DoodlePencil = ({
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
        d="M10 40L38 12L42 16L14 44L8 46L10 40Z"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={s(140, 0)}
      />
      <path
        d="M34 16L38 20"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={s(10, 0.5)}
      />
      <path
        d="M8 46L10 40L14 44L8 46Z"
        fill="hsl(var(--saffron))"
        stroke="hsl(var(--saffron))"
        strokeWidth="1.5"
        style={{
          ...s(20, 0.8),
          fill: drawn ? 'hsl(var(--saffron))' : 'transparent',
          transition: 'stroke-dashoffset 0.8s ease 0.8s, fill 0.3s ease 1.2s',
        }}
      />
      <path
        d="M18 38C20 36 22 38 24 36"
        fill="none"
        stroke="hsl(var(--ocean))"
        strokeWidth="1.5"
        strokeLinecap="round"
        style={s(15, 1)}
      />
    </svg>
  )
}

export default DoodlePencil
