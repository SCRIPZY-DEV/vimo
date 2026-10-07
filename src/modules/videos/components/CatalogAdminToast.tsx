import { Trans, useTranslation } from 'react-i18next'
import { AlertTriangle, Check, Loader2 } from 'lucide-react'
import { CATALOG_ORIGIN_BADGE_CLASS } from '@/modules/videos/constants'
import type { CatalogAdminNotice } from '@/modules/videos/types/catalogRemote'

// El aviso de una acción del admin sobre el catálogo (ADR-0049), como cuerpo
// de un toast de la app: en curso (girando), hecha (tilde) o fallida (alerta
// con el porqué). Flota abajo como cualquier otro aviso, se descarta
// deslizando y no depende de dónde esté el scroll de la galería (pedido del
// dueño, 2026-10-06: con 38 tarjetas, un aviso al pie de la grilla no se ve).
export function CatalogAdminToast({
  action,
  name,
  status,
  errorKey,
  errorDetail,
}: CatalogAdminNotice) {
  const { t } = useTranslation()

  if (status === 'failed') {
    return (
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 space-y-1">
          <p className="font-display text-sm font-bold">
            {t(`create.catalogAdmin.failed.${action}`, { name })}
          </p>
          {errorKey && (
            <p className="font-body text-sm opacity-90">
              {t(errorKey, { detail: errorDetail })}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {status === 'working' ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-saffron" />
      ) : (
        <Check className="h-4 w-4 shrink-0 text-emerald-500" />
      )}
      <span className="min-w-0 font-body text-sm">
        <Trans
          i18nKey={`create.catalogAdmin.${status}.${action}`}
          values={{ name }}
          components={{
            badge: <span className={CATALOG_ORIGIN_BADGE_CLASS} />,
          }}
        />
      </span>
    </div>
  )
}
