import { useDoodleDraw } from '@/modules/common/hooks/useDoodleDraw'

interface Props {
  size?: number
  delay?: number
  loop?: boolean
  className?: string
}

const DoodleFlame = ({ size = 48, delay = 0, className = '', loop }: Props) => {
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
        d="M25 6C25 6 14 18 14 30C14 38 19 44 25 44C31 44 36 38 36 30C36 18 25 6 25 6Z"
        fill="hsla(var(--coral) / 0.15)"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        strokeLinejoin="round"
        style={s(100, 0)}
      />
      <path
        d="M25 22C25 22 20 28 20 34C20 38 22 40 25 40C28 40 30 38 30 34C30 28 25 22 25 22Z"
        fill="hsla(var(--saffron) / 0.3)"
        stroke="hsl(var(--saffron))"
        strokeWidth="2"
        strokeLinejoin="round"
        style={s(50, 0.5)}
      />
      <path
        d="M25 32C25 32 23 34 23 36C23 38 24 38 25 38C26 38 27 38 27 36C27 34 25 32 25 32Z"
        fill="hsl(var(--coral))"
        stroke="hsl(var(--coral))"
        strokeWidth="1"
        style={{ opacity: drawn ? 1 : 0, transition: 'opacity 0.3s ease 1s' }}
      />
    </svg>
  )
}

export default DoodleFlame
