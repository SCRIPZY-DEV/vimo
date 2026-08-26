import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { VideosRoutes } from '@/modules/videos/constants'

interface LibraryViewHeaderProps {
  title: string
  // Acciones alineadas a la derecha (editar, eliminar, …).
  children?: ReactNode
}

// Cabecera de las vistas de un proyecto: volver a la biblioteca + título.
export function LibraryViewHeader({ title, children }: LibraryViewHeaderProps) {
  const { t } = useTranslation()

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between gap-3"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Button
          asChild
          variant="ghost"
          size="icon"
          aria-label={t('library.player.backToLibrary')}
          className="h-9 w-9 shrink-0 rounded-xl text-muted-foreground"
        >
          <Link to={VideosRoutes.library}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="truncate font-display text-2xl font-extrabold text-foreground">
          {title}
        </h1>
      </div>

      {children && (
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      )}
    </motion.div>
  )
}
