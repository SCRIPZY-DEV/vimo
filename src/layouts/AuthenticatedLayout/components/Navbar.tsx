import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { Moon, Sun, Globe, Check } from 'lucide-react'
import type { LocaleOption } from '@/layouts/AuthenticatedLayout/types/navigation'
import { cn } from '@/modules/common/utilities/cn'
import { useTheme } from '@/modules/common/theme/useTheme'

/**
 * Barra superior fija (port de BarraSuperior de la app original):
 *  - Toggle de tema (claro/oscuro) con animación de iconos.
 *  - Selector de idioma (es/en/pt) con dropdown animado y bandera.
 */

const LOCALES: LocaleOption[] = [
  { id: 'es', flag: '🇪🇸', name: 'Español' },
  { id: 'en', flag: '🇬🇧', name: 'English' },
  { id: 'pt', flag: '🇧🇷', name: 'Português' },
]

export function Navbar() {
  const { t, i18n } = useTranslation()
  const { theme, toggleTheme } = useTheme()
  const [languageOpen, setLanguageOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!languageOpen) return
    const onClick = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setLanguageOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [languageOpen])

  const selected =
    LOCALES.find((locale) => locale.id === i18n.resolvedLanguage) ?? LOCALES[0]

  const changeLanguage = (locale: string) => {
    void i18n.changeLanguage(locale)
    setLanguageOpen(false)
  }

  return (
    <header className="z-30 flex h-12 shrink-0 items-center justify-end gap-1 border-b border-border bg-background/80 px-5 backdrop-blur">
      {/* Toggle tema */}
      <button
        onClick={toggleTheme}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-muted"
        aria-label={
          theme === 'dark'
            ? t('layout.navbar.temaClaro')
            : t('layout.navbar.temaOscuro')
        }
        title={
          theme === 'dark'
            ? t('layout.navbar.temaClaro')
            : t('layout.navbar.temaOscuro')
        }
      >
        <AnimatePresence mode="wait" initial={false}>
          {theme === 'dark' ? (
            <motion.div
              key="sun"
              initial={{ rotate: -45, scale: 0.6, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              exit={{ rotate: 45, scale: 0.6, opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="absolute"
            >
              <Sun className="h-5 w-5 text-foreground" />
            </motion.div>
          ) : (
            <motion.div
              key="moon"
              initial={{ rotate: 45, scale: 0.6, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              exit={{ rotate: -45, scale: 0.6, opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="absolute"
            >
              <Moon className="h-5 w-5 text-foreground" />
            </motion.div>
          )}
        </AnimatePresence>
      </button>

      {/* Selector idioma */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setLanguageOpen((open) => !open)}
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
          {languageOpen && (
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
    </header>
  )
}
