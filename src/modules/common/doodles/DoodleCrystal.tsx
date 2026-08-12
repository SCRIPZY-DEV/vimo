import { useDoodleDraw } from '@/modules/common/hooks/useDoodleDraw'

interface Props {
  size?: number
  delay?: number
  loop?: boolean
  className?: string
}

const DoodleCrystal = ({
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
      <circle
        cx="25"
        cy="22"
        r="14"
        fill="hsla(var(--lavender) / 0.3)"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        style={s(90, 0)}
      />
      <path
        d="M15 36C15 36 18 42 25 42C32 42 35 36 35 36"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={s(30, 0.5)}
      />
      <circle
        cx="20"
        cy="18"
        r="2"
        fill="hsl(var(--saffron))"
        style={{ opacity: drawn ? 1 : 0, transition: 'opacity 0.3s ease 0.8s' }}
      />
      <circle
        cx="28"
        cy="20"
        r="1.5"
        fill="hsl(var(--ocean))"
        style={{ opacity: drawn ? 1 : 0, transition: 'opacity 0.3s ease 0.9s' }}
      />
      <path
        d="M22 26C23 24 27 24 28 26"
        fill="none"
        stroke="hsl(var(--coral))"
        strokeWidth="1.5"
        strokeLinecap="round"
        style={s(10, 1)}
      />
    </svg>
  )
}

export default DoodleCrystal
