import type { Session } from '@supabase/supabase-js'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { onOpenUrl } from '@tauri-apps/plugin-deep-link'
import { openUrl } from '@tauri-apps/plugin-opener'
import { supabase } from '@/modules/common/supabase/client'
import { isNative } from '@/modules/common/utilities/isNative'
import {
  AUTH_DEEP_LINK_URL,
  AUTH_DEV_CALLBACK_PATH,
  AUTH_DEV_CALLBACK_POLL_MS,
  AuthRoutesPaths,
  SESSION_TIMEOUT_MS,
  SIGN_OUT_TIMEOUT_MS,
  VERIFY_ACCESS_URL,
  VERIFY_TIMEOUT_MS,
} from '../constants'
import { accessFlagsFrom } from '@/modules/auth/utilities/accessFlags'
import {
  recallAccessFlags,
  rememberAccessFlags,
} from '@/modules/auth/utilities/accessFlagsMemory'
import type {
  AccessStatus,
  VerifyAccessResponse,
} from '@/modules/auth/types/access'
import type { DevAuthCallbackResponse } from '@/modules/auth/types/login'

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
    // el navegador del sistema y el retorno llega por deep link (vimo://). En
    // dev vuelve al servidor de Vite: el deep link de macOS solo llega a la
    // app empaquetada (AUTH_DEV_CALLBACK_PATH).
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: import.meta.env.DEV
          ? `${window.location.origin}${AUTH_DEV_CALLBACK_PATH}`
          : AUTH_DEEP_LINK_URL,
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
    // Con el código en mano la app pasa al frente: la persona terminó en el
    // navegador y no tiene que volver a mano. Con el deep link macOS ya la
    // activa; en dev, con el retorno por Vite, nadie lo haría. Si el sistema
    // no deja enfocar, el canje sigue igual.
    const deliver = (code: string) => {
      void getCurrentWindow()
        .setFocus()
        .catch(() => undefined)
      onCode(code)
    }
    // El code PKCE vuelve como vimo://auth/callback?code=...; el code_verifier
    // ya quedó en el storage del webview cuando se llamó signInWithOAuth.
    const unlisten = await onOpenUrl((urls) => {
      for (const url of urls) {
        const code = new URL(url).searchParams.get('code')
        if (code) {
          deliver(code)
          return
        }
      }
    })
    if (!import.meta.env.DEV) return unlisten

    // En dev el code vuelve al servidor de Vite (signInWithGoogleDesktop):
    // la app, que corre en ese mismo origen, se lo pide cada segundo.
    const poll = window.setInterval(() => {
      void fetch(`${AUTH_DEV_CALLBACK_PATH}/code`)
        .then((response) => response.json() as Promise<DevAuthCallbackResponse>)
        .then(({ code }) => {
          if (code) deliver(code)
        })
        .catch(() => undefined)
    }, AUTH_DEV_CALLBACK_POLL_MS)
    return () => {
      window.clearInterval(poll)
      unlisten()
    }
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
        email,
        name,
        avatar,
        ...accessFlagsFrom({}),
      }
    }
    try {
      const response = await fetch(VERIFY_ACCESS_URL, {
        // fetch directo a propósito: el veredicto es fail-open y recuerda sus
        // flags, dos cosas que vimoServerFetch no hace (ADR-0006).
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      })
      const body = (await response.json()) as VerifyAccessResponse
      // Demo, admin e interruptores: solo un true explícito enciende (un
      // servidor viejo sin `features` deja todo apagado) y se recuerdan por
      // correo para el modo sin red (ADR-0029, ADR-0048).
      const flags = accessFlagsFrom(body)
      rememberAccessFlags(email, flags)
      return {
        authorized: body.autorizado,
        reason: body.motivo,
        plan: body.plan ?? null,
        email,
        name,
        avatar,
        ...flags,
      }
    } catch {
      // Fail-open deliberado (regla del origen): sin red o con el server caído
      // se asume acceso vigente para no bloquear el trabajo local del usuario.
      // Los flags no se inventan: valen los últimos recibidos para este correo.
      return {
        authorized: true,
        reason: 'offline',
        plan: null,
        email,
        name,
        avatar,
        ...recallAccessFlags(email),
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
