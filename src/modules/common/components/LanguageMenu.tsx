import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { Globe, Check } from 'lucide-react'
import { LOCALES } from '@/modules/common/constants'
import { cn } from '@/modules/common/utilities/cn'

// Selector de idioma (es/en/pt) con dropdown animado y bandera. El idioma
// activo se lee de i18next: es configuración global, no viaja por props.
export function LanguageMenu() {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Clic fuera del menú lo cierra (listener del DOM: sistema externo).
  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const selected =
    LOCALES.find((locale) => locale.id === i18n.resolvedLanguage) ?? LOCALES[0]

  const changeLanguage = (locale: string) => {
    void i18n.changeLanguage(locale)
    setOpen(false)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen((current) => !current)}
        className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 transition-colors hover:bg-muted"
        aria-label={t('layout.navbar.idioma')}
      >
        <Globe className="h-4 w-4 text-muted-foreground" />
        <span className="text-base leading-none">{selected.flag}</span>
        <span className="font-display text-xs font-semibold uppercase">
          {selected.id}
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-40 mt-1 min-w-[180px] overflow-hidden rounded-xl border-2 border-border bg-card shadow-card-hover"
          >
            {LOCALES.map((locale) => {
              const active = locale.id === selected.id
              return (
                <button
                  key={locale.id}
                  onClick={() => changeLanguage(locale.id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors',
                    active ? 'bg-saffron/15' : 'hover:bg-muted',
                  )}
                >
                  <span className="text-xl leading-none">{locale.flag}</span>
                  <span className="flex-1 font-display text-sm font-semibold">
                    {locale.name}
                  </span>
                  {active && <Check className="h-4 w-4 text-saffron" />}
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
