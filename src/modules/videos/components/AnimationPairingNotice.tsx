import { Link2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatSlotSeconds } from '@/modules/videos/utilities/formatSlotSeconds'
import type { AnimationUnit } from '@pipeline/animation/planner.ts'

interface AnimationPairingNoticeProps {
  units: AnimationUnit[]
  selectedSceneIds: number[]
}

// Describe las unidades reales del encargo: no infiere parejas solo a partir
// de la duración ni suma los planes individuales de una selección múltiple.
export function AnimationPairingNotice({
  units,
  selectedSceneIds,
}: AnimationPairingNoticeProps) {
  const { t, i18n } = useTranslation()
  const pairs = units.filter(
    (unit) => unit.strategy === 'merge' && unit.sceneIds.length > 1,
  )
  if (!pairs.length) return null

  const locale = i18n.resolvedLanguage ?? 'es'
  const list = new Intl.ListFormat(locale)
  const extraIds = [...new Set(pairs.flatMap((unit) => unit.sceneIds))].filter(
    (id) => !selectedSceneIds.includes(id),
  )

  return (
    <div
      role="note"
      aria-label={t('library.editor.panel.animation.pairingTitle')}
      className="space-y-2 rounded-xl border border-sky/30 bg-sky/10 p-3 font-body text-xs"
      data-animation-pairing
    >
      <p className="flex items-center gap-1.5 font-display font-semibold">
        <Link2 aria-hidden className="h-4 w-4 shrink-0 text-sky" />
        {t('library.editor.panel.animation.pairingTitle')}
      </p>
      <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
        {pairs.map((unit) => (
          <span
            key={`${unit.startSeconds}-${unit.endSeconds}`}
            className="rounded-lg border border-sky/25 bg-background px-2 py-1"
          >
            {t('library.editor.panel.animation.pairingGroup', {
              ids: list.format(unit.sceneIds.map(String)),
              seconds: formatSlotSeconds(unit.slotSeconds, locale),
            })}
          </span>
        ))}
      </div>
      <p className="leading-relaxed text-muted-foreground">
        {extraIds.length > 0
          ? t('library.editor.panel.animation.pairingAdditional', {
              count: extraIds.length,
              ids: list.format(extraIds.map(String)),
            })
          : t('library.editor.panel.animation.pairingOnce')}
      </p>
    </div>
  )
}
