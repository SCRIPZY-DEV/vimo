import { useDoodleDraw } from '@/modules/common/hooks/useDoodleDraw'

interface Props {
  size?: number
  delay?: number
  loop?: boolean
  className?: string
}

const DoodlePan = ({ size = 48, delay = 0, className = '', loop }: Props) => {
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
      <ellipse
        cx="22"
        cy="30"
        rx="16"
        ry="10"
        fill="hsla(var(--doodle-ink) / 0.08)"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        style={s(90, 0)}
      />
      <path
        d="M38 28L48 22"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="3"
        strokeLinecap="round"
        style={s(15, 0.4)}
      />
      <path
        d="M15 24C16 20 18 18 18 14"
        fill="none"
        stroke="hsl(var(--coral))"
        strokeWidth="1.5"
        strokeLinecap="round"
        style={s(15, 0.7)}
      />
      <path
        d="M22 22C23 18 25 16 25 12"
        fill="none"
        stroke="hsl(var(--coral))"
        strokeWidth="1.5"
        strokeLinecap="round"
        style={s(15, 0.8)}
      />
      <path
        d="M29 24C30 20 32 18 32 14"
        fill="none"
        stroke="hsl(var(--coral))"
        strokeWidth="1.5"
        strokeLinecap="round"
        style={s(15, 0.9)}
      />
    </svg>
  )
}

export default DoodlePan
