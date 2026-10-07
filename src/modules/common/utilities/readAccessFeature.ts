import type { AccessFeatureName } from '@/modules/common/types/accessFeatures'

// Lee un interruptor del veredicto cacheado sin conocer su forma entera (es de
// auth). Sin veredicto, sin `features` o con algo que no sea `true`: apagado.
// Puro: lo corre scripts/test/check-app-access-flags.mjs con Node.
export function readAccessFeature(
  verdict: unknown,
  name: AccessFeatureName,
): boolean {
  if (typeof verdict !== 'object' || verdict === null) return false

  const features: unknown = Reflect.get(verdict, 'features')
  if (typeof features !== 'object' || features === null) return false

  return Reflect.get(features, name) === true
}
