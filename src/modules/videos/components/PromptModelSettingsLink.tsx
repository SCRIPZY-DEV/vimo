import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { PROMPT_MODEL_SETTINGS_PATH } from '@/modules/settings/constants'

// En Crear se cambia el modelo de ESTE video; el por defecto vive en Ajustes,
// y este link entra directo a esa sección.
export function PromptModelSettingsLink() {
  const { t } = useTranslation()

  return (
    <Link
      to={PROMPT_MODEL_SETTINGS_PATH}
      className="inline-block font-body text-xs font-semibold text-muted-foreground underline underline-offset-4 hover:text-saffron"
    >
      {t('create.promptModel.settingsLink')}
    </Link>
  )
}
