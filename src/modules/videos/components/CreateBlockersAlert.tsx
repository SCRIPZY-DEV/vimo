import type { Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Alert } from '@/modules/common/components/Alert'

interface CreateBlockersAlertProps {
  // Claves i18n de create.validation.* devueltas por formBlockers.
  blockers: string[]
  // Intentos de envío con pasos faltantes: al cambiar remonta la caja y
  // vuelve a reproducir el gesto de entrada.
  attempts: number
  id?: string
  ref?: Ref<HTMLDivElement>
}

// Lo que falta completar antes de poder generar.
export function CreateBlockersAlert({
  blockers,
  attempts,
  id,
  ref,
}: CreateBlockersAlertProps) {
  const { t } = useTranslation()

  if (blockers.length === 0) return null

  return (
    <motion.div
      key={attempts}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0, x: [0, -6, 6, -4, 0] }}
    >
      <Alert
        ref={ref}
        id={id}
        title={t('create.validation.title', { count: blockers.length })}
      >
        <ul className="mt-1 space-y-1">
          {blockers.map((blocker) => (
            <li key={blocker} className="flex items-start gap-2">
              <span aria-hidden className="text-saffron">
                •
              </span>
              {t(blocker)}
            </li>
          ))}
        </ul>

        <p className="mt-2 font-body text-xs text-muted-foreground">
          {t('create.validation.hint')}
        </p>
      </Alert>
    </motion.div>
  )
}
