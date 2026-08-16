import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { VOICE_CHAR_BATCHES } from '../constants'
import { VOICE_PROVIDERS } from '../catalog'
import { PriceCell } from './PriceCell'

export function VoiceCostTable() {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage

  const formatChars = (n: number) => n.toLocaleString(locale)

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 text-left font-display text-xs font-bold uppercase tracking-wide">
                {t('costs.colProveedor')}
              </th>
              <th className="px-3 py-2.5 text-right font-display text-xs font-bold uppercase tracking-wide">
                {t('costs.colPrecioChar')}
              </th>
              {VOICE_CHAR_BATCHES.map((chars) => (
                <th
                  key={chars}
                  className="px-3 py-2.5 text-right font-display text-xs font-bold uppercase tracking-wide"
                >
                  <div className="flex flex-col items-end gap-0.5">
                    <span>
                      {t('costs.loteCaracteres', {
                        cantidad: formatChars(chars),
                      })}
                    </span>
                    <span className="font-mono text-[10px] normal-case text-muted-foreground/70">
                      {t('costs.loteCreditos', {
                        cantidad: formatChars(chars),
                      })}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {VOICE_PROVIDERS.map((voice, index) => (
              <motion.tr
                key={voice.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, delay: index * 0.04 }}
                className="border-t border-border/60"
              >
                <td className="px-3 py-2 font-display font-semibold text-foreground">
                  {voice.label}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex flex-col items-end gap-0.5">
                    <PriceCell usd={voice.pricePerCharUsd} highlighted />
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {t('costs.creditoUnitario')}
                    </span>
                  </div>
                </td>
                {VOICE_CHAR_BATCHES.map((chars) => (
                  <td key={chars} className="px-3 py-2 text-right">
                    <PriceCell
                      usd={voice.pricePerCharUsd * chars}
                      tooltip={t('costs.tooltipVoz', {
                        caracteres: formatChars(chars),
                        precio: `$${voice.pricePerCharUsd.toFixed(7)}`,
                      })}
                    />
                  </td>
                ))}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-1 font-handwritten text-sm text-muted-foreground">
        {t('costs.notaVoces')}
      </p>
    </div>
  )
}
