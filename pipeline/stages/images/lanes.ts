import type { PaidImageProviderId } from '../../types/image-provider.ts'
import { evolinkImageLane } from './evolink-lane.ts'
import { falImageLane } from './fal-lane.ts'
import type { ImageLane } from './lane.ts'

// Registro de carriles normales: agregar un proveedor de imagen es un archivo
// en stages/images/ que exporta su ImageLane más una línea acá. El carril de
// personaje NO entra en este registro: solo Evolink acepta referencias por
// URL, y esa decisión vive en images.ts.
export const IMAGE_LANES: Record<PaidImageProviderId, ImageLane> = {
  evolink: evolinkImageLane,
  fal: falImageLane,
}
