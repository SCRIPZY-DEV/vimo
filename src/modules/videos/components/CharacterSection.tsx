import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserRound, X } from 'lucide-react'
import { CharacterPortrait } from '@/modules/common/components/CharacterPortrait'
import { Label } from '@/modules/common/ui/label'
import { cn } from '@/modules/common/utilities/cn'
import { videosApi } from '@/modules/videos/api'
import { CharacterPickerModal } from '@/modules/videos/components/CharacterPickerModal'
import { LabeledSelect } from '@/modules/videos/components/LabeledSelect'
import { CHARACTER_FREQUENCIES } from '@/modules/videos/constants'
import { useCharacterCatalog } from '@/modules/videos/hooks/useCharacterCatalog'
import { findStylePreview } from '@/modules/videos/utilities/findStylePreview'
import { styleCharacterModeOf } from '@/modules/videos/utilities/formPayload'
import type {
  CreateFormValue,
  SelectedCharacter,
} from '@/modules/videos/types/create'

interface CharacterSectionProps {
  value: CreateFormValue
  disabled: boolean
  onChange: (patch: Partial<CreateFormValue>) => void
}

export function CharacterSection({
  value,
  disabled,
  onChange,
}: CharacterSectionProps) {
  const { t } = useTranslation()
  const [pickerOpen, setPickerOpen] = useState(false)

  // Qué decidió la gema en uso (ADR-0020): con genérico/sin personaje el
  // motor lo escribe (o no lleva) y la sección desaparece; con «Mi
  // personaje» la sección es obligatoria y, si el estilo trae uno fijo, ese
  // personaje va sembrado y no se cambia.
  const styleCharacterMode = styleCharacterModeOf(value)
  const fixedCharacterId =
    styleCharacterMode === 'own'
      ? value.customStyle?.character?.defaultCharacterId
      : undefined
  const { characters: catalog, isLoading: catalogLoading } =
    useCharacterCatalog(Boolean(fixedCharacterId))
  const fixedCharacter = fixedCharacterId
    ? catalog.find((character) => character.id === fixedCharacterId)
    : undefined
  const fixedMissing =
    Boolean(fixedCharacterId) && !catalogLoading && !fixedCharacter
  const fixedSeeded = value.characters.some(
    (character) => character.characterId === fixedCharacterId,
  )

  const seedFixedCharacter = () => {
    if (!fixedCharacter) return
    const preview = findStylePreview(fixedCharacter, value.styleId)
    const seeded: SelectedCharacter = {
      characterId: fixedCharacter.id,
      name: fixedCharacter.name,
      description: fixedCharacter.description,
      previewPath: preview?.imagePath ?? null,
    }
    onChange({ characters: [seeded] })
  }

  if (styleCharacterMode === 'generic' || styleCharacterMode === 'none')
    return null

  const firstCharacter = value.characters[0] ?? null
  const subtitle =
    value.characters.length > 1
      ? t('create.characters.selectedCount', { count: value.characters.length })
      : (firstCharacter?.description ?? '') || t('create.characters.hint')

  if (fixedCharacterId) {
    return (
      <div className="space-y-2">
        <Label className="flex items-center gap-2 font-display font-semibold">
          <UserRound className="h-4 w-4 text-saffron" />
          {t('create.characters.label')}
        </Label>
        {fixedMissing && (
          <p className="font-body text-xs text-coral">
            {t('create.characters.fixedMissing')}
          </p>
        )}
        {fixedCharacter && !fixedSeeded && (
          <button
            type="button"
            disabled={disabled}
            onClick={seedFixedCharacter}
            className="w-full rounded-xl border-2 border-dashed border-saffron/60 bg-card px-4 py-3 text-left font-display text-sm font-bold text-foreground transition-all hover:border-saffron"
          >
            {t('create.characters.useFixed', { name: fixedCharacter.name })}
          </button>
        )}
        {fixedCharacter && fixedSeeded && (
          <div className="flex items-center gap-3 rounded-xl border-2 border-saffron bg-saffron/5 px-4 py-3">
            <CharacterPortrait
              src={
                firstCharacter?.previewPath
                  ? videosApi.imageSource(firstCharacter.previewPath)
                  : null
              }
              doodleSize={20}
              className="h-10 w-10 shrink-0 overflow-hidden rounded-full"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-bold text-foreground">
                {fixedCharacter.name}
              </p>
              <p className="truncate font-body text-xs text-muted-foreground">
                {t('create.characters.broughtByStyle')}
              </p>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2 font-display font-semibold">
        <UserRound className="h-4 w-4 text-saffron" />
        {t('create.characters.label')}
      </Label>
      {styleCharacterMode === 'own' && (
        <p className="font-body text-xs text-saffron">
          {t('create.characters.asksForCharacter')}
        </p>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={() => setPickerOpen(true)}
        className={cn(
          'w-full rounded-xl border-2 px-4 py-3 text-left transition-all',
          firstCharacter
            ? 'border-saffron bg-saffron/5'
            : 'border-dashed border-border bg-card hover:border-saffron/40',
        )}
      >
        {firstCharacter ? (
          <div className="flex items-center gap-3">
            <CharacterPortrait
              src={
                firstCharacter.previewPath
                  ? videosApi.imageSource(firstCharacter.previewPath)
                  : null
              }
              doodleSize={20}
              className="h-10 w-10 shrink-0 overflow-hidden rounded-full"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-bold text-foreground">
                {value.characters
                  .map((character) => character.name)
                  .join(' + ')}
              </p>
              <p className="truncate font-body text-xs text-muted-foreground">
                {subtitle}
              </p>
            </div>
            <span className="rounded bg-saffron px-2 py-1 font-display text-[10px] font-bold text-charcoal">
              {t('create.characters.change')}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <UserRound className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="font-display text-sm font-bold text-foreground">
                {t('create.characters.choose')}
              </p>
              <p className="font-body text-xs text-muted-foreground">
                {t('create.characters.hint')}
              </p>
            </div>
          </div>
        )}
      </button>

      {value.characters.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.characters.map((character) => (
            <li
              key={character.characterId}
              className="flex items-center gap-2 rounded-xl border border-border bg-card p-2"
            >
              <CharacterPortrait
                src={
                  character.previewPath
                    ? videosApi.imageSource(character.previewPath)
                    : null
                }
                doodleSize={20}
                className="h-8 w-8 shrink-0 overflow-hidden rounded-lg"
              />
              <span className="font-display text-sm font-bold text-foreground">
                {character.name}
              </span>
              <button
                type="button"
                disabled={disabled}
                aria-label={t('create.characters.remove')}
                onClick={() =>
                  onChange({
                    characters: value.characters.filter(
                      (item) => item.characterId !== character.characterId,
                    ),
                  })
                }
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {value.characters.length > 0 && (
        <LabeledSelect
          label={t('create.characters.frequency.label')}
          value={value.characterFrequency}
          options={CHARACTER_FREQUENCIES.map((frequency) => ({
            id: frequency.id,
            label: t(frequency.labelKey),
          }))}
          disabled={disabled}
          onChange={(characterFrequency) => onChange({ characterFrequency })}
          className={cn(disabled && 'opacity-60')}
        />
      )}

      {pickerOpen && (
        <CharacterPickerModal
          styleId={value.styleId}
          selected={value.characters}
          styleContext={
            styleCharacterMode !== null && value.customStyle
              ? {
                  gem: value.customStyle.systemPrompt,
                  script: value.script,
                  ...(value.promptModel
                    ? { promptModel: value.promptModel }
                    : {}),
                }
              : undefined
          }
          onConfirm={(characters) => {
            onChange({ characters })
            setPickerOpen(false)
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
