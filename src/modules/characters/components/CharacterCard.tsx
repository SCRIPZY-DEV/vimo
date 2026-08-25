import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil, Trash2 } from 'lucide-react'
import { CharacterPortrait } from '@/modules/common/components/CharacterPortrait'
import { Button } from '@/modules/common/ui/button'
import { charactersApi } from '@/modules/characters/api'
import type { CharacterSummary } from '@pipeline/types/characters.ts'

interface CharacterCardProps {
  character: CharacterSummary
  disabled: boolean
  onEdit: (character: CharacterSummary) => void
  onDelete: (character: CharacterSummary) => void
}

export function CharacterCard({
  character,
  disabled,
  onEdit,
  onDelete,
}: CharacterCardProps) {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState(false)

  const portrait = character.previews[0]

  return (
    <article
      onMouseLeave={() => setConfirming(false)}
      className="flex flex-col overflow-hidden rounded-2xl border-2 border-border bg-card shadow-card"
    >
      <CharacterPortrait
        src={portrait ? charactersApi.imageSource(portrait.imagePath) : null}
        doodleSize={72}
        className="aspect-square"
      />

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="min-w-0">
          <h3 className="truncate font-display text-base font-bold text-foreground">
            {character.name}
          </h3>
          {(character.age ?? character.role) && (
            <p className="truncate font-body text-xs text-muted-foreground">
              {[character.age, character.role].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <p className="line-clamp-2 font-body text-xs text-muted-foreground">
          {character.description}
        </p>

        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onEdit(character)}
            className="rounded-lg font-display"
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            {t('characters.tarjeta.editar')}
          </Button>

          {confirming ? (
            <Button
              variant="destructive"
              size="sm"
              disabled={disabled}
              onClick={() => onDelete(character)}
              className="rounded-lg font-display"
            >
              {t('characters.tarjeta.confirmar')}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              disabled={disabled}
              onClick={() => setConfirming(true)}
              aria-label={t('characters.tarjeta.eliminar')}
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}
