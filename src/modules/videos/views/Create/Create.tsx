import { useTranslation } from 'react-i18next'

import DoodleScript from '@/modules/common/doodles/DoodleScript'
import { usePageTitle } from '@/modules/common/hooks/usePageTitle'

/**
 * Pantalla principal tras autenticarse (equivale a /crear del origen).
 * MAQUETA: el editor de guion se migra en la fase del módulo videos.
 */
export function Create() {
  const { t } = useTranslation()

  usePageTitle(t('create.pageTitle'))

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-8 py-12">
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-extrabold text-foreground">
          {t('create.titulo')}
        </h1>
        <p className="font-body text-muted-foreground">
          {t('create.descripcion')}
        </p>
      </div>
      <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-border bg-card py-16">
        <DoodleScript size={90} />
      </div>
    </div>
  )
}
