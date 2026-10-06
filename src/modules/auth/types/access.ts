/**
 * Motivos que devuelve el endpoint de verificación. Los literales están en
 * español a propósito: son el contrato del server (vimo.click) y se comparan
 * tal cual llegan.
 * TODO: Esto tambien se deberia cambiar a ingles, pero hay que coordinarlo con el server.
 */
export type AccessReason =
  | 'ok'
  | 'sin-token'
  | 'token-invalido'
  | 'no-en-allowlist'
  | 'trial-expirado'
  | 'error-interno'
  | 'offline'

//TODO: Esto debe coincidir con el tipo de plan que devuelve supabase. Cambiar a ingles.
// «trial» es acceso beta sin vencimiento (ADR-0040): el servidor no envía fechas
// ni días restantes.
export type AccessPlan = 'trial' | 'activo'

/**
 * Interruptores de salida (ADR-0048): vimo.click decide para quién se encienden
 * (`off`, `admins` o `all`) sin sacar versión de la app. Otros módulos los leen
 * por nombre con `useAccessFeature` (common): uno nuevo se suma acá y en
 * `AccessFeatureName` (ADR-0006, enmienda 2026-09-30).
 */
export interface AccessFeatures {
  gemTemplate: boolean
  newCatalog: boolean
  // Entrega 3 (ADR-0049): el catálogo vive en el servidor y lo administra el
  // admin desde la app. Vale solo junto con `newCatalog`.
  remoteCatalog: boolean
}

/** Cuerpo crudo que responde POST /api/verificar-acceso. */
export interface VerifyAccessResponse {
  autorizado: boolean
  motivo: AccessReason
  plan?: AccessPlan
  // Modo demo (ADR-0029): true para administradores y correos en demo_accesos.
  demo?: boolean
  // Solo llega, en true, para los correos de la tabla `admins`.
  admin?: boolean
  // Un servidor viejo o a medio desplegar puede no mandarlo, o mandarlo
  // incompleto: lo que falta cuenta como apagado.
  features?: Partial<AccessFeatures>
}

/** Veredicto normalizado que cachea TanStack y consumen guards y vistas. */
export interface AccessStatus {
  authorized: boolean
  reason: AccessReason
  plan: AccessPlan | null
  email: string | null
  name: string | null
  avatar: string | null
  // Muestra la entrada «Demo» del sidebar. Sin red, vale el último valor
  // recordado para este correo (el pack ya está en disco y nada se gasta).
  demo: boolean
  admin: boolean
  /** Ausente o incompleto en la respuesta = false. */
  features: AccessFeatures
}

// Lo que se recuerda por correo para el veredicto sin red (ADR-0029, ADR-0048).
export type AccessFlags = Pick<AccessStatus, 'demo' | 'admin' | 'features'>
