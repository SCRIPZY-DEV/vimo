import { createContext } from 'react'
import type { AppUpdateContextValue } from '../types/updates'

export const AppUpdateContext = createContext<AppUpdateContextValue | null>(
  null,
)
