import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CHARS_PER_SECOND_ESTIMATE,
  SECONDS_PER_SCENE_ESTIMATE,
  SORT_REFERENCE_DURATION_MINUTES,
  VIDEO_DURATIONS_MINUTES,
} from '../constants'
import {
  compareByFastest,
  flattenImageVoiceCombos,
  qualityWeight,
} from '../catalogRows'
import type { CostFilter, ImageVoiceComboRow } from '../types/costs'
import { PriceCell } from './PriceCell'

function computeCell(row: ImageVoiceComboRow, durationMinutes: number) {
  const durationSeconds = durationMinutes * 60
  const numImages = Math.max(
    1,
    Math.round(durationSeconds / SECONDS_PER_SCENE_ESTIMATE),
  )
  const chars = Math.round(durationSeconds * CHARS_PER_SECOND_ESTIMATE)
  const imagesUsd = row.priceUsd * numImages
  const voiceUsd = row.voicePricePerCharUsd * chars
  return { numImages, chars, imagesUsd, voiceUsd, total: imagesUsd + voiceUsd }
}

export function FullVideoCostTable({ filter }: { filter: CostFilter }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage

  const rows = useMemo(() => {
    const flat = flattenImageVoiceCombos()
    if (filter === 'cheapest') {
      return flat.sort(
        (a, b) =>
          computeCell(a, SORT_REFERENCE_DURATION_MINUTES).total -
          computeCell(b, SORT_REFERENCE_DURATION_MINUTES).total,
      )
    }
    if (filter === 'fastest') {
      return flat.sort(compareByFastest)
    }
    return flat.sort((a, b) => qualityWeight(a) - qualityWeight(b))
  }, [filter])

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className="px-3 py-2.5 text-left font-display text-xs font-bold uppercase tracking-wide">
              {t('costs.colCombinacion')}
            </th>
            <th className="px-3 py-2.5 text-left font-display text-xs font-bold uppercase tracking-wide">
              {t('costs.colVoz')}
            </th>
            {VIDEO_DURATIONS_MINUTES.map((minutes) => (
              <th
                key={minutes}
                className="px-3 py-2.5 text-right font-display text-xs font-bold uppercase tracking-wide"
              >
                {t('costs.colMinutos', { minutos: minutes })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <AnimatePresence initial={false}>
            {rows.map((row, index) => (
              <motion.tr
                key={row.key}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, delay: index * 0.015 }}
                className="border-t border-border/60"
              >
                <td className="px-3 py-2">
                  <p className="font-display font-semibold text-foreground">
                    {row.providerLabel} · {row.modelLabel}
                  </p>
                  <p className="font-body text-xs text-muted-foreground">
                    {row.qualityLabel}
                  </p>
                </td>
                <td className="px-3 py-2 font-body text-muted-foreground">
                  {row.voiceLabel}
                </td>
                {VIDEO_DURATIONS_MINUTES.map((minutes) => {
                  const cell = computeCell(row, minutes)
                  const tooltip = t('costs.tooltipVideo', {
                    imagenes: cell.numImages,
                    caracteres: cell.chars.toLocaleString(locale),
                    montoImagenes: `$${cell.imagesUsd.toFixed(3)}`,
                    montoVoz: `$${cell.voiceUsd.toFixed(3)}`,
                  })
                  return (
                    <td key={minutes} className="px-3 py-2 text-right">
                      <PriceCell
                        usd={cell.total}
                        highlighted
                        tooltip={tooltip}
                      />
                    </td>
                  )
                })}
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  )
}
