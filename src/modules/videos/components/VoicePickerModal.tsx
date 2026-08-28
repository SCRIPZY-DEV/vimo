import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Pause, Play, Search } from 'lucide-react'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { Button } from '@/modules/common/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/modules/common/ui/dialog'
import { Input } from '@/modules/common/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/modules/common/ui/tabs'
import { cn } from '@/modules/common/utilities/cn'
import { useVoiceCatalog } from '@/modules/videos/hooks/useVoiceCatalog'
import { matchesVoiceSearch } from '@/modules/common/utilities/matchesVoiceSearch'
import { useVoicePreview } from '@/modules/voices/hooks/useVoicePreview'
import type { SelectedVoice } from '@/modules/videos/types/create'
import type { VoiceProviderId } from '@pipeline/types/voices.ts'

interface VoicePickerModalProps {
  current: SelectedVoice | null
  onSelect: (voice: SelectedVoice) => void
  onClose: () => void
}

const PROVIDER_TABS: { id: VoiceProviderId; labelKey: string }[] = [
  { id: 'minimax', labelKey: 'create.voice.tabs.minimax' },
  { id: 'elevenlabs', labelKey: 'create.voice.tabs.elevenlabs' },
  { id: 'edge', labelKey: 'create.voice.tabs.edge' },
]

export function VoicePickerModal({
  current,
  onSelect,
  onClose,
}: VoicePickerModalProps) {
  const { t } = useTranslation()
  const { playingUrl, togglePreview, stopPreview } = useVoicePreview()

  const [provider, setProvider] = useState<VoiceProviderId>(
    current?.provider ?? 'minimax',
  )
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<SelectedVoice | null>(current)

  const catalog = useVoiceCatalog({ provider, search, enabled: true })

  const visibleVoices = catalog.filtersAreClientSide
    ? catalog.voices.filter((voice) => matchesVoiceSearch(voice, search))
    : catalog.voices

  const close = () => {
    stopPreview()
    onClose()
  }

  const confirm = () => {
    if (!selected) return
    stopPreview()
    onSelect(selected)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle className="font-display">
            {t('create.voice.pickerTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('create.voice.pickerDescription')}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={provider}
          onValueChange={(value) => {
            stopPreview()
            setProvider(value as VoiceProviderId)
          }}
        >
          <TabsList className="w-full">
            {PROVIDER_TABS.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="flex-1">
                {t(tab.labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('create.voice.searchPlaceholder')}
            className="pl-9"
          />
        </div>

        {provider === 'edge' && (
          <p className="font-body text-xs text-muted-foreground">
            {t('create.voice.edgeNote')}
          </p>
        )}

        {catalog.errorKey && <ErrorMessage>{t(catalog.errorKey)}</ErrorMessage>}

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {catalog.isLoading && (
            <p className="py-8 text-center">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
            </p>
          )}

          {!catalog.isLoading && visibleVoices.length === 0 && (
            <p className="py-8 text-center font-body text-sm text-muted-foreground">
              {t('create.voice.empty')}
            </p>
          )}

          {visibleVoices.map((voice) => {
            const isSelected =
              selected?.voiceId === voice.voiceId &&
              selected.provider === voice.provider
            const isPlaying = Boolean(
              voice.previewUrl && playingUrl === voice.previewUrl,
            )
            return (
              <div
                key={`${voice.provider}-${voice.voiceId}`}
                className={cn(
                  'flex items-center gap-2 rounded-xl border-2 bg-card p-3 transition-colors',
                  isSelected
                    ? 'border-saffron bg-saffron/10'
                    : 'border-border hover:border-saffron/40',
                )}
              >
                <button
                  type="button"
                  onClick={() =>
                    setSelected({
                      provider: voice.provider,
                      voiceId: voice.voiceId,
                      name: voice.name,
                    })
                  }
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate font-display text-sm font-bold text-foreground">
                    {voice.name}
                  </p>
                  <p className="truncate font-body text-xs text-muted-foreground">
                    {[voice.language, voice.gender, voice.accent]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </button>

                {voice.previewUrl && (
                  <button
                    type="button"
                    onClick={() => togglePreview(voice.previewUrl!)}
                    aria-label={
                      isPlaying
                        ? t('create.voice.pause')
                        : t('create.voice.play')
                    }
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors',
                      isPlaying
                        ? 'border-saffron bg-saffron text-charcoal'
                        : 'border-border text-muted-foreground hover:border-saffron/50',
                    )}
                  >
                    {isPlaying ? (
                      <Pause className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            )
          })}

          {catalog.hasNextPage && (
            <Button
              variant="outline"
              disabled={catalog.isFetchingNextPage}
              onClick={catalog.loadMore}
              className="w-full rounded-xl font-display"
            >
              {catalog.isFetchingNextPage && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t('create.voice.loadMore')}
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={close}
            className="rounded-xl font-display"
          >
            {t('create.form.cancel')}
          </Button>
          <Button
            disabled={!selected}
            onClick={confirm}
            className="rounded-xl font-display font-bold"
          >
            {t('create.voice.use')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
