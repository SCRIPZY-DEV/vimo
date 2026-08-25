import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserPlus, X } from 'lucide-react'
import { CharacterPortrait } from '@/modules/common/components/CharacterPortrait'
import { Button } from '@/modules/common/ui/button'
import { Label } from '@/modules/common/ui/label'
import { cn } from '@/modules/common/utilities/cn'
import { videosApi } from '@/modules/videos/api'
import { CharacterPickerModal } from '@/modules/videos/components/CharacterPickerModal'
import { LabeledSelect } from '@/modules/videos/components/LabeledSelect'
import {
  CHARACTER_FREQUENCIES,
  MAX_PROJECT_CHARACTERS,
  modelSupportsCharacters,
} from '@/modules/videos/constants'
import type { CreateFormValue } from '@/modules/videos/types/create'

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

  const supported = modelSupportsCharacters(value.imageProvider, value.falModel)
  const blocked = disabled || !supported

  return (
    <div className="space-y-2">
      <Label className="font-display">{t('create.characters.label')}</Label>

      {!supported && (
        <p className="rounded-xl border border-saffron/40 bg-saffron/10 p-3 font-body text-xs text-foreground">
          {t('create.characters.modelUnsupported')}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={blocked}
          onClick={() => setPickerOpen(true)}
          className="rounded-xl font-display"
        >
          <UserPlus className="mr-1.5 h-4 w-4" />
          {value.characters.length > 0
            ? t('create.characters.change')
            : t('create.characters.choose')}
        </Button>
        <span className="font-body text-xs text-muted-foreground">
          {t('create.characters.hint', { max: MAX_PROJECT_CHARACTERS })}
        </span>
      </div>

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
                disabled={blocked}
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
          disabled={blocked}
          onChange={(characterFrequency) => onChange({ characterFrequency })}
          className={cn(blocked && 'opacity-60')}
        />
      )}

      {pickerOpen && (
        <CharacterPickerModal
          styleId={value.styleId}
          selected={value.characters}
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
