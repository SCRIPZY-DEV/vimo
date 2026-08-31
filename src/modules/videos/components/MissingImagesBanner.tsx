import { useTranslation } from 'react-i18next'
import { ImageOff } from 'lucide-react'

interface MissingImagesBannerProps {
  sceneIds: number[]
}

// Aviso al abrir el editor con escenas sin imagen (flujo normal con
// auto-export apagado tras un fallo parcial): el render está bloqueado por
// el gate render_missing_images hasta que todas tengan la suya.
export function MissingImagesBanner({ sceneIds }: MissingImagesBannerProps) {
  const { t } = useTranslation()

  if (sceneIds.length === 0) return null

  return (
    <div className="flex items-start gap-3 rounded-xl border-2 border-saffron/50 bg-saffron/10 px-4 py-3">
      <ImageOff className="mt-0.5 h-5 w-5 shrink-0 text-saffron" />
      <div className="font-body text-sm text-foreground">
        <p className="font-display font-bold">
          {t('library.editor.missingImagesTitle', {
            count: sceneIds.length,
            ids: sceneIds.join(', '),
          })}
        </p>
        <p className="mt-0.5 text-muted-foreground">
          {t('library.editor.missingImagesHint')}
        </p>
      </div>
    </div>
  )
}
