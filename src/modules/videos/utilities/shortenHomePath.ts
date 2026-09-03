import { HOME_DIRECTORY_PREFIX_REGEX } from '@/modules/videos/constants'

// «/Users/ana/Documents/Vimo/mi-video/final.mp4» → «~/Documents/Vimo/…».
// Solo para mostrar: la ruta real sigue siendo la absoluta.
export function shortenHomePath(path: string): string {
  return path.replace(HOME_DIRECTORY_PREFIX_REGEX, '~')
}
