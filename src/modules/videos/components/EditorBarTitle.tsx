import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { VideosRoutes } from '@/modules/videos/constants'

interface EditorBarTitleProps {
  // Nombre del proyecto; ausente mientras carga o si no se pudo abrir.
  name?: string
}

// Migas de la barra del editor: «Biblioteca / Nombre del proyecto». Reemplazan
// a la flecha de volver y al título que el editor tenía dentro del contenido.
export function EditorBarTitle({ name }: EditorBarTitleProps) {
  const { t } = useTranslation()

  return (
    <nav
      aria-label={t('layout.editorBar.rutaProyecto')}
      className="flex min-w-0 items-center gap-1.5 font-display text-sm"
    >
      <Link
        to={VideosRoutes.library}
        className="shrink-0 rounded-md px-1.5 py-1 font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {t('layout.nav.biblioteca')}
      </Link>
      {name && (
        <>
          <span aria-hidden className="shrink-0 text-muted-foreground/60">
            /
          </span>
          <h1 className="truncate font-extrabold text-foreground">{name}</h1>
        </>
      )}
    </nav>
  )
}
