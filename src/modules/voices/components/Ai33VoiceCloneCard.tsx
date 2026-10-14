import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, FileAudio, Loader2 } from 'lucide-react'
import { CheckboxRow } from '@/modules/common/components/CheckboxRow'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { Button } from '@/modules/common/ui/button'
import { Input } from '@/modules/common/ui/input'
import { Label } from '@/modules/common/ui/label'
import { voicesApi } from '@/modules/voices/api'
import { VOICE_CLONE_NAME_LIMIT } from '@/modules/voices/constants'
import { useCloneVoice } from '@/modules/voices/hooks/useCloneVoice'
import { fileNameOf } from '@/modules/voices/utilities/fileNameOf'

interface Ai33VoiceCloneCardProps {
  onCloned: () => void
}

// Clonación de voces con ai33 desde Vimo: nombre + muestra de audio elegida
// con el diálogo nativo. El sidecar valida formato, tamaño y duración antes
// de enviarla; la voz nueva aparece en «Mis clonadas».
export function Ai33VoiceCloneCard({ onCloned }: Ai33VoiceCloneCardProps) {
  const { t } = useTranslation()
  const { cloneVoice, cloning, errorKey, reset } = useCloneVoice()
  const [name, setName] = useState('')
  const [samplePath, setSamplePath] = useState<string | null>(null)
  const [removeBackground, setRemoveBackground] = useState(false)
  const [clonedName, setClonedName] = useState<string | null>(null)

  if (!voicesApi.isNative()) return null

  const canClone = name.trim().length > 0 && samplePath !== null && !cloning

  const pickSample = async () => {
    const path = await voicesApi.pickCloneSample()
    if (!path) return

    setSamplePath(path)
    setClonedName(null)
    reset()
  }

  const submit = async () => {
    if (!samplePath) return

    setClonedName(null)
    const { voice } = await cloneVoice({
      name: name.trim(),
      audioPath: samplePath,
      removeBackground,
    })
    setClonedName(voice.name)
    setName('')
    setSamplePath(null)
    onCloned()
  }

  return (
    <section className="space-y-4 rounded-2xl border-2 border-border bg-card p-6 shadow-card">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-saffron/20">
          <Copy className="h-5 w-5 text-saffron" />
        </div>
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">
            {t('voices.clonacion.titulo')}
          </h2>
          <p className="font-body text-sm text-muted-foreground">
            {t('voices.clonacion.ai33.descripcion')}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="voice-clone-name" className="font-display">
            {t('voices.clonacion.ai33.nombre')}
          </Label>
          <Input
            id="voice-clone-name"
            value={name}
            maxLength={VOICE_CLONE_NAME_LIMIT}
            disabled={cloning}
            placeholder={t('voices.clonacion.ai33.nombrePlaceholder')}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <p className="font-display text-sm font-medium text-foreground">
            {t('voices.clonacion.ai33.muestra')}
          </p>
          <Button
            variant="outline"
            disabled={cloning}
            onClick={() => void pickSample()}
            className="w-full justify-start rounded-xl font-body"
          >
            <FileAudio className="mr-2 h-4 w-4 shrink-0" />
            <span className="truncate">
              {samplePath
                ? fileNameOf(samplePath)
                : t('voices.clonacion.ai33.elegirMuestra')}
            </span>
          </Button>
          <p className="font-body text-xs text-muted-foreground">
            {t('voices.clonacion.ai33.muestraAyuda')}
          </p>
        </div>
      </div>

      <CheckboxRow
        label={t('voices.clonacion.ai33.quitarFondo')}
        checked={removeBackground}
        disabled={cloning}
        onChange={setRemoveBackground}
      />

      {errorKey && <ErrorMessage>{t(errorKey)}</ErrorMessage>}

      {clonedName && (
        <p className="font-body text-sm text-foreground">
          {t('voices.clonacion.ai33.exito', { name: clonedName })}
        </p>
      )}

      <Button
        disabled={!canClone}
        onClick={() => void submit().catch(() => undefined)}
        className="rounded-xl font-display"
      >
        {cloning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {cloning
          ? t('voices.clonacion.ai33.clonando')
          : t('voices.clonacion.ai33.clonar')}
      </Button>
    </section>
  )
}
