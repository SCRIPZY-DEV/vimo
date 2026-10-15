import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import { AudioPlayer } from '@/modules/common/components/AudioPlayer'
import { Button } from '@/modules/common/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/modules/common/ui/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/modules/common/ui/tabs'
import { MusicAiTab } from '@/modules/videos/components/MusicAiTab'
import { MusicYoutubeTab } from '@/modules/videos/components/MusicYoutubeTab'
import type { MusicChoice } from '@/modules/videos/types/library'
import type { MusicOption } from '@pipeline/types/music.ts'

interface MusicDialogProps {
  open: boolean
  embedded?: boolean
  script: string
  hasMusic: boolean
  busy: boolean
  musicPercent: number | null
  // Música vigente: se escucha con el volumen de la mezcla ya aplicado.
  musicSrc: string | null
  musicVolume: number
  onClose(): void
  onSetMusic(choice: MusicChoice): Promise<boolean>
  onGenerate(
    prompt: string,
    instrumental: boolean,
  ): Promise<MusicOption[] | null>
  onSuggestPrompt(): Promise<string | null>
  onPickFile(): Promise<string | null>
}

// Música de fondo del proyecto: IA (con variaciones para elegir), YouTube,
// archivo local, o quitarla. El estado de cada pestaña vive en su componente
// y se descarta al cerrar (Radix desmonta el contenido).
export function MusicDialog({
  open,
  embedded = false,
  script,
  hasMusic,
  busy,
  musicPercent,
  musicSrc,
  musicVolume,
  onClose,
  onSetMusic,
  onGenerate,
  onSuggestPrompt,
  onPickFile,
}: MusicDialogProps) {
  const { t } = useTranslation()

  const applyMusic = async (choice: MusicChoice) => {
    const ok = await onSetMusic(choice)
    if (ok) onClose()
  }

  const applyFile = async () => {
    const path = await onPickFile()
    if (!path) return
    await applyMusic({ source: 'file', audioPath: path })
  }

  const content = (
    <>
      <Tabs defaultValue="ai">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="ai" className="font-display">
            {t('library.music.tabAi')}
          </TabsTrigger>
          <TabsTrigger value="youtube" className="font-display">
            {t('library.music.tabYoutube')}
          </TabsTrigger>
          <TabsTrigger value="file" className="font-display">
            {t('library.music.tabFile')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ai" className="pt-3">
          <MusicAiTab
            canSuggest={script.length > 0}
            busy={busy}
            musicPercent={musicPercent}
            onGenerate={onGenerate}
            onSuggestPrompt={onSuggestPrompt}
            onChoose={(choice) => void applyMusic(choice)}
          />
        </TabsContent>

        <TabsContent value="youtube" className="pt-3">
          <MusicYoutubeTab
            busy={busy}
            onChoose={(choice) => void applyMusic(choice)}
          />
        </TabsContent>

        <TabsContent value="file" className="space-y-3 pt-3">
          <p className="font-body text-sm text-muted-foreground">
            {t('library.music.fileHint')}
          </p>
          <Button
            disabled={busy}
            onClick={() => void applyFile()}
            className="w-full rounded-xl font-display font-bold"
          >
            {t('library.music.pickFile')}
          </Button>
        </TabsContent>
      </Tabs>

      {musicSrc && (
        <div className="space-y-2 rounded-xl border border-border p-3">
          <p className="font-display text-sm font-bold text-foreground">
            {t('library.music.current')}
          </p>
          <AudioPlayer src={musicSrc} volume={musicVolume} loop />
        </div>
      )}

      {hasMusic && (
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => void applyMusic({ source: 'remove' })}
          className="rounded-xl font-display text-muted-foreground hover:text-destructive-text"
        >
          <Trash2 className="mr-1.5 h-4 w-4" />
          {t('library.music.remove')}
        </Button>
      )}
    </>
  )

  if (embedded) return open ? <div className="space-y-4">{content}</div> : null

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">
            {t('library.music.title')}
          </DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  )
}
