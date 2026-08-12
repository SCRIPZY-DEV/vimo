import { useDoodleDraw } from '@/modules/common/hooks/useDoodleDraw'

interface Props {
  size?: number
  delay?: number
  loop?: boolean
  className?: string
}

/**
 * Micrófono clásico con cápsula, base, soporte y ondas de sonido a los lados.
 * Es el icono universal de "voces / TTS" — pictográficamente claro a primera vista.
 */
const DoodleVoice = ({ size = 48, delay = 0, className = '', loop }: Props) => {
  const drawn = useDoodleDraw({ delayMs: delay, loop })

  const s = (da: number, d: number) => ({
    strokeDasharray: da,
    strokeDashoffset: drawn ? 0 : da,
    transition: `stroke-dashoffset 1s ease ${d}s`,
  })

  const fade = (d: number) => ({
    opacity: drawn ? 1 : 0,
    transition: `opacity 0.3s ease ${d}s`,
  })

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 50 50"
      className={className}
      style={{ opacity: drawn ? 1 : 0, transition: 'opacity 0.3s ease' }}
    >
      {/* Cápsula del micrófono (rectángulo redondeado) */}
      <rect
        x="20"
        y="8"
        width="10"
        height="20"
        rx="5"
        ry="5"
        fill="hsla(var(--saffron) / 0.25)"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        style={s(60, 0)}
      />
      {/* Líneas internas de la cápsula (rejilla) */}
      <path
        d="M22 14H28 M22 18H28 M22 22H28"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="1.5"
        strokeLinecap="round"
        style={s(24, 0.6)}
      />
      {/* Arco soporte */}
      <path
        d="M14 24C14 30 19 35 25 35C31 35 36 30 36 24"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={s(40, 0.4)}
      />
      {/* Pie del micrófono */}
      <path
        d="M25 35V42"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={s(8, 1)}
      />
      <path
        d="M19 42H31"
        fill="none"
        stroke="hsl(var(--doodle-ink))"
        strokeWidth="2.5"
        strokeLinecap="round"
        style={s(13, 1.1)}
      />
      {/* Onda de sonido izquierda (coral) */}
      <path
        d="M9 18C7 20 7 26 9 28"
        fill="none"
        stroke="hsl(var(--coral))"
        strokeWidth="2"
        strokeLinecap="round"
        style={s(14, 1.3)}
      />
      {/* Onda de sonido derecha (ocean) */}
      <path
        d="M41 18C43 20 43 26 41 28"
        fill="none"
        stroke="hsl(var(--ocean))"
        strokeWidth="2"
        strokeLinecap="round"
        style={s(14, 1.4)}
      />
      {/* Notitas musicales */}
      <circle
        cx="6"
        cy="12"
        r="1.5"
        fill="hsl(var(--saffron))"
        style={fade(1.6)}
      />
      <circle
        cx="44"
        cy="12"
        r="1.5"
        fill="hsl(var(--coral))"
        style={fade(1.7)}
      />
    </svg>
  )
}

export default DoodleVoice
