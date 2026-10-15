import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AudioLines,
  GripVertical,
  Loader2,
  Pause,
  Play,
  Plus,
  SlidersHorizontal,
} from 'lucide-react'
import { CheckboxRow } from '@/modules/common/components/CheckboxRow'
import { Button } from '@/modules/common/ui/button'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/modules/common/ui/tabs'
import { formatTime } from '@/modules/common/utilities/formatTime'
import { EDITOR_SOUND_EFFECT_MIME } from '@/modules/videos/constants'
import { formatSlotSeconds } from '@/modules/videos/utilities/formatSlotSeconds'
import type { EditorSfxPanelProps } from '@/modules/videos/types/editorTools'
import gridStyles from '@/modules/videos/components/EditorToolCardGrid.module.css'

export function EditorSfxPanel({
  effect,
  loading,
  busy,
  allTransitionsEnabled,
  transitionsAvailable = true,
  cursorSeconds,
  error,
  onToggleAllTransitions,
  onAdd,
  onOpenMix,
}: EditorSfxPanelProps) {
  const { t, i18n } = useTranslation()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [previewFailed, setPreviewFailed] = useState(false)

  useEffect(() => {
    const audio = audioRef.current
    return () => {
      audio?.pause()
    }
  }, [effect?.audioDataUri])

  const togglePreview = async () => {
    const audio = audioRef.current
    if (!audio) return

    if (!audio.paused) {
      audio.pause()
      return
    }

    setPreviewFailed(false)
    audio.currentTime = 0
    try {
      await audio.play()
    } catch {
      setPlaying(false)
      setPreviewFailed(true)
    }
  }

  return (
    <Tabs defaultValue="sfx" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList className="h-9 rounded-xl">
          <TabsTrigger
            value="sfx"
            className="rounded-lg font-display text-xs font-bold"
          >
            {t('library.editor.tools.sfx.tab')}
          </TabsTrigger>
        </TabsList>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onOpenMix}
          className="gap-1.5 rounded-lg px-2 font-display text-xs text-muted-foreground"
        >
          <SlidersHorizontal aria-hidden className="h-3.5 w-3.5" />
          {t('library.editor.tools.sfx.mix')}
        </Button>
      </div>
      <TabsContent value="sfx" className="space-y-4">
        <p className="font-body text-xs leading-relaxed text-muted-foreground">
          {t('library.editor.tools.sfx.hint')}
        </p>
        {loading && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl bg-muted/50 p-4 font-body text-xs text-muted-foreground"
          >
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
            {t('library.editor.tools.sfx.loading')}
          </div>
        )}
        {!loading && !effect && (
          <p
            role="alert"
            className="rounded-xl border border-coral/25 bg-coral/5 p-3 font-body text-xs text-coral-text"
          >
            {error || t('library.editor.tools.sfx.unavailable')}
          </p>
        )}
        {effect && (
          <div data-editor-sfx-grid className={gridStyles.grid}>
            <div
              draggable={!busy}
              data-editor-sfx-card={effect.id}
              onDragStart={(event) => {
                if (busy) {
                  event.preventDefault()
                  return
                }
                audioRef.current?.pause()
                event.dataTransfer.effectAllowed = 'copy'
                event.dataTransfer.setData(EDITOR_SOUND_EFFECT_MIME, effect.id)
              }}
              className="group overflow-hidden rounded-xl border border-border bg-background transition-colors hover:border-saffron/60"
            >
              <div className="relative flex h-20 items-center justify-center overflow-hidden bg-gradient-to-br from-sky/15 via-ocean/10 to-lavender/20">
                <AudioLines
                  aria-hidden
                  className="h-9 w-9 text-ocean/50"
                  strokeWidth={1.4}
                />
                <GripVertical
                  aria-hidden
                  className="absolute right-2 top-2 h-3.5 w-3.5 text-muted-foreground/50"
                />
                <button
                  type="button"
                  draggable={false}
                  aria-label={t(
                    playing
                      ? 'library.editor.tools.sfx.pause'
                      : 'library.editor.tools.sfx.preview',
                  )}
                  onClick={() => void togglePreview()}
                  className="absolute flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-card/95 text-foreground shadow-sm transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron"
                >
                  {playing ? (
                    <Pause aria-hidden className="h-3.5 w-3.5" />
                  ) : (
                    <Play aria-hidden className="ml-0.5 h-3.5 w-3.5" />
                  )}
                </button>
              </div>
              <div className="space-y-2 p-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate font-display text-xs font-bold text-foreground">
                    {t('library.editor.tools.sfx.click')}
                  </p>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {t('library.editor.tools.sfx.duration', {
                      seconds: formatSlotSeconds(
                        effect.durationSeconds,
                        i18n.resolvedLanguage ?? 'es',
                      ),
                    })}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={onAdd}
                  className="h-7 w-full gap-1 rounded-lg px-2 font-display text-xs"
                >
                  <Plus aria-hidden className="h-3 w-3" />
                  {t('library.editor.tools.sfx.add')}
                </Button>
              </div>
              <audio
                key={effect.audioDataUri}
                ref={audioRef}
                src={effect.audioDataUri}
                preload="none"
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                onError={() => {
                  setPlaying(false)
                  setPreviewFailed(true)
                }}
              />
            </div>
          </div>
        )}
        {previewFailed && (
          <p role="alert" className="font-body text-xs text-coral-text">
            {t('library.editor.tools.sfx.previewError')}
          </p>
        )}
        {cursorSeconds !== undefined && (
          <p className="font-body text-xs text-muted-foreground">
            {t('library.editor.tools.sfx.insertAt', {
              time: formatTime(cursorSeconds),
            })}
          </p>
        )}
        <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
          <CheckboxRow
            label={t('library.editor.tools.sfx.allTransitions')}
            checked={allTransitionsEnabled}
            disabled={busy || !effect || !transitionsAvailable}
            onChange={onToggleAllTransitions}
          />
          <p className="font-body text-xs leading-relaxed text-muted-foreground">
            {t('library.editor.tools.sfx.allTransitionsHint')}
          </p>
        </div>
      </TabsContent>
    </Tabs>
  )
}
