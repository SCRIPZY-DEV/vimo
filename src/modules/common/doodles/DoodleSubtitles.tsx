import { useDoodleDraw } from '@/modules/common/hooks/useDoodleDraw'

interface Props {
  size?: number
  delay?: number
  loop?: boolean
  className?: string
}

const DoodleSubtitles = ({
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
        d="M8 10H42C44 10 44 12 44 12V34C44 36 42 36 42 36H28L20 44V36H8C6 36 6 34 6 34V12C6 10 8 10 8 10Z"
        fill="hsla(var(--saffron) / 0.08)"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        strokeLinejoin="round"
        style={s(160, 0)}
      />
      <path
        d="M14 18H36M14 24H30M14 30H26"
        fill="none"
        stroke="hsl(var(--saffron))"
        strokeWidth="1.5"
        strokeLinecap="round"
        style={s(70, 0.6)}
      />
    </svg>
  )
}

export default DoodleSubtitles
