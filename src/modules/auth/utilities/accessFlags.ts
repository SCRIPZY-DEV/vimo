import type {
  AccessFeatures,
  AccessFlags,
  VerifyAccessResponse,
} from '@/modules/auth/types/access'

// Flags del veredicto de vimo.click, normalizados: solo un `true` explícito
// enciende. Un servidor viejo sin `admin` ni `features`, o uno a medio
// desplegar que los manda incompletos, deja todo apagado y la app se comporta
// como antes (ADR-0048). Puro, solo con `import type`: lo corre
// scripts/test/check-app-access-flags.mjs con Node.

export function normalizeAccessFeatures(
  features: Partial<AccessFeatures> | undefined,
): AccessFeatures {
  return {
    gemTemplate: features?.gemTemplate === true,
    newCatalog: features?.newCatalog === true,
    remoteCatalog: features?.remoteCatalog === true,
  }
}

export function accessFlagsFrom(
  response: Pick<VerifyAccessResponse, 'demo' | 'admin' | 'features'>,
): AccessFlags {
  return {
    demo: response.demo === true,
    admin: response.admin === true,
    features: normalizeAccessFeatures(response.features),
  }
}

// Lo que se guarda en localStorage: los flags de ESTE correo.
export function serializeRememberedAccess(
  email: string,
  flags: AccessFlags,
): string {
  return JSON.stringify({ email, ...flags })
}

// El veredicto sin red (ADR-0006) no puede inventar flags: valen los últimos
// recibidos para ESTE correo. Otro correo, nada guardado o algo ilegible: todo
// apagado. Una memoria anterior a ADR-0048 (solo `demo`) sigue valiendo.
export function parseRememberedAccess(
  raw: string | null,
  email: string | null,
): AccessFlags {
  const nothing = accessFlagsFrom({})
  if (!email || !raw) return nothing

  try {
    const memory: unknown = JSON.parse(raw)
    if (typeof memory !== 'object' || memory === null) return nothing
    if (Reflect.get(memory, 'email') !== email) return nothing

    return accessFlagsFrom({
      demo: Reflect.get(memory, 'demo'),
      admin: Reflect.get(memory, 'admin'),
      features: Reflect.get(memory, 'features'),
    })
  } catch {
    return nothing
  }
}
