import { useTranslation } from 'react-i18next'
import { FolderOpen, Play } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { videosApi } from '@/modules/videos/api'

interface VideoFileActionsProps {
  videoPath: string
}

// Abrir el mp4 con la app del sistema o mostrarlo en su carpeta.
export function VideoFileActions({ videoPath }: VideoFileActionsProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        onClick={() => void videosApi.openVideo(videoPath)}
        className="rounded-xl font-display"
      >
        <Play className="mr-1.5 h-4 w-4" />
        {t('common.openVideo')}
      </Button>
      <Button
        variant="ghost"
        onClick={() => void videosApi.revealVideo(videoPath)}
        className="rounded-xl font-display text-muted-foreground"
      >
        <FolderOpen className="mr-1.5 h-4 w-4" />
        {t('common.revealVideo')}
      </Button>
    </div>
  )
}
