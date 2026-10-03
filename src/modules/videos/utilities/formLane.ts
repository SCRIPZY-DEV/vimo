import type { CreateFormValue, FormLane } from '@/modules/videos/types/create'

type LaneChoice = Pick<CreateFormValue, 'styleSource' | 'customStyle'>

// Por qué carril sale el video. La pestaña Mi estilo es siempre `custom`; en
// la pestaña Catálogo, un estilo elegido con id de catálogo es una gema del
// catálogo nuevo (Entrega 2) y cualquier otra cosa sigue por el catálogo viejo
// (sin el interruptor, en la demo o sin elegir). Puro: lo corre
// scripts/test/check-app-catalog-style.mjs con Node.
export function laneOf(form: LaneChoice): FormLane {
  if (form.styleSource === 'custom') return 'custom'
  if (form.customStyle?.catalogStyleId) return 'catalog-gem'
  return 'legacy-catalog'
}
