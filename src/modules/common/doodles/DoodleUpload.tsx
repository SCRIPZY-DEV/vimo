import { useDoodleDraw } from '@/modules/common/hooks/useDoodleDraw'

interface Props {
  size?: number
  delay?: number
  loop?: boolean
  className?: string
}

const DoodleUpload = ({
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
        d="M10 32C10 40 14 44 25 44C36 44 40 40 40 32"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={s(60, 0)}
      />
      <path
        d="M25 34V10"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={s(30, 0.4)}
      />
      <path
        d="M18 17L25 10L32 17"
        fill="none"
        stroke="hsl(var(--saffron))"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={s(25, 0.7)}
      />
    </svg>
  )
}

export default DoodleUpload
