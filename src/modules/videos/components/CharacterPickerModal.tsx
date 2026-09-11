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
import {
  findPortraitPreview,
  findStylePreview,
} from '@/modules/videos/utilities/findStylePreview'
import { toSelectedCharacter } from '@/modules/videos/utilities/toSelectedCharacter'
import type { SelectedCharacter } from '@/modules/videos/types/create'
import type { CharacterSummary } from '@pipeline/types/characters.ts'

interface CharacterPickerModalProps {
  // Id del catálogo o de galería (estilo propio): con qué preview se muestra
  // cada personaje. Sin preview igual se puede elegir: irá sin referencia.
  previewStyleKey: string
  selected: SelectedCharacter[]
  // Cuántos se pueden elegir. Con uno solo, elegir otro lo REEMPLAZA (el
  // personaje predeterminado de un estilo); con varios, lleno es lleno.
  max?: number
  // Con «Mi estilo» en uso: el personaje nuevo se diseña con esa gema.
  styleContext?: CharacterStyleContext
  onConfirm: (characters: SelectedCharacter[]) => void
  onClose: () => void
}

export function CharacterPickerModal({
  previewStyleKey,
  selected,
  max = MAX_PROJECT_CHARACTERS,
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
  const single = max === 1

  const pick = (character: CharacterSummary) => {
    const selected = toSelectedCharacter(character, previewStyleKey)
    if (draft.length < max) {
      setDraft([...draft, selected])
      return
    }
    if (single) setDraft([selected])
  }

  const addCreated = (character: CharacterSummary) => {
    // La biblioteca invalida su propia query; la del picker es otra clave.
    void queryClient.invalidateQueries({ queryKey: videosQueryKeys.characters })
    setCreating(false)
    pick(character)
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
    pick(character)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle className="font-display">
            {single
              ? t('create.characters.pickerTitleSingle')
              : t('create.characters.pickerTitle')}
          </DialogTitle>
          <DialogDescription>
            {single
              ? t('create.characters.pickerDescriptionSingle')
              : t('create.characters.pickerDescription', { max })}
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
            // La carita sale de cualquier ilustración que tenga; el aviso de
            // abajo mira SOLO la de este estilo, que es la que viajaría.
            const preview = findStylePreview(character, previewStyleKey)
            const portrait = findPortraitPreview(character, previewStyleKey)
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
                    portrait ? videosApi.imageSource(portrait.imagePath) : null
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
