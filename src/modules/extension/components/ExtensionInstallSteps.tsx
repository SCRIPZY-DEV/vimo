import { useTranslation } from 'react-i18next'

// Los pasos para cargar la extensión en Chrome: los muestra el modal de la
// versión y, ya guardado el ZIP, el desplegable de la sección.
export function ExtensionInstallSteps() {
  const { t } = useTranslation()

  return (
    <ol className="list-decimal space-y-2 pl-5">
      <li>{t('extension.releaseInstallExtract')}</li>
      <li>{t('extension.releaseInstallLoad')}</li>
      <li>{t('extension.releaseInstallUpdate')}</li>
    </ol>
  )
}
