import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleDollarSign } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/modules/common/ui/alert-dialog'
import { ignoreHeldKey } from '@/modules/avatars/utilities/twoStepConfirmGuards'
import { Button } from '@/modules/common/ui/button'
import { AVATAR_CHARGED_CANCEL_KEYS } from '@/modules/videos/constants'
import type { AvatarChargedCancelVariant } from '@/modules/videos/types/create'

interface AvatarChargedCancelDialogProps {
  // Cuántas apariciones del avatar están cobradas y sin terminar; null =
  // cerrado.
  chargedCount: number | null
  variant: AvatarChargedCancelVariant
  onKeep(): void
  onConfirm(): void
}

// «Cancelar» con apariciones del avatar ya cobradas (entrega 2h, spec §24.4):
// dice que lo que ya se mandó a generar se cobra igual, que no se pierde y que
// se usa sin pagar de nuevo cuando se siga. El foco abre en «Seguir
// generando» (lo pone el AlertDialog de Radix); Escape o cerrar también es
// seguir. «Cancelar igual» ignora las repeticiones de una tecla sostenida: solo
// un gesto propio corta. Al cerrarse sigue mostrando la última cuenta mientras
// dura su animación de salida. Presentacional.
export function AvatarChargedCancelDialog({
  chargedCount,
  variant,
  onKeep,
  onConfirm,
}: AvatarChargedCancelDialogProps) {
  const { t } = useTranslation()
  const keys = AVATAR_CHARGED_CANCEL_KEYS[variant]

  // La última cuenta que se mostró (ajuste durante el render): al cerrarse,
  // `chargedCount` ya es null pero el texto todavía se ve un instante.
  const [shown, setShown] = useState(chargedCount)
  if (chargedCount !== null && chargedCount !== shown) setShown(chargedCount)
  const count = chargedCount ?? shown ?? 0

  return (
    <AlertDialog
      open={chargedCount !== null}
      onOpenChange={(next) => !next && onKeep()}
    >
      <AlertDialogContent className="rounded-2xl sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 font-display">
            <CircleDollarSign aria-hidden className="h-5 w-5 text-amethyst" />
            {t(keys.title)}
          </AlertDialogTitle>
          <AlertDialogDescription className="font-body">
            {t(keys.body, { count })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel
            onKeyDown={ignoreHeldKey}
            className="rounded-xl font-display"
          >
            {t(keys.keep)}
          </AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            onKeyDown={ignoreHeldKey}
            className="rounded-xl font-display font-bold"
          >
            {t(keys.confirm)}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
