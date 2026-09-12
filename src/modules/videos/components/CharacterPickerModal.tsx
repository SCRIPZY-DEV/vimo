import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus } from 'lucide-react'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { CharacterPortrait } from '@/modules/common/components/CharacterPortrait'
import { SegmentedTabs } from '@/modules/common/components/SegmentedTabs'
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
  CHARACTER_PICKER_FILTERS,
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
  characterPortraitPath,
  hasStyleReference,
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

type IdentityFilter = SelectedCharacter['mode']

function identityFilterOf(character: CharacterSummary): IdentityFilter {
  return character.photoPath ? 'photo' : 'text'
}

// Selector de personajes de Crear: pestañas «con foto» / «sin foto» y una
// grilla de tarjetas iguales (retrato cuadrado + dos renglones de alto fijo)
// que crece por filas parejas y scrollea adentro del modal — la tarjeta de
// crear mide lo mismo que las demás para que la grilla no se descuadre.
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
  // Pestaña elegida por la persona; hasta que elige, la que tenga personajes.
  const [chosenFilter, setChosenFilter] = useState<IdentityFilter | null>(null)
  const single = max === 1

  const filter =
    chosenFilter ??
    (characters.some((character) => identityFilterOf(character) === 'photo')
      ? 'photo'
      : 'text')
  const visible = characters.filter(
    (character) => identityFilterOf(character) === filter,
  )

  const pick = (character: CharacterSummary) => {
    const picked = toSelectedCharacter(character, previewStyleKey)
    if (draft.length < max) {
      setDraft([...draft, picked])
      return
    }
    if (single) setDraft([picked])
  }

  const addCreated = (character: CharacterSummary) => {
    // La biblioteca invalida su propia query; la del picker es otra clave.
    void queryClient.invalidateQueries({ queryKey: videosQueryKeys.characters })
    setCreating(false)
    // El recién creado se ve en su pestaña, ya elegido.
    setChosenFilter(identityFilterOf(character))
    pick(character)
  }

  if (creating)
    return (
      <CharacterModal
        character={null}
        styleContext={styleContext}
        initialSource={filter}
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

  // Segundo renglón de la tarjeta: qué viajaría con este personaje. Con
  // foto, la foto; sin foto y sin preview de este estilo, el aviso; con
  // preview, su descripción.
  const subtitleOf = (character: CharacterSummary) => {
    if (character.photoPath)
      return { text: t('create.characters.withPhoto'), warning: false }
    if (!hasStyleReference(character, previewStyleKey))
      return { text: t('create.characters.noPreviewForStyle'), warning: true }
    return { text: character.description, warning: false }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] w-[calc(100vw-3rem)] max-w-4xl flex-col">
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

        <SegmentedTabs
          value={filter}
          ariaLabel={t('create.characters.filter.ariaLabel')}
          options={CHARACTER_PICKER_FILTERS.map(({ id, labelKey }) => ({
            id,
            label: t(labelKey),
          }))}
          onChange={setChosenFilter}
        />

        {errorKey && <ErrorMessage>{t(errorKey)}</ErrorMessage>}

        {isLoading && (
          <p className="py-8 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
          </p>
        )}

        <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex h-full min-h-48 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-card text-muted-foreground transition-colors hover:border-saffron/60 hover:text-foreground"
          >
            <Plus className="h-6 w-6" />
            <span className="px-2 text-center font-display text-sm font-bold">
              {styleContext
                ? t('create.characters.createWithStyle')
                : t('create.characters.createNew')}
            </span>
          </button>
          {visible.map((character) => {
            const isSelected = isPicked(character.id)
            const portrait = characterPortraitPath(character, previewStyleKey)
            const subtitle = subtitleOf(character)
            return (
              <button
                key={character.id}
                type="button"
                onClick={() => toggle(character)}
                className={cn(
                  'flex h-full flex-col overflow-hidden rounded-xl border-2 bg-card text-left transition-colors',
                  isSelected
                    ? 'border-saffron'
                    : 'border-border hover:border-saffron/40',
                )}
              >
                <CharacterPortrait
                  src={portrait ? videosApi.imageSource(portrait) : null}
                  doodleSize={56}
                  className="aspect-square w-full shrink-0"
                />
                <div className="space-y-0.5 p-2">
                  <p className="truncate font-display text-sm font-bold text-foreground">
                    {character.name}
                  </p>
                  <p
                    className={cn(
                      'line-clamp-2 h-8 font-body text-[11px] leading-4',
                      subtitle.warning
                        ? 'text-saffron'
                        : 'text-muted-foreground',
                    )}
                  >
                    {subtitle.text}
                  </p>
                </div>
              </button>
            )
          })}
        </div>

        {!isLoading && visible.length === 0 && (
          <p className="text-center font-body text-sm text-muted-foreground">
            {t(
              characters.length === 0
                ? 'create.characters.empty'
                : filter === 'photo'
                  ? 'create.characters.filter.emptyPhoto'
                  : 'create.characters.filter.emptyText',
            )}
          </p>
        )}

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
