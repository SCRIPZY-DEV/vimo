import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  THEME_CHANGING_CLASS,
  THEME_STORAGE_KEY,
  THEME_TRANSITION_MS,
} from '@/modules/common/theme/constants'
import { ThemeContext, type Theme } from '@/modules/common/theme/themeContext'

function readInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  return prefersDark ? 'dark' : 'light'
}

/**
 * Aplica el tema al `<html>` (clase `dark` para Tailwind + `color-scheme`).
 * La clase de transición se activa solo durante el cambio para que la
 * animación de colores no entorpezca hover/scroll el resto del tiempo
 * (ver src/assets/css/main.css).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState(readInitialTheme)

  useEffect(() => {
    const html = document.documentElement
    html.classList.toggle('dark', theme === 'dark')
    html.style.colorScheme = theme
    html.classList.add(THEME_CHANGING_CLASS)
    const timer = window.setTimeout(
      () => html.classList.remove(THEME_CHANGING_CLASS),
      THEME_TRANSITION_MS,
    )
    return () => window.clearTimeout(timer)
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    localStorage.setItem(THEME_STORAGE_KEY, next)
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      localStorage.setItem(THEME_STORAGE_KEY, next)
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
