import { useDoodleDraw } from '@/modules/common/hooks/useDoodleDraw'

interface DoodleStarProps {
  size?: number
  delay?: number
  loop?: boolean
  className?: string
}

const DoodleStar = ({
  size = 20,
  delay = 0,
  className = '',
  loop,
}: DoodleStarProps) => {
  const drawn = useDoodleDraw({ delayMs: delay, loop })

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={{ opacity: drawn ? 1 : 0, transition: 'opacity 0.5s ease' }}
    >
      <path
        d="M12 2L14.5 9H22L16 13.5L18 21L12 16.5L6 21L8 13.5L2 9H9.5L12 2Z"
        fill="none"
        stroke="hsl(var(--saffron))"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 80,
          strokeDashoffset: drawn ? 0 : 80,
          transition: 'stroke-dashoffset 1s ease',
        }}
      />
    </svg>
  )
}

export default DoodleStar
