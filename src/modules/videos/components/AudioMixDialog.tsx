import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Mic, Upload } from 'lucide-react'
import { LabeledProgress } from '@/modules/common/components/LabeledProgress'
import { SliderRow } from '@/modules/common/components/SliderRow'
import { Button } from '@/modules/common/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/modules/common/ui/dialog'
import { VoicePickerModal } from '@/modules/videos/components/VoicePickerModal'
import {
  BGM_OFFSET_MAX_SECONDS,
  VOLUME_SLIDER_MAX,
  VOLUME_SLIDER_STEP,
} from '@/modules/videos/constants'
import type { SelectedVoice } from '@/modules/videos/types/create'
import type {
  AudioMixValue,
  NarrationReplacement,
} from '@/modules/videos/types/library'

interface AudioMixDialogProps {
  open: boolean
  value: AudioMixValue
  hasMusic: boolean
  busy: boolean
  narrationPercent: number | null
  onClose(): void
  // Cada movimiento de slider: la vista lo previsualiza en el player.
  onChange(value: AudioMixValue): void
  onSaveMix(value: AudioMixValue): Promise<boolean>
  onReplaceNarration(payload: NarrationReplacement): Promise<boolean>
  onPickFile(): Promise<string | null>
}

const formatVolume = (volume: number) => volume.toFixed(2)
const formatOffset = (seconds: number) => `${Math.round(seconds)}s`

// Audio del proyecto: mezcla de volúmenes + offset de la música, y reemplazo
// de la narración (subir archivo o re-sintetizar con otra voz).
export function AudioMixDialog({
  open,
  value,
  hasMusic,
  busy,
  narrationPercent,
  onClose,
  onChange,
  onSaveMix,
  onReplaceNarration,
  onPickFile,
}: AudioMixDialogProps) {
  const { t } = useTranslation()
  const [pickingVoice, setPickingVoice] = useState(false)

  const patchMix = (patch: Partial<AudioMixValue>) => {
    onChange({ ...value, ...patch })
  }

  const replaceNarration = async (payload: NarrationReplacement) => {
    const ok = await onReplaceNarration(payload)
    if (ok) onClose()
  }

  const uploadNarration = async () => {
    const path = await onPickFile()
    if (!path) return
    await replaceNarration({ mode: 'upload', audioPath: path })
  }

  const resynthesize = async (voice: SelectedVoice) => {
    setPickingVoice(false)
    await replaceNarration({
      mode: 'resynthesize',
      voice: {
        provider: voice.provider,
        voiceId: voice.voiceId,
        voiceName: voice.name,
      },
    })
  }

  const save = async () => {
    const ok = await onSaveMix(value)
    if (ok) onClose()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">
              {t('library.audio.title')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <SliderRow
              id="audio-mix-voice-volume"
              label={t('library.audio.voiceVolume')}
              min={0}
              max={VOLUME_SLIDER_MAX}
              step={VOLUME_SLIDER_STEP}
              value={value.voiceVolume}
              disabled={busy}
              onChange={(voiceVolume) => patchMix({ voiceVolume })}
              formatValue={formatVolume}
            />

            {hasMusic && (
              <>
                <SliderRow
                  id="audio-mix-music-volume"
                  label={t('library.audio.musicVolume')}
                  min={0}
                  max={VOLUME_SLIDER_MAX}
                  step={VOLUME_SLIDER_STEP}
                  value={value.musicVolume}
                  disabled={busy}
                  onChange={(musicVolume) => patchMix({ musicVolume })}
                  formatValue={formatVolume}
                />
                <SliderRow
                  id="audio-mix-bgm-offset"
                  label={t('library.audio.bgmOffset')}
                  min={0}
                  max={BGM_OFFSET_MAX_SECONDS}
                  step={1}
                  value={value.bgmOffsetSeconds}
                  disabled={busy}
                  onChange={(bgmOffsetSeconds) =>
                    patchMix({ bgmOffsetSeconds })
                  }
                  formatValue={formatOffset}
                />
              </>
            )}

            <div className="space-y-2 rounded-xl border border-border p-3">
              <p className="font-display text-sm font-bold text-foreground">
                {t('library.audio.replaceNarration')}
              </p>
              {narrationPercent !== null ? (
                <LabeledProgress
                  label={t('library.audio.replacing')}
                  percent={narrationPercent}
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void uploadNarration()}
                    className="rounded-lg font-display"
                  >
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    {t('library.audio.uploadFile')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => setPickingVoice(true)}
                    className="rounded-lg font-display"
                  >
                    <Mic className="mr-1.5 h-3.5 w-3.5" />
                    {t('library.audio.resynthesize')}
                  </Button>
                </div>
              )}
              <p className="font-body text-[11px] text-muted-foreground">
                {t('library.audio.replaceHint')}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              disabled={busy}
              onClick={() => void save()}
              className="rounded-xl font-display font-bold"
            >
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {t('library.audio.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {pickingVoice && (
        <VoicePickerModal
          current={null}
          onSelect={(voice) => void resynthesize(voice)}
          onClose={() => setPickingVoice(false)}
        />
      )}
    </>
  )
}
