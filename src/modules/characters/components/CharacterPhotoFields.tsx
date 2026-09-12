import { Trans, useTranslation } from 'react-i18next'
import { ImageOff, Upload } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { Input } from '@/modules/common/ui/input'
import { Textarea } from '@/modules/common/ui/textarea'
import { charactersApi } from '@/modules/characters/api'
import { DESCRIPTION_LIMIT, NAME_LIMIT } from '@/modules/characters/constants'
import type { CharacterFormValue } from '@/modules/characters/types/characters'

interface CharacterPhotoFieldsProps {
  value: CharacterFormValue
  // La foto elegida (ruta local) o la ya guardada; null hasta que se elige.
  photoPath: string | null
  // Al editar, la foto no se cambia (criterio del origen): se muestra la
  // actual con la nota, sin botón de subir.
  editing: boolean
  disabled: boolean
  onChange: (value: CharacterFormValue) => void
  onPickPhoto: () => void
}

// Formulario del personaje CON foto (port del modal de PaginaPersonajes del
// origen): nombre, descripción opcional, el cartel «Importante» y el botón de
// subir con la miniatura al lado. Solo placeholders, como allá.
export function CharacterPhotoFields({
  value,
  photoPath,
  editing,
  disabled,
  onChange,
  onPickPhoto,
}: CharacterPhotoFieldsProps) {
  const { t } = useTranslation()

  const thumbnail = photoPath ? charactersApi.imageSource(photoPath) : null

  return (
    <div className="space-y-3">
      <Input
        id="character-photo-name"
        value={value.name}
        maxLength={NAME_LIMIT}
        disabled={disabled}
        aria-label={t('characters.form.nombre')}
        placeholder={t('characters.photo.namePlaceholder')}
        onChange={(event) => onChange({ ...value, name: event.target.value })}
      />
      <Textarea
        id="character-photo-description"
        value={value.description}
        maxLength={DESCRIPTION_LIMIT}
        disabled={disabled}
        rows={3}
        aria-label={t('characters.form.descripcion')}
        placeholder={t('characters.photo.descriptionPlaceholder')}
        className="resize-none"
        onChange={(event) =>
          onChange({ ...value, description: event.target.value })
        }
      />

      {editing ? (
        <div className="flex items-center gap-3">
          {thumbnail && (
            <img
              src={thumbnail}
              alt=""
              className="h-14 w-14 shrink-0 rounded-lg border border-border object-cover"
            />
          )}
          <p className="font-body text-[11px] text-muted-foreground">
            {t('characters.photo.editNote')}
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-2 rounded-lg border-2 border-saffron/50 bg-saffron/15 p-2.5">
            <ImageOff className="mt-0.5 h-4 w-4 shrink-0 text-saffron" />
            <p className="font-body text-xs text-foreground">
              <Trans
                i18nKey="characters.photo.notice"
                components={{
                  lead: (
                    <span className="font-display font-bold text-saffron" />
                  ),
                  strong: <b />,
                }}
              />
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={onPickPhoto}
              className="flex-1 rounded-xl font-display font-semibold"
            >
              <Upload className="mr-1.5 h-4 w-4" />
              {thumbnail
                ? t('characters.photo.change')
                : t('characters.photo.upload')}
            </Button>
            {thumbnail && (
              <img
                src={thumbnail}
                alt=""
                className="h-14 w-14 shrink-0 rounded-lg border border-saffron object-cover"
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
