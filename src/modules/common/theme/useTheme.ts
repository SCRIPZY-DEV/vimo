import { use } from 'react'
import {
  ThemeContext,
  type ThemeContextValue,
} from '@/modules/common/theme/themeContext'

export function useTheme(): ThemeContextValue {
  const context = use(ThemeContext)
  if (!context)
    throw new Error('useTheme debe usarse dentro de <ThemeProvider>')
  return context
}
