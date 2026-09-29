import { SECONDS_PER_MINUTE } from '@/modules/videos/constants'
import type { CreateFormValue } from '@/modules/videos/types/create'

// En Crear todavía no existe una duración medida del audio: se cotiza el
// primer minuto completo. El pipeline ajusta la cobertura al audio real.
// Los borradores antiguos no pueden ampliar este presupuesto con N minutos
// o «todo el video», opciones que solo se ofrecen desde el editor.
export function estimateAnimationSeconds(form: CreateFormValue): number {
  if (!form.animateScenes) return 0

  return SECONDS_PER_MINUTE
}
