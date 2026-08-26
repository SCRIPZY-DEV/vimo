import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { videosApi } from '@/modules/videos/api'
import { VideoFileActions } from '@/modules/videos/components/VideoFileActions'
import type { CreateTask } from '@/modules/videos/types/create'

interface CompletedPanelProps {
  task: CreateTask
  onCreateAnother: () => void
}

export function CompletedPanel({ task, onCreateAnother }: CompletedPanelProps) {
  const { t } = useTranslation()
  const videoPath = task.videoPath

  return (
    <div className="space-y-4 rounded-2xl border-2 border-border bg-card p-6 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-display text-xl font-extrabold text-foreground">
            {task.projectName}
          </h2>
          <p className="font-body text-sm text-muted-foreground">
            {t('create.completed.subtitle')}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={onCreateAnother}
          className="shrink-0 rounded-xl font-display"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          {t('create.completed.createAnother')}
        </Button>
      </div>

      {videoPath && (
        <>
          <video
            src={videosApi.videoSource(videoPath)}
            controls
            className="w-full rounded-xl border border-border bg-black"
          />
          <VideoFileActions videoPath={videoPath} />
        </>
      )}
    </div>
  )
}
