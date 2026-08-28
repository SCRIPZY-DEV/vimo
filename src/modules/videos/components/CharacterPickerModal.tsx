import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { CharacterPortrait } from '@/modules/common/components/CharacterPortrait'
import { Button } from '@/modules/common/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/modules/common/ui/dialog'
import { cn } from '@/modules/common/utilities/cn'
import { videosApi } from '@/modules/videos/api'
import { MAX_PROJECT_CHARACTERS } from '@/modules/videos/constants'
import { useCharacterCatalog } from '@/modules/videos/hooks/useCharacterCatalog'
import { findStylePreview } from '@/modules/videos/utilities/findStylePreview'
import type { SelectedCharacter } from '@/modules/videos/types/create'
import type {
  CharacterStyleId,
  CharacterSummary,
} from '@pipeline/types/characters.ts'

interface CharacterPickerModalProps {
  styleId: CharacterStyleId
  selected: SelectedCharacter[]
  onConfirm: (characters: SelectedCharacter[]) => void
  onClose: () => void
}

export function CharacterPickerModal({
  styleId,
  selected,
  onConfirm,
  onClose,
}: CharacterPickerModalProps) {
  const { t } = useTranslation()
  const { characters, isLoading, errorKey } = useCharacterCatalog(true)
  const [draft, setDraft] = useState<SelectedCharacter[]>(selected)

  const isPicked = (characterId: string) => {
    return draft.some((item) => item.characterId === characterId)
  }

  const toggle = (character: CharacterSummary) => {
    if (isPicked(character.id)) {
      setDraft(draft.filter((item) => item.characterId !== character.id))
      return
    }
    if (draft.length >= MAX_PROJECT_CHARACTERS) return

    const preview = findStylePreview(character, styleId)
    setDraft([
      ...draft,
      {
        characterId: character.id,
        name: character.name,
        description: character.description,
        previewPath: preview?.imagePath ?? null,
      },
    ])
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle className="font-display">
            {t('create.characters.pickerTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('create.characters.pickerDescription', {
              max: MAX_PROJECT_CHARACTERS,
            })}
          </DialogDescription>
        </DialogHeader>

        {errorKey && <ErrorMessage>{t(errorKey)}</ErrorMessage>}

        {isLoading && (
          <p className="py-8 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
          </p>
        )}

        {!isLoading && characters.length === 0 && (
          <p className="py-8 text-center font-body text-sm text-muted-foreground">
            {t('create.characters.empty')}
          </p>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-y-auto pr-1 md:grid-cols-3">
          {characters.map((character) => {
            const isSelected = isPicked(character.id)
            const preview = findStylePreview(character, styleId)
            return (
              <button
                key={character.id}
                type="button"
                onClick={() => toggle(character)}
                className={cn(
                  'flex flex-col overflow-hidden rounded-xl border-2 bg-card text-left transition-colors',
                  isSelected
                    ? 'border-saffron'
                    : 'border-border hover:border-saffron/40',
                )}
              >
                <CharacterPortrait
                  src={
                    preview ? videosApi.imageSource(preview.imagePath) : null
                  }
                  doodleSize={56}
                  className="aspect-square"
                />
                <div className="space-y-0.5 p-2">
                  <p className="truncate font-display text-sm font-bold text-foreground">
                    {character.name}
                  </p>
                  {!preview && (
                    <p className="font-body text-[11px] text-saffron">
                      {t('create.characters.noPreviewForStyle')}
                    </p>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={onClose}
            className="rounded-xl font-display"
          >
            {t('create.form.cancel')}
          </Button>
          <Button
            onClick={() => onConfirm(draft)}
            className="rounded-xl font-display font-bold"
          >
            {t('create.characters.use', { count: draft.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
