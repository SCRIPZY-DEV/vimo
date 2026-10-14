import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { Input } from '@/modules/common/ui/input'
import { Label } from '@/modules/common/ui/label'
import { Textarea } from '@/modules/common/ui/textarea'
import { apiKeysFocusPath } from '@/modules/api-keys/constants'
import {
  AGE_LIMIT,
  DESCRIPTION_LIMIT,
  NAME_LIMIT,
  ROLE_LIMIT,
} from '@/modules/characters/constants'
import type { CharacterFormValue } from '@/modules/characters/types/characters'

interface CharacterProfileFieldsProps {
  value: CharacterFormValue
  disabled: boolean
  suggesting: boolean
  missingLlmKey: boolean
  // Con guion a mano (Create + Mi estilo) la IA infiere del guion y no exige
  // los cuatro campos; sin guion, sí (v0.43.4 del origen).
  suggestFromScript?: boolean
  suggestLabelKey?: string
  onChange: (value: CharacterFormValue) => void
  onSuggest: () => void
}

export function CharacterProfileFields({
  value,
  disabled,
  suggesting,
  missingLlmKey,
  suggestFromScript = false,
  suggestLabelKey = 'characters.experto.boton',
  onChange,
  onSuggest,
}: CharacterProfileFieldsProps) {
  const { t } = useTranslation()

  const complete =
    suggestFromScript ||
    (Boolean(value.name.trim()) &&
      Boolean(value.age.trim()) &&
      Boolean(value.role.trim()) &&
      Boolean(value.description.trim()))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-3">
          <Label htmlFor="character-name" className="font-display">
            {t('characters.form.nombre')}
          </Label>
          <Input
            id="character-name"
            value={value.name}
            maxLength={NAME_LIMIT}
            disabled={disabled}
            placeholder={t('characters.form.nombrePlaceholder')}
            onChange={(event) =>
              onChange({ ...value, name: event.target.value })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="character-age" className="font-display">
            {t('characters.form.edad')}
          </Label>
          <Input
            id="character-age"
            value={value.age}
            maxLength={AGE_LIMIT}
            disabled={disabled}
            placeholder={t('characters.form.edadPlaceholder')}
            onChange={(event) =>
              onChange({ ...value, age: event.target.value })
            }
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="character-role" className="font-display">
            {t('characters.form.rol')}
          </Label>
          <Input
            id="character-role"
            value={value.role}
            maxLength={ROLE_LIMIT}
            disabled={disabled}
            placeholder={t('characters.form.rolPlaceholder')}
            onChange={(event) =>
              onChange({ ...value, role: event.target.value })
            }
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="character-description" className="font-display">
          {t('characters.form.descripcion')}
        </Label>
        <Textarea
          id="character-description"
          value={value.description}
          maxLength={DESCRIPTION_LIMIT}
          disabled={disabled}
          rows={5}
          placeholder={t('characters.form.descripcionPlaceholder')}
          onChange={(event) =>
            onChange({ ...value, description: event.target.value })
          }
        />
        <p className="font-body text-xs text-muted-foreground">
          {t('characters.form.descripcionHint')}
        </p>
      </div>

      <div className="space-y-1.5">
        <Button
          type="button"
          variant="outline"
          disabled={disabled || suggesting || !complete || missingLlmKey}
          onClick={onSuggest}
          className="rounded-xl font-display"
        >
          {suggesting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          {suggesting ? t('characters.experto.generando') : t(suggestLabelKey)}
        </Button>
        {missingLlmKey ? (
          <p className="font-body text-xs text-coral-text">
            {t('characters.experto.faltaClave')}{' '}
            <Link to={apiKeysFocusPath(['deepinfra'])} className="underline">
              {t('characters.irAClaves')}
            </Link>
          </p>
        ) : (
          <p className="font-body text-xs text-muted-foreground">
            {complete
              ? t('characters.experto.ayuda')
              : t('characters.experto.completaCampos')}
          </p>
        )}
      </div>
    </div>
  )
}
