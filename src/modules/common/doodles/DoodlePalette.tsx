import { useDoodleDraw } from '@/modules/common/hooks/useDoodleDraw'

interface Props {
  size?: number
  delay?: number
  loop?: boolean
  className?: string
}

const DoodlePalette = ({
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
        d="M25 6C14 6 6 14 6 25C6 36 14 44 25 44C27 44 28 43 28 41C28 40 28 39 27 38C26 37 26 36 26 35C26 32 28 30 31 30H34C40 30 44 26 44 20C44 12 36 6 25 6Z"
        fill="hsla(var(--lavender) / 0.3)"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        style={s(160, 0)}
      />
      <circle
        cx="16"
        cy="20"
        r="3"
        fill="hsl(var(--coral))"
        style={{ opacity: drawn ? 1 : 0, transition: 'opacity 0.3s ease 0.8s' }}
      />
      <circle
        cx="24"
        cy="14"
        r="3"
        fill="hsl(var(--saffron))"
        style={{ opacity: drawn ? 1 : 0, transition: 'opacity 0.3s ease 0.9s' }}
      />
      <circle
        cx="34"
        cy="18"
        r="3"
        fill="hsl(var(--ocean))"
        style={{ opacity: drawn ? 1 : 0, transition: 'opacity 0.3s ease 1s' }}
      />
      <circle
        cx="18"
        cy="30"
        r="2.5"
        fill="hsl(var(--doodle-ink))"
        style={{ opacity: drawn ? 1 : 0, transition: 'opacity 0.3s ease 1.1s' }}
      />
    </svg>
  )
}

export default DoodlePalette
