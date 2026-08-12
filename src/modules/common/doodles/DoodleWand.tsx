import { useDoodleDraw } from '@/modules/common/hooks/useDoodleDraw'

interface Props {
  size?: number
  delay?: number
  loop?: boolean
  className?: string
}

const DoodleWand = ({ size = 48, delay = 0, className = '', loop }: Props) => {
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
        d="M12 38L36 14"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={s(40, 0)}
      />
      <path
        d="M36 14L40 10L44 14L40 18L36 14Z"
        fill="hsla(var(--saffron) / 0.3)"
        stroke="hsl(var(--saffron))"
        strokeWidth="2"
        strokeLinejoin="round"
        style={s(30, 0.4)}
      />
      <circle
        cx="18"
        cy="12"
        r="2"
        fill="hsl(var(--saffron))"
        style={{ opacity: drawn ? 1 : 0, transition: 'opacity 0.3s ease 0.8s' }}
      />
      <circle
        cx="10"
        cy="20"
        r="1.5"
        fill="hsl(var(--coral))"
        style={{ opacity: drawn ? 1 : 0, transition: 'opacity 0.3s ease 1s' }}
      />
      <circle
        cx="26"
        cy="8"
        r="1.5"
        fill="hsl(var(--ocean))"
        style={{ opacity: drawn ? 1 : 0, transition: 'opacity 0.3s ease 1.1s' }}
      />
      <path
        d="M14 10L16 6M8 18L4 16M24 6L26 2"
        fill="none"
        stroke="hsl(var(--saffron))"
        strokeWidth="1.5"
        strokeLinecap="round"
        style={s(20, 0.9)}
      />
    </svg>
  )
}

export default DoodleWand
