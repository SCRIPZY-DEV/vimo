import { useDoodleDraw } from '@/modules/common/hooks/useDoodleDraw'

interface Props {
  size?: number
  delay?: number
  loop?: boolean
  className?: string
}

const DoodleCoin = ({ size = 48, delay = 0, className = '', loop }: Props) => {
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
        cx="25"
        cy="25"
        r="17"
        fill="hsla(var(--saffron) / 0.15)"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        style={s(110, 0)}
      />
      <circle
        cx="25"
        cy="25"
        r="13"
        fill="none"
        stroke="hsl(var(--saffron))"
        strokeWidth="1.5"
        style={s(85, 0.4)}
      />
      <path
        d="M25 14V36M21 18C21 18 23 16 25 16C28 16 30 18 28 20C26 22 22 22 22 24C22 26 24 28 27 28C29 28 29 26 29 26"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2"
        strokeLinecap="round"
        style={s(60, 0.6)}
      />
    </svg>
  )
}

export default DoodleCoin
