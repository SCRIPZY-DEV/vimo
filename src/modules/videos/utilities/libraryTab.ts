import {
  DEFAULT_LIBRARY_TAB,
  LIBRARY_TAB_STORAGE_KEY,
} from '@/modules/videos/constants'
import { isVertical } from '@/modules/videos/utilities/videoFormat'
import type { LibraryTab } from '@/modules/videos/types/library'
import type { VideoFormat } from '@pipeline/types/video-format.ts'
import type { VideoProjectListItem } from '@pipeline/types/video-project.ts'

// Pestañas de la biblioteca: en cuál cae cada proyecto y cuál se recuerda
// entre visitas.

// Ausente = 16:9 (proyectos previos al selector de formato), como en el
// resto del pipeline.
export function libraryTabFor(format: VideoFormat | undefined): LibraryTab {
  return isVertical(format ?? '16:9') ? 'shorts' : 'long'
}

// Reparte el listado en sus pestañas conservando el orden del sidecar.
export function splitProjectsByTab(
  projects: VideoProjectListItem[],
): Record<LibraryTab, VideoProjectListItem[]> {
  const byTab: Record<LibraryTab, VideoProjectListItem[]> = {
    long: [],
    shorts: [],
  }
  for (const project of projects)
    byTab[libraryTabFor(project.videoFormat)].push(project)
  return byTab
}

// Lectura tolerante: un valor desconocido o un storage inaccesible caen a la
// pestaña por defecto.
export function readLibraryTab(): LibraryTab {
  try {
    const raw = localStorage.getItem(LIBRARY_TAB_STORAGE_KEY)
    return isLibraryTab(raw) ? raw : DEFAULT_LIBRARY_TAB
  } catch {
    return DEFAULT_LIBRARY_TAB
  }
}

export function rememberLibraryTab(tab: LibraryTab): void {
  try {
    localStorage.setItem(LIBRARY_TAB_STORAGE_KEY, tab)
  } catch {
    console.log(
      'No se pudo guardar la pestaña de la biblioteca en localStorage',
    )
  }
}

function isLibraryTab(value: string | null): value is LibraryTab {
  return value === 'long' || value === 'shorts'
}
