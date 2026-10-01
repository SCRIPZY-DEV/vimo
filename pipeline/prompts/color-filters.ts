import { COLOR_FILTER_IDS, type ColorFilterId } from '../types/styles.ts'

// Presets de color de un estilo (spec §5.5, decisión F5): el filtro de FFmpeg
// que el render le aplica al video final. Los filtros se copiaron tal cual de
// `VISUAL_STYLES` (Fantasía mágica y Terror); el guard check-gem-color-filters
// verifica que no se separen mientras los dos existan.
export const COLOR_FILTERS: Readonly<Record<ColorFilterId, string>> = {
  none: '',
  fantasy: 'eq=saturation=1.25:brightness=0.03:gamma=1.05',
  'horror-bw': "format=gray,curves=master='0/0 0.4/0.3 1/0.95',eq=contrast=1.1",
}

// El filtro de un preset. Ausente (gemas y proyectos previos) o desconocido
// (un project.json editado a mano) = sin ajuste de color, como siempre.
export function colorFilterFor(id: string | undefined): string {
  const preset = COLOR_FILTER_IDS.find((candidate) => candidate === id)
  return preset ? COLOR_FILTERS[preset] : ''
}
