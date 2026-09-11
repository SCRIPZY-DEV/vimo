import { providerLabel } from '@/modules/api-keys/utilities/providerLabel'
import type { ApiKeyRequirement } from '../types/provider'

// «Fal.ai o Evolink»: marcas del requisito unidas por el conector traducido.
export function requirementLabel(
  requirement: ApiKeyRequirement,
  connector: string,
) {
  return requirement.map(providerLabel).join(` ${connector} `)
}
