import { useDoodleDraw } from '@/modules/common/hooks/useDoodleDraw'

interface Props {
  size?: number
  delay?: number
  loop?: boolean
  className?: string
}

const DoodleBrain = ({ size = 48, delay = 0, className = '', loop }: Props) => {
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
        d="M25 42V22"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2"
        strokeLinecap="round"
        style={s(20, 0)}
      />
      <path
        d="M25 22C25 12 18 8 14 10C10 12 10 16 12 18C8 18 6 22 8 26C6 28 8 34 14 34C14 38 18 42 25 42"
        fill="hsla(var(--coral) / 0.1)"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        strokeLinejoin="round"
        style={s(120, 0.2)}
      />
      <path
        d="M25 22C25 12 32 8 36 10C40 12 40 16 38 18C42 18 44 22 42 26C44 28 42 34 36 34C36 38 32 42 25 42"
        fill="hsla(var(--saffron) / 0.1)"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        strokeLinejoin="round"
        style={s(120, 0.4)}
      />
      <path
        d="M18 20C20 22 22 20 24 22"
        fill="none"
        stroke="hsl(var(--coral))"
        strokeWidth="1.5"
        strokeLinecap="round"
        style={s(12, 0.8)}
      />
      <path
        d="M26 20C28 22 30 20 32 22"
        fill="none"
        stroke="hsl(var(--saffron))"
        strokeWidth="1.5"
        strokeLinecap="round"
        style={s(12, 0.9)}
      />
    </svg>
  )
}

export default DoodleBrain
