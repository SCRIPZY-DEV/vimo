// ¿La persona es admin de Vimo (correo en la tabla `admins` de vimo.click)?
// Lee el veredicto cacheado sin conocer su forma entera (es de auth), como
// readAccessFeature: solo un `true` explícito cuenta. Puro: lo corre
// scripts/test/check-app-access-flags.mjs con Node.
export function readAccessAdmin(verdict: unknown): boolean {
  if (typeof verdict !== 'object' || verdict === null) return false
  return Reflect.get(verdict, 'admin') === true
}
