import {
  FPS,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  ZOOM_MAX,
  ZOOM_PAN,
} from './constants.ts'

// Catálogo de 8 movimientos de cámara (Ken Burns) claramente perceptibles
// (port de efectoCamara). La asignación es DETERMINÍSTICA por índice global
// (mismo índice → mismo movimiento: clave para que el re-render de un chunk
// sea byte-idéntico y el cache por manifest funcione), con un paso coprimo a
// la cantidad de variantes para que dos escenas consecutivas NUNCA repitan
// el mismo efecto. Sin variante estática: toda escena se mueve.
export function cameraEffect(globalSceneIndex: number, frames: number): string {
  const tail = `:d=${frames}:s=${FRAME_WIDTH}x${FRAME_HEIGHT}:fps=${FPS}`
  const zoomDelta = (ZOOM_MAX - 1.0).toFixed(3)
  const zoomIn = `min(1.0+(${zoomDelta})*on/${frames},${ZOOM_MAX})`
  const zoomOut = `${ZOOM_MAX}-(${zoomDelta})*on/${frames}`

  const movements: string[] = [
    // 1. Zoom in al centro.
    `zoompan=z='${zoomIn}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'${tail}`,
    // 2. Zoom out desde el centro.
    `zoompan=z='${zoomOut}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'${tail}`,
    // 3. Zoom in hacia la esquina superior izquierda.
    `zoompan=z='${zoomIn}':x='0':y='0'${tail}`,
    // 4. Zoom in hacia la esquina inferior derecha.
    `zoompan=z='${zoomIn}':x='iw-iw/zoom':y='ih-ih/zoom'${tail}`,
    // 5. Paneo izquierda → derecha (zoom fijo).
    `zoompan=z='${ZOOM_PAN}':x='(iw-iw/zoom)*on/${frames}':y='ih/2-(ih/zoom/2)'${tail}`,
    // 6. Paneo derecha → izquierda.
    `zoompan=z='${ZOOM_PAN}':x='(iw-iw/zoom)*(1-on/${frames})':y='ih/2-(ih/zoom/2)'${tail}`,
    // 7. Paneo arriba → abajo.
    `zoompan=z='${ZOOM_PAN}':x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*on/${frames}'${tail}`,
    // 8. Paneo abajo → arriba.
    `zoompan=z='${ZOOM_PAN}':x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(1-on/${frames})'${tail}`,
  ]

  // Paso 3, coprimo con 8: recorre las variantes en orden 0,3,6,1,4,7,2,5.
  const STEP = 3
  return movements[(globalSceneIndex * STEP) % movements.length]
}
