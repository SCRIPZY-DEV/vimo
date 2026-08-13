import { useState } from 'react'
import { useOutlet } from 'react-router'

/**
 * Congela el contenido del Outlet por instancia montada (port de
 * OutletCongelado v0.51.2 de la app original).
 *
 * Con AnimatePresence mode="wait", el wrapper SALIENTE seguía renderizando un
 * <Outlet/> "vivo" que, al cambiar la ruta, ya resolvía a la pantalla NUEVA:
 * cada navegación montaba la pantalla destino DOS veces — una dentro del
 * wrapper que se estaba desvaneciendo (y moría con él a los ~220ms,
 * descartando efectos de mount duplicados y cualquier cosa tipeada en esa
 * ventana) y otra en el wrapper definitivo. Congelado el outlet, el wrapper
 * saliente conserva la pantalla VIEJA mientras sale, y la nueva se monta UNA
 * sola vez.
 */
export function FrozenOutlet() {
  const outlet = useOutlet()
  const [frozen] = useState(outlet)
  return frozen
}
