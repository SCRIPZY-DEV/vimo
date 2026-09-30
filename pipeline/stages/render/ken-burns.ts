import type { FrameSize } from '../../types/video-format.ts'
import { FPS, ZOOM_MAX, ZOOM_PAN } from './constants.ts'

// Los mismos ocho Ken Burns y el mismo orden por índice global. La ventana
// se transforma con precisión subpíxel: zoompan redondeaba el recorte a enteros
// y hacía vibrar los zooms, especialmente al centrar o anclar una esquina.
export function cameraEffect(
  globalSceneIndex: number,
  frames: number,
  frame: FrameSize,
): string {
  // perspective cuenta desde 1; zoompan y la vista previa arrancan en 0.
  const position = `(on-1)/${frames}`
  const zoomDelta = (ZOOM_MAX - 1.0).toFixed(3)
  const zoomIn = `min(1.0+(${zoomDelta})*(${position}),${ZOOM_MAX})`
  const zoomOut = `${ZOOM_MAX}-(${zoomDelta})*(${position})`
  const progress = position
  const reverseProgress = `1-(${position})`

  // Posición relativa dentro del margen disponible: 0 = inicio, 1 = final.
  const movements = [
    { zoom: zoomIn, horizontal: '0.5', vertical: '0.5' },
    { zoom: zoomOut, horizontal: '0.5', vertical: '0.5' },
    { zoom: zoomIn, horizontal: '0', vertical: '0' },
    { zoom: zoomIn, horizontal: '1', vertical: '1' },
    { zoom: String(ZOOM_PAN), horizontal: progress, vertical: '0.5' },
    { zoom: String(ZOOM_PAN), horizontal: reverseProgress, vertical: '0.5' },
    { zoom: String(ZOOM_PAN), horizontal: '0.5', vertical: progress },
    { zoom: String(ZOOM_PAN), horizontal: '0.5', vertical: reverseProgress },
  ]

  // Paso 3, coprimo con 8: conserva 0,3,6,1,4,7,2,5 sin repetir vecinos.
  const STEP = 3
  const movement = movements[(globalSceneIndex * STEP) % movements.length]
  const width = `W/(${movement.zoom})`
  const height = `H/(${movement.zoom})`
  const left = `(W-${width})*(${movement.horizontal})`
  const top = `(H-${height})*(${movement.vertical})`
  const right = `${left}+${width}`
  const bottom = `${top}+${height}`

  // sense=source proyecta esta ventana a la salida, sin rotación/perspectiva
  // artística. fps fija el reloj antes de evaluar on; trim del chunk conserva
  // el número de cuadros. No amplía imágenes a 8K ni afecta clips animados.
  return (
    `fps=${FPS},format=yuv420p,` +
    `perspective=x0='${left}':y0='${top}':x1='${right}':y1='${top}':` +
    `x2='${left}':y2='${bottom}':x3='${right}':y3='${bottom}':` +
    `sense=source:eval=frame:interpolation=cubic,` +
    `scale=${frame.width}:${frame.height}`
  )
}
