import { useEffect } from 'react'

/** Fija el título de la pestaña. Cada vista lo llama con su `pageTitle` traducido. */
export function usePageTitle(titulo: string) {
  useEffect(() => {
    document.title = titulo
  }, [titulo])
}
