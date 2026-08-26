import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { Input } from '@/modules/common/ui/input'
import { Label } from '@/modules/common/ui/label'
import type { MusicChoice } from '@/modules/videos/types/library'

interface MusicYoutubeTabProps {
  busy: boolean
  onChoose(choice: MusicChoice): void
}

// Pestaña de música desde YouTube: URL del video, cuyo audio extrae el sidecar.
export function MusicYoutubeTab({ busy, onChoose }: MusicYoutubeTabProps) {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="music-youtube-url" className="font-display">
          {t('library.music.youtubeUrl')}
        </Label>
        <Input
          id="music-youtube-url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder={t('library.music.youtubeUrlPlaceholder')}
        />
      </div>
      <Button
        disabled={busy || url.trim().length === 0}
        onClick={() => onChoose({ source: 'youtube', url })}
        className="w-full rounded-xl font-display font-bold"
      >
        {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
        {t('library.music.useYoutube')}
      </Button>
    </div>
  )
}
