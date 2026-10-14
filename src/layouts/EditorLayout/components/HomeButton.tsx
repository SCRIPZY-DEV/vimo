import { useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import DoodleHome from '@/modules/common/doodles/DoodleHome'
import DoodleRocket from '@/modules/common/doodles/DoodleRocket'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/modules/common/ui/tooltip'
import { cn } from '@/modules/common/utilities/cn'
import { VideosRoutes } from '@/modules/videos/constants'

// El logo de la barra del editor (ADR-0056): el cohete en reposo; con el
// mouse o el foco encima aparece el fondo, el cohete se desvanece y la casita
// se dibuja sola. El clic vuelve a la Biblioteca.
export function HomeButton() {
  const { t } = useTranslation()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const active = hovered || focused
  const label = t('layout.editorBar.volverBiblioteca')

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={VideosRoutes.library}
          aria-label={label}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={cn(
            'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl outline-none transition-colors focus-visible:ring-2 focus-visible:ring-saffron',
            active && 'bg-muted',
          )}
        >
          <motion.span
            animate={{ opacity: active ? 0 : 1, scale: active ? 0.8 : 1 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <DoodleRocket size={22} delay={100} />
          </motion.span>
          <AnimatePresence>
            {active && (
              <motion.span
                key="home"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.12 }}
                className="absolute inset-0 flex items-center justify-center"
              >
                {/* Con delay 0 la transición del trazo puede arrancar antes de que haya estilo calculado y la casita aparece ya dibujada. */}
                <DoodleHome size={26} delay={50} />
              </motion.span>
            )}
          </AnimatePresence>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
