import type { Session } from '@supabase/supabase-js'
import { onOpenUrl } from '@tauri-apps/plugin-deep-link'
import { openUrl } from '@tauri-apps/plugin-opener'
import { supabase } from '@/modules/common/supabase/client'
import { isNative } from '@/modules/common/utilities/isNative'
import {
  AUTH_DEEP_LINK_URL,
  AuthRoutesPaths,
  SESSION_TIMEOUT_MS,
  SIGN_OUT_TIMEOUT_MS,
  VERIFY_ACCESS_URL,
  VERIFY_TIMEOUT_MS,
} from '../constants'
import type { AccessStatus, VerifyAccessResponse } from '../types/access'

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      window.setTimeout(() => resolve(fallback), ms)
    }),
  ])
}

function clearSupabaseStorage(): void {
  const keys = Object.keys(window.localStorage)
  for (const key of keys) {
    if (key.startsWith('sb-') || key.includes('supabase')) {
      window.localStorage.removeItem(key)
    }
  }
}

export const authApi = {
  isNative() {
    return isNative()
  },
  async getSession(): Promise<Session | null> {
    const result = await withTimeout(
      supabase.auth.getSession(),
      SESSION_TIMEOUT_MS,
      { data: { session: null }, error: null },
    )
    return result.data.session
  },
  async signInWithGoogleWeb(): Promise<void> {
    // GoTrue coloca ?code= en la query (antes del fragmento), así que
    // detectSessionInUrl lo consume y el hash router renderiza #/auth/callback.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/#${AuthRoutesPaths.callback}`,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    })
    if (error) {
      throw error
    }
    return
  },
  async signInWithGoogleDesktop(): Promise<void> {
    // En Tauri el webview no puede recibir el redirect: se abre el consent en
    // el navegador del sistema y el retorno llega por deep link (vimo://).
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: AUTH_DEEP_LINK_URL,
        skipBrowserRedirect: true,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    })
    if (error) {
      throw error
    }
    if (!data.url) {
      throw new Error('Supabase did not return an OAuth URL')
    }
    return openUrl(data.url)
  },
  async subscribeToAuthCallback(
    onCode: (code: string) => void,
  ): Promise<() => void> {
    // El code PKCE vuelve como vimo://auth/callback?code=...; el code_verifier
    // ya quedó en el storage del webview cuando se llamó signInWithOAuth.
    return onOpenUrl((urls) => {
      for (const url of urls) {
        const code = new URL(url).searchParams.get('code')
        if (code) {
          onCode(code)
          return
        }
      }
    })
  },
  async exchangeCodeForSession(code: string): Promise<void> {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      throw error
    }
    return
  },
  async verifyAccess(): Promise<AccessStatus> {
    const session = await this.getSession()
    const email = session?.user.email ?? null
    const metadata = session?.user.user_metadata as
      { full_name?: string; avatar_url?: string } | undefined
    const name = metadata?.full_name ?? null
    const avatar = metadata?.avatar_url ?? null
    if (!session?.access_token) {
      return {
        authorized: false,
        reason: 'sin-token',
        plan: null,
        daysLeft: null,
        trialExpiresAt: null,
        email,
        name,
        avatar,
      }
    }
    try {
      const response = await fetch(VERIFY_ACCESS_URL, {
        // fetch directo a propósito: el fetcher común es sidecar-only (ADR-0006).
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      })
      const body = (await response.json()) as VerifyAccessResponse
      return {
        authorized: body.autorizado,
        reason: body.motivo,
        plan: body.plan ?? null,
        daysLeft: body.diasRestantes ?? null,
        trialExpiresAt: body.trialExpira ?? null,
        email,
        name,
        avatar,
      }
    } catch {
      // Fail-open deliberado (regla del origen): sin red o con el server caído
      // se asume acceso vigente para no bloquear el trabajo local del usuario.
      return {
        authorized: true,
        reason: 'offline',
        plan: null,
        daysLeft: null,
        trialExpiresAt: null,
        email,
        name,
        avatar,
      }
    }
  },
  async signOut(): Promise<void> {
    await withTimeout(
      supabase.auth.signOut({ scope: 'local' }).then(() => undefined),
      SIGN_OUT_TIMEOUT_MS,
      undefined,
    )
    clearSupabaseStorage()
    return
  },
}
