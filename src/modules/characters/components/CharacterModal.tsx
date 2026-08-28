import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
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
import { useRequiredApiKeys } from '@/modules/api-keys/hooks/useRequiredApiKeys'
import { CharacterPreviewPanel } from '@/modules/characters/components/CharacterPreviewPanel'
import { CharacterProfileFields } from '@/modules/characters/components/CharacterProfileFields'
import {
  CHARACTER_FORM_INITIAL_VALUE,
  DEFAULT_PREVIEW_PROVIDER,
  MIN_DESCRIPTION_LENGTH,
  PREVIEW_STYLES,
} from '@/modules/characters/constants'
import { useCharacterMutations } from '@/modules/characters/hooks/useCharacterMutations'
import { useCharacterPreview } from '@/modules/characters/hooks/useCharacterPreview'
import { useSuggestCharacterProfile } from '@/modules/characters/hooks/useSuggestCharacterProfile'
import {
  toFormValue,
  toPreviewViews,
} from '@/modules/characters/utilities/characterDraft'
import type {
  CharacterStyleId,
  CharacterSummary,
} from '@pipeline/types/characters.ts'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'
import type { PreviewView } from '@/modules/characters/types/characters'

interface CharacterModalProps {
  character: CharacterSummary | null
  onClose: () => void
}

export function CharacterModal({ character, onClose }: CharacterModalProps) {
  const { t } = useTranslation()
  const { createCharacter, updateCharacter, saving } = useCharacterMutations()
  const { suggestProfile, suggesting } = useSuggestCharacterProfile()
  const preview = useCharacterPreview()

  const [form, setForm] = useState(() =>
    character ? toFormValue(character) : CHARACTER_FORM_INITIAL_VALUE,
  )
  const [previews, setPreviews] = useState<PreviewView[]>(() =>
    character ? toPreviewViews(character) : [],
  )
  const [styleId, setStyleId] = useState<CharacterStyleId>(PREVIEW_STYLES[0].id)
  const [provider, setProvider] = useState<ImageProviderId>(
    DEFAULT_PREVIEW_PROVIDER,
  )
  const [formErrorKey, setFormErrorKey] = useState<string | null>(null)

  const llmKeys = useRequiredApiKeys({ requirements: [['deepinfra']] })
  const providerKeys = useRequiredApiKeys({ requirements: [[provider]] })

  const identity = form.description.trim()
  const identityReady = identity.length >= MIN_DESCRIPTION_LENGTH
  const busy = saving || suggesting || preview.generating

  const suggest = async () => {
    const result = await suggestProfile({
      name: form.name,
      age: form.age,
      role: form.role,
      description: form.description,
    }).catch(() => null)
    if (!result) return

    // Los campos que el usuario ya completó mandan; el resto se autocompleta.
    setForm((current) => ({
      name: current.name.trim() || (result.name ?? ''),
      age: current.age.trim() || (result.age ?? ''),
      role: current.role.trim() || (result.role ?? ''),
      description: result.prompt,
    }))
  }

  const generatePreview = async () => {
    const dataUri = await preview.generate({
      identityPrompt: identity,
      styleId,
      provider,
    })
    if (!dataUri) return

    setPreviews((current) => [
      ...current.filter((item) => item.styleId !== styleId),
      { styleId, url: dataUri, isNew: true },
    ])
  }

  const save = async () => {
    if (!form.name.trim()) {
      setFormErrorKey('characters.errors.nameRequired')
      return
    }
    if (!identityReady) {
      setFormErrorKey('characters.errors.descriptionTooShort')
      return
    }
    setFormErrorKey(null)

    const newPreviews = previews
      .filter((item) => item.isNew)
      .map((item) => ({ styleId: item.styleId, dataUri: item.url }))

    const saved = character
      ? await updateCharacter({
          id: character.id,
          name: form.name,
          description: identity,
          age: form.age,
          role: form.role,
          previews: newPreviews,
        }).catch(() => null)
      : await createCharacter({
          name: form.name,
          description: identity,
          age: form.age,
          role: form.role,
          previews: newPreviews,
        }).catch(() => null)

    if (saved) onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            {character
              ? t('characters.modal.editar')
              : t('characters.modal.nuevo')}
          </DialogTitle>
          <DialogDescription>
            {t('characters.modal.descripcion')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <CharacterProfileFields
            value={form}
            disabled={busy}
            suggesting={suggesting}
            missingLlmKey={llmKeys.missingRequirements.length > 0}
            onChange={setForm}
            onSuggest={() => void suggest()}
          />

          <CharacterPreviewPanel
            previews={previews}
            styleId={styleId}
            provider={provider}
            generating={preview.generating}
            errorKey={preview.errorKey}
            disabled={saving || suggesting}
            missingProviderKey={providerKeys.missingRequirements.length > 0}
            canGenerate={identityReady}
            onStyleChange={setStyleId}
            onProviderChange={setProvider}
            onGenerate={() => void generatePreview()}
            onCancel={preview.cancel}
          />

          {formErrorKey && <ErrorMessage>{t(formErrorKey)}</ErrorMessage>}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            disabled={saving}
            onClick={onClose}
            className="rounded-xl font-display"
          >
            {t('characters.modal.cancelar')}
          </Button>
          <Button
            disabled={busy}
            onClick={() => void save()}
            className="rounded-xl font-display font-bold"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('characters.modal.guardar')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
