/**
 * Lo que devuelve el servidor de Vite en dev cuando la app le pide el código
 * del login (AUTH_DEV_CALLBACK_PATH): null mientras el navegador no volvió.
 */
export interface DevAuthCallbackResponse {
  code: string | null
}
