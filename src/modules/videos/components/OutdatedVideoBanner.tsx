import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { libraryEditorPath } from '@/modules/videos/constants'

interface OutdatedVideoBannerProps {
  projectId: string
}

export function OutdatedVideoBanner({ projectId }: OutdatedVideoBannerProps) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-coral/40 bg-coral/10 p-4">
      <p className="flex items-center gap-2 font-body text-sm text-foreground">
        <TriangleAlert className="h-4 w-4 shrink-0 text-coral" />
        {t('library.player.outdatedBanner')}
      </p>
      <Button asChild size="sm" className="shrink-0 rounded-lg font-display">
        <Link to={libraryEditorPath(projectId)}>
          {t('library.player.outdatedCta')}
        </Link>
      </Button>
    </div>
  )
}
