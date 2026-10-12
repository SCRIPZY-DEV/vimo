import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, ListChecks, X } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import {
  AVATAR_MOTION_GUIDE_ALLOWED_KEYS,
  AVATAR_MOTION_GUIDE_FORBIDDEN_KEYS,
} from '@/modules/videos/constants'

// La guía «Qué podés pedir» de la sección «Movimiento» del editor (entrega 2e,
// §21.1 y §21.4): lo que el motor controla y lo que no, como la guía del
// proveedor, que es también la regla con la que Vimo escribe el movimiento
// automático (§21.2). Un desplegable hecho a mano (no hay Collapsible de
// Radix): un botón con `aria-expanded` y `aria-controls` y un bloque oculto,
// sin `role="region"` (la región del panel es la del avance del avatar), con
// el ícono de sí en lo que se controla y el de no en lo que no.
// Presentacional.
export function EditorAvatarMotionGuide() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const contentId = useId()
  const allowedTitleId = useId()
  const forbiddenTitleId = useId()

  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-1.5 rounded-full border-2 border-amethyst/40 bg-card px-3 py-1 font-display text-xs font-bold text-foreground shadow-sm transition-colors hover:border-amethyst hover:bg-amethyst/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amethyst focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <ListChecks aria-hidden className="h-3.5 w-3.5 text-amethyst" />
        {t('library.editor.avatar.guiaBoton')}
        <ChevronDown
          aria-hidden
          className={cn(
            'h-3.5 w-3.5 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      {/* El bloque existe siempre (`aria-controls` lo nombra). Sin clases de
          `display` acá: le ganarían a `hidden`. */}
      <div id={contentId} hidden={!open}>
        <div className="space-y-3 rounded-xl border border-border bg-background p-3">
          <div className="space-y-1.5">
            <p
              id={allowedTitleId}
              className="font-display text-xs font-bold text-foreground"
            >
              {t('library.editor.avatar.guiaPuedeTitulo')}
            </p>
            <ul aria-labelledby={allowedTitleId} className="space-y-1.5">
              {AVATAR_MOTION_GUIDE_ALLOWED_KEYS.map((key) => (
                <li
                  key={key}
                  className="flex items-start gap-2 font-body text-xs leading-snug text-foreground"
                >
                  <span
                    aria-hidden
                    className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-mint text-white"
                  >
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                  {t(key)}
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-1.5">
            <p
              id={forbiddenTitleId}
              className="font-display text-xs font-bold text-foreground"
            >
              {t('library.editor.avatar.guiaNoPuedeTitulo')}
            </p>
            <ul aria-labelledby={forbiddenTitleId} className="space-y-1.5">
              {AVATAR_MOTION_GUIDE_FORBIDDEN_KEYS.map((key) => (
                <li
                  key={key}
                  className="flex items-start gap-2 font-body text-xs leading-snug text-foreground"
                >
                  <span
                    aria-hidden
                    className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-wine text-white"
                  >
                    <X className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                  {t(key)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
