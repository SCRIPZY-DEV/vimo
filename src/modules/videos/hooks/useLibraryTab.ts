import { useState } from 'react'
import {
  readLibraryTab,
  rememberLibraryTab,
} from '@/modules/videos/utilities/libraryTab'
import type { LibraryTab } from '@/modules/videos/types/library'

// Pestaña activa de la biblioteca: arranca en la recordada (la última elegida
// o la del último proyecto creado) y cada cambio la persiste.
export function useLibraryTab() {
  const [tab, setTab] = useState<LibraryTab>(readLibraryTab)

  const selectTab = (next: LibraryTab) => {
    rememberLibraryTab(next)
    setTab(next)
  }

  return { tab, selectTab }
}
