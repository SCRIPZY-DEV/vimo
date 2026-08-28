import { API_KEY_PROVIDERS } from '@/modules/api-keys/providers'
import type { ApiKeyRequirement } from '../types/provider'

// «Fal.ai o Evolink»: marcas del requisito unidas por el conector traducido.
export function requirementLabel(
  requirement: ApiKeyRequirement,
  connector: string,
) {
  return requirement
    .map(
      (id) =>
        API_KEY_PROVIDERS.find((provider) => provider.id === id)?.label ?? id,
    )
    .join(` ${connector} `)
}
