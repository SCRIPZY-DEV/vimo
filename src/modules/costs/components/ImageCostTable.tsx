import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { IMAGE_BATCH_SIZES } from '../constants'
import {
  compareByFastest,
  flattenImageOptions,
  qualityWeight,
} from '../catalogRows'
import type { CostFilter } from '../types/costs'
import { PriceCell } from '@/modules/common/components/PriceCell'

export function ImageCostTable({ filter }: { filter: CostFilter }) {
  const { t } = useTranslation()

  const rows = useMemo(() => {
    const flat = flattenImageOptions()
    if (filter === 'cheapest') {
      return flat.sort((a, b) => a.priceUsd - b.priceUsd)
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
              {t('costs.colProveedor')}
            </th>
            <th className="px-3 py-2.5 text-left font-display text-xs font-bold uppercase tracking-wide">
              {t('costs.colModelo')}
            </th>
            <th className="px-3 py-2.5 text-left font-display text-xs font-bold uppercase tracking-wide">
              {t('costs.colCalidad')}
            </th>
            <th className="px-3 py-2.5 text-right font-display text-xs font-bold uppercase tracking-wide">
              {t('costs.colPrecioImg')}
            </th>
            <th className="px-3 py-2.5 text-right font-display text-xs font-bold uppercase tracking-wide">
              {t('costs.colConcurrencia')}
            </th>
            {IMAGE_BATCH_SIZES.map((size) => (
              <th
                key={size}
                className="px-3 py-2.5 text-right font-display text-xs font-bold uppercase tracking-wide"
              >
                {t('costs.loteImagenes', { cantidad: size })}
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
                transition={{ duration: 0.18, delay: index * 0.02 }}
                className="border-t border-border/60"
              >
                <td className="px-3 py-2 font-display font-semibold text-foreground">
                  {row.providerLabel}
                </td>
                <td className="px-3 py-2 font-body text-foreground">
                  {row.modelLabel}
                </td>
                <td className="px-3 py-2 font-body text-muted-foreground">
                  <span title={row.notesKey ? t(row.notesKey) : undefined}>
                    {row.qualityLabel}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex flex-col items-end gap-0.5">
                    <PriceCell usd={row.priceUsd} highlighted />
                    {row.credits !== undefined && (
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                        {t('costs.loteCreditos', {
                          cantidad: row.credits.toFixed(2),
                        })}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-foreground">
                  {row.concurrency}
                </td>
                {IMAGE_BATCH_SIZES.map((size) => (
                  <td key={size} className="px-3 py-2 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      <PriceCell
                        usd={row.priceUsd * size}
                        tooltip={t('costs.tooltipLoteImagenes', {
                          cantidad: size,
                          precio: `$${row.priceUsd.toFixed(4)}`,
                        })}
                      />
                      {row.credits !== undefined && (
                        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                          {t('costs.loteCreditos', {
                            cantidad: (row.credits * size).toFixed(0),
                          })}
                        </span>
                      )}
                    </div>
                  </td>
                ))}
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  )
}
