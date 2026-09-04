import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus } from 'lucide-react'
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
import {
  MAX_PROJECT_CHARACTERS,
  videosQueryKeys,
} from '@/modules/videos/constants'
// Excepción cross-módulo documentada en ADR-0020 (precedente: useRequiredApiKeys
// de api-keys): crear un personaje desde Create reusa el modal de la
// biblioteca con el contexto de «Mi estilo».
import { CharacterModal } from '@/modules/characters/components/CharacterModal'
import type { CharacterStyleContext } from '@/modules/characters/types/characters'
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
  // Con «Mi estilo» en uso: el personaje nuevo se diseña con esa gema.
  styleContext?: CharacterStyleContext
  onConfirm: (characters: SelectedCharacter[]) => void
  onClose: () => void
}

export function CharacterPickerModal({
  styleId,
  selected,
  styleContext,
  onConfirm,
  onClose,
}: CharacterPickerModalProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { characters, isLoading, errorKey } = useCharacterCatalog(true)
  const [draft, setDraft] = useState<SelectedCharacter[]>(selected)
  // Creación inline: un solo modal a la vez (regla del origen), así que el
  // picker se REEMPLAZA por el modal de personaje y vuelve al guardar; el
  // borrador sobrevive porque este componente sigue montado.
  const [creating, setCreating] = useState(false)

  const toSelected = (character: CharacterSummary): SelectedCharacter => {
    const preview = findStylePreview(character, styleId)
    return {
      characterId: character.id,
      name: character.name,
      description: character.description,
      previewPath: preview?.imagePath ?? null,
    }
  }

  const addCreated = (character: CharacterSummary) => {
    // La biblioteca invalida su propia query; la del picker es otra clave.
    void queryClient.invalidateQueries({ queryKey: videosQueryKeys.characters })
    setCreating(false)
    if (draft.length >= MAX_PROJECT_CHARACTERS) return
    setDraft([...draft, toSelected(character)])
  }

  if (creating)
    return (
      <CharacterModal
        character={null}
        styleContext={styleContext}
        onSaved={addCreated}
        onClose={() => setCreating(false)}
      />
    )

  const isPicked = (characterId: string) => {
    return draft.some((item) => item.characterId === characterId)
  }

  const toggle = (character: CharacterSummary) => {
    if (isPicked(character.id)) {
      setDraft(draft.filter((item) => item.characterId !== character.id))
      return
    }
    if (draft.length >= MAX_PROJECT_CHARACTERS) return

    setDraft([...draft, toSelected(character)])
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
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-card text-muted-foreground transition-colors hover:border-saffron/60 hover:text-foreground"
          >
            <Plus className="h-6 w-6" />
            <span className="px-2 text-center font-display text-sm font-bold">
              {styleContext
                ? t('create.characters.createWithStyle')
                : t('create.characters.createNew')}
            </span>
          </button>
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
