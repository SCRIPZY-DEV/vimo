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
  // Al editar, el botón reemplaza la foto guardada por otra.
  editing: boolean
  disabled: boolean
  onChange: (value: CharacterFormValue) => void
  onPickPhoto: () => void
}

// Formulario del personaje CON foto (port del modal de PaginaPersonajes del
// origen): nombre, descripción opcional, el cartel «Importante», el botón de
// subir/reemplazar a lo ancho y, debajo, la foto elegida en grande — la
// miniatura de al lado del botón no dejaba ver qué se subió.
export function CharacterPhotoFields({
  value,
  photoPath,
  editing,
  disabled,
  onChange,
  onPickPhoto,
}: CharacterPhotoFieldsProps) {
  const { t } = useTranslation()

  const preview = photoPath ? charactersApi.imageSource(photoPath) : null
  const buttonKey = editing
    ? 'characters.photo.replace'
    : preview
      ? 'characters.photo.change'
      : 'characters.photo.upload'

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

      <div className="flex items-start gap-2 rounded-lg border-2 border-saffron/50 bg-saffron/15 p-2.5">
        <ImageOff className="mt-0.5 h-4 w-4 shrink-0 text-saffron" />
        <p className="font-body text-xs text-foreground">
          <Trans
            i18nKey="characters.photo.notice"
            components={{
              lead: <span className="font-display font-bold text-saffron" />,
              strong: <b />,
            }}
          />
        </p>
      </div>

      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={onPickPhoto}
        className="w-full rounded-xl font-display font-semibold"
      >
        <Upload className="mr-1.5 h-4 w-4" />
        {t(buttonKey)}
      </Button>

      {/* Cuadrada y recortada como la tarjeta de la biblioteca: la persona ve
          la foto tal como va a verse en Personajes y en el picker, sin aire a
          los costados. */}
      {preview && (
        <div className="mx-auto aspect-square w-64 overflow-hidden rounded-xl border-2 border-saffron/60 bg-muted/40">
          <img src={preview} alt="" className="h-full w-full object-cover" />
        </div>
      )}
    </div>
  )
}
