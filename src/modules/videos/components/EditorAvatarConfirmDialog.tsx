import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, UserRound } from 'lucide-react'
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
import { formatCompact } from '@/modules/common/utilities/formatCompact'
import { formatUsd } from '@/modules/common/utilities/formatUsd'
import type { Ref } from 'react'
import type { TFunction } from 'i18next'
import type { AvatarRenderConfirmationState } from '@/modules/videos/types/library'
import type { AvatarBalanceResult } from '@pipeline/types/avatar.ts'

interface EditorAvatarConfirmDialogProps {
  // La confirmación abierta (useAvatarRenderConfirmation); null = cerrada.
  confirmation: AvatarRenderConfirmationState | null
  cancelRef: Ref<HTMLButtonElement>
  onConfirm(): void
  onCancel(): void
  onCloseAutoFocus(event: Event): void
}

// Confirmación de «Generar» / «Regenerar» el avatar en el editor (entrega 2d):
// cuántas apariciones, lo que cobra el servicio de avatares y el saldo, antes
// de pagar. Con el saldo corto lo dice y no deja confirmar. El foco abre en
// «Cancelar» (lo pone el AlertDialog de Radix): un Enter distraído no paga.
// Mientras relee el saldo, los botones quedan con `aria-disabled` y no con
// `disabled`: un botón deshabilitado con el foco lo suelta fuera del diálogo
// (ERRORES-CONOCIDOS: dialogo-radix-con-controles-y-x-deshabilitados-deja-
// escapar-el-foco). «Generar» ignora las repeticiones de una tecla sostenida:
// solo un gesto propio paga (M1 de la revisión del WP-Q). «Cancelar» también:
// si el job cae con Enter todavía apretado, el foco vuelve al botón que la
// abrió y una repetición la reabre; sin esto, la siguiente la cerraba, y así
// en bucle (F1 de la re-revisión). Al cerrarse sigue mostrando lo último que
// confirmó mientras dura su animación de salida. Presentacional.
export function EditorAvatarConfirmDialog({
  confirmation,
  cancelRef,
  onConfirm,
  onCancel,
  onCloseAutoFocus,
}: EditorAvatarConfirmDialogProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'es'

  // Lo último que se mostró (ajuste durante el render): al cerrarse,
  // `confirmation` ya es null pero el contenido todavía se ve un instante.
  const [shown, setShown] = useState(confirmation)
  if (confirmation && confirmation !== shown) setShown(confirmation)
  const current = confirmation ?? shown
  const amount = current?.cost
    ? formatUsd(current.cost.estimated, language)
    : '—'
  const checking = current?.checking ?? false
  const insufficient = current?.insufficient ?? false

  return (
    <AlertDialog
      open={confirmation !== null}
      onOpenChange={(next) => !next && onCancel()}
    >
      <AlertDialogContent
        onCloseAutoFocus={onCloseAutoFocus}
        className="rounded-2xl sm:max-w-md"
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 font-display">
            <UserRound aria-hidden className="h-5 w-5 text-amethyst" />
            {t('library.editor.avatar.confirmarTitulo')}
          </AlertDialogTitle>
        </AlertDialogHeader>

        {/* La descripción accesible del diálogo es todo esto: un lector de
            pantalla anuncia al abrir el costo, el saldo y, si no alcanza, el
            aviso (M2 de la revisión del WP-Q). */}
        <AlertDialogDescription asChild>
          <div className="space-y-3 font-body">
            <p>
              {t('library.editor.avatar.confirmarTexto', {
                count: current?.count ?? 0,
                amount,
              })}
            </p>
            <p className="text-foreground">
              {t('library.editor.avatar.saldo', {
                balance: balanceText(current?.balance ?? null, t, language),
              })}
            </p>
            {insufficient && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive-text"
              >
                {t('library.editor.avatar.saldoInsuficiente')}
              </p>
            )}
          </div>
        </AlertDialogDescription>

        <AlertDialogFooter>
          <AlertDialogCancel
            ref={cancelRef}
            onKeyDown={ignoreHeldKey}
            aria-disabled={checking}
            className="rounded-xl font-display"
          >
            {t('library.editor.avatar.cancelar')}
          </AlertDialogCancel>
          <Button
            type="button"
            onClick={onConfirm}
            onKeyDown={ignoreHeldKey}
            disabled={insufficient}
            aria-disabled={checking}
            className="rounded-xl font-display font-bold"
          >
            {checking && <Loader2 aria-hidden className="animate-spin" />}
            {t('library.editor.avatar.confirmar')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// El saldo de avatares como lo dice la píldora de Avatares: en dólares la
// billetera verificada (`usd`, o sin moneda), en créditos otra moneda, y «no
// disponible» si no se pudo leer. Mientras llega, una raya.
function balanceText(
  status: AvatarBalanceResult | null,
  t: TFunction,
  language: string,
): string {
  if (!status) return '—'

  if (!status.available || status.remaining === undefined)
    return t('avatars.saldo.noDisponible')

  if (status.currency === undefined || status.currency === 'usd')
    return formatUsd(status.remaining, language)

  return t('avatars.saldo.creditos', {
    amount: formatCompact(status.remaining),
  })
}
