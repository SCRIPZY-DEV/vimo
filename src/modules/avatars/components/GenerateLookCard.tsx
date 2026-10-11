import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Info, Sparkles } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { GenerateLookDialog } from '@/modules/avatars/components/GenerateLookDialog'
import { useHeyGenAccess } from '@/modules/avatars/hooks/useHeyGenAccess'
import type {
  AvatarAspectRatio,
  AvatarSummary,
} from '@pipeline/types/avatar.ts'

interface GenerateLookCardProps {
  avatar: AvatarSummary
  // Formato con el que el diálogo arranca abierto, desde el enlace de la
  // tarjeta del avatar de Crear (ADR-0057 §9); sin él, se abre con un clic.
  openWithAspectRatio?: AvatarAspectRatio
}

// «Crear escenario»: la primera ficha de los looks de un avatar, con borde
// punteado, que abre el diálogo para generar un look nuevo desde una
// descripción. Solo sobre avatares propios (pedirle a HeyGen un look sobre un
// grupo público no está verificado: se revisa con la sonda paga) y con el
// look principal listo; si no, queda a la vista pero apagada, con el motivo.
// Apagada sigue enfocable (`aria-disabled`, no `disabled`) para que el lector
// de pantalla llegue al motivo. Es dueña de su diálogo. Desde un enlace, el
// diálogo abre solo en el formato pedido apenas la ficha se puede usar (el
// llavero responde después del primer render), una sola vez.
export function GenerateLookCard({
  avatar,
  openWithAspectRatio,
}: GenerateLookCardProps) {
  const { t } = useTranslation()
  const { canUseHeyGen, missingKey } = useHeyGenAccess()
  const [open, setOpen] = useState(false)
  const [linkConsumed, setLinkConsumed] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const hintId = useId()
  const reasonId = useId()

  const reasonKey = blockedReasonKey(avatar, missingKey)
  // Mientras el llavero responde (sin acceso pero sin clave faltante) la
  // ficha espera apagada, sin acusar una clave que quizás está.
  const blocked = reasonKey !== null || !canUseHeyGen
  const linkOpen =
    openWithAspectRatio !== undefined && !linkConsumed && !blocked

  const openDialog = () => {
    if (blocked) return

    setOpen(true)
  }

  // Cerrar el diálogo consume el enlace: reabrir el panel no lo vuelve a abrir.
  const closeDialog = () => {
    setOpen(false)
    setLinkConsumed(true)
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <button
        ref={buttonRef}
        type="button"
        aria-disabled={blocked}
        // El nombre es solo el título; la ayuda y el motivo van como
        // descripción (si no, el lector de pantalla los lee dos veces).
        aria-labelledby={titleId}
        aria-describedby={reasonKey ? `${hintId} ${reasonId}` : hintId}
        onClick={openDialog}
        className={cn(
          'group flex aspect-[4/5] w-full flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed px-4 text-center transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          blocked
            ? 'cursor-not-allowed border-border bg-muted/30'
            : 'border-saffron/50 bg-saffron/5 hover:border-saffron hover:bg-saffron/10',
        )}
      >
        <span
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-full transition-transform duration-300',
            blocked
              ? 'bg-muted text-muted-foreground'
              : 'bg-saffron/20 text-foreground group-hover:scale-110',
          )}
        >
          <Sparkles aria-hidden className="h-5 w-5" />
        </span>
        <span
          id={titleId}
          className={cn(
            'font-display text-sm font-bold',
            blocked ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          {t('avatars.generar.tarjeta')}
        </span>
        <span
          id={hintId}
          className="font-body text-xs leading-relaxed text-muted-foreground"
        >
          {t('avatars.generar.tarjetaHint')}
        </span>
        {reasonKey && (
          <span
            id={reasonId}
            className="flex items-start gap-1.5 text-left font-body text-xs font-semibold leading-snug text-foreground"
          >
            <Info aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
            {t(reasonKey)}
          </span>
        )}
      </button>

      {(open || linkOpen) && (
        <GenerateLookDialog
          avatar={avatar}
          initialAspectRatio={linkOpen ? openWithAspectRatio : undefined}
          returnFocusRef={buttonRef}
          onClose={closeDialog}
        />
      )}
    </div>
  )
}

// Por qué no se puede crear un escenario ahora (clave i18n), o null si se
// puede. Un avatar de stock no cambia nunca; uno propio espera a tener su look
// principal listo (es la base del look nuevo) y la clave de HeyGen.
function blockedReasonKey(
  avatar: AvatarSummary,
  missingKey: boolean,
): string | null {
  if (avatar.ownership !== 'own') return 'avatars.generar.soloPropios'

  const main = avatar.looks.find((look) => look.lookId === avatar.mainLookId)
  if (avatar.status !== 'ready' || main?.status !== 'ready')
    return 'avatars.generar.necesitaPrincipal'
  if (missingKey) return 'avatars.errors.missingApiKey'

  return null
}
