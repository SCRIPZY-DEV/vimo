import { MODULE_API_KEY_REQUIREMENTS } from '@/modules/api-keys/constants'
import { useRequiredApiKeys } from '@/modules/api-keys/hooks/useRequiredApiKeys'
import { avatarsApi } from '@/modules/avatars/api'

// Si la vista puede hablar con HeyGen: en la app nativa (el sidecar) y con la
// clave de HeyGen guardada. Es la condición de los botones de la vista, del
// saldo, de las vistas previas remotas del panel de un avatar y de «Crear
// escenario», escrita una sola vez. Mientras el llavero responde,
// `canUseHeyGen` es falso sin acusar una clave que quizás está: `missingKey`
// (para el aviso) solo es verdadero cuando ya se sabe que falta.
export function useHeyGenAccess() {
  const { missingKeys, ready } = useRequiredApiKeys({
    requirements: MODULE_API_KEY_REQUIREMENTS.avatars,
  })

  return {
    canUseHeyGen: avatarsApi.isNative() && ready,
    missingKey: missingKeys,
  }
}
