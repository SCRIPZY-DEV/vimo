import { useDoodleDraw } from '@/modules/common/hooks/useDoodleDraw'

interface Props {
  className?: string
  delay?: number
  loop?: boolean
  direction?: 'right' | 'down'
}

const DoodleArrow = ({
  className = '',
  delay = 0,
  direction = 'right',
  loop,
}: Props) => {
  const drawn = useDoodleDraw({ delayMs: delay, loop })

  return (
    <svg
      className={className}
      width="60"
      height="30"
      viewBox="0 0 60 30"
      style={{ transform: direction === 'down' ? 'rotate(90deg)' : undefined }}
    >
      <path
        d="M5 15 Q15 5 30 15 Q45 25 55 15"
        fill="none"
        stroke="hsl(var(--saffron))"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={{
          strokeDasharray: 80,
          strokeDashoffset: drawn ? 0 : 80,
          transition: 'stroke-dashoffset 0.8s ease',
        }}
      />
      <path
        d="M48 10 L55 15 L48 20"
        fill="none"
        stroke="hsl(var(--saffron))"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 20,
          strokeDashoffset: drawn ? 0 : 20,
          transition: 'stroke-dashoffset 0.5s ease 0.6s',
        }}
      />
    </svg>
  )
}

export default DoodleArrow
