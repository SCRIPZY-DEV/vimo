import { useDoodleDraw } from '@/modules/common/hooks/useDoodleDraw'

interface Props {
  size?: number
  delay?: number
  loop?: boolean
  className?: string
}

const DoodleHappyFace = ({
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
        cy="25"
        r="18"
        fill="hsla(var(--saffron) / 0.12)"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        style={s(120, 0)}
      />
      <path
        d="M17 20L19 16L21 20"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={s(12, 0.5)}
      />
      <path
        d="M29 20L31 16L33 20"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={s(12, 0.6)}
      />
      <path
        d="M16 30C18 36 22 38 25 38C28 38 32 36 34 30"
        fill="none"
        stroke="hsl(var(--saffron))"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={s(30, 0.8)}
      />
      <circle
        cx="38"
        cy="12"
        r="2"
        fill="hsl(var(--saffron))"
        style={{ opacity: drawn ? 1 : 0, transition: 'opacity 0.3s ease 1.1s' }}
      />
      <circle
        cx="42"
        cy="8"
        r="1.5"
        fill="hsl(var(--coral))"
        style={{ opacity: drawn ? 1 : 0, transition: 'opacity 0.3s ease 1.2s' }}
      />
    </svg>
  )
}

export default DoodleHappyFace
