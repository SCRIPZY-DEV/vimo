import { useState } from 'react'
import { useOutlet } from 'react-router'

/**
 * Captura una sola vista por instancia del wrapper de ruta/idioma.
 *
 * Nació para impedir el doble montaje de la vista destino dentro de un wrapper
 * saliente de AnimatePresence. El layout ya no retiene esa salida: reemplaza
 * el wrapper con la nueva key en el mismo commit, sin esperar animaciones.
 * Conservamos la captura por instancia y su ciclo de vida; las actualizaciones
 * del sidebar o de datos no vuelven a montar la pantalla.
 */
export function FrozenOutlet() {
  const outlet = useOutlet()
  const [frozen] = useState(outlet)
  return frozen
}
