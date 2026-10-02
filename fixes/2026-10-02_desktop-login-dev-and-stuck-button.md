# Fix: el login con Google vuelve a la app en dev y el botón nunca queda trabado

- **Fecha:** 2026-10-02
- **Rama:** feat/catalogo-estilos

## Causa

Dos problemas en el inicio de sesión de escritorio (ADR-0006).

1. **En `pnpm tauri dev` el login no volvía a la app.**
   - El navegador del sistema termina en `vimo://auth/callback?code=…`.
   - En macOS ese enlace solo lo registra la app empaquetada (Info.plist). En esta Mac lo abre
     `/Applications/Vimo.app`, la versión instalada, y no la instancia de dev.
   - La instancia de dev nunca recibía el código. La instalada tampoco podía usarlo, porque el
     verificador PKCE está en el storage del webview de dev.
   - La ADR-0006 lo registraba como limitación: «en dev el retorno OAuth requiere la app
     empaquetada e instalada».
2. **El botón quedaba trabado en «Abriendo Google...» en cualquier versión.**
   - `useLogin` ponía `opening` en `true` al tocarlo y solo lo volvía a `false` con un error o al
     entrar.
   - Si el retorno no llegaba (pestaña cerrada, el caso de dev, otra Vimo instalada que se queda
     con el enlace), el botón quedaba deshabilitado y la única salida era reiniciar la app.

## Corrección

- **Retorno en dev** (`import.meta.env.DEV`):
  - `signInWithGoogleDesktop` pide volver a `http://localhost:5173/auth/desktop-callback`. Ya está
    permitido por `http://localhost:5173/**` en el allowlist de Supabase, así que no hubo que cambiar
    nada en Supabase.
  - Un plugin de `vite.config.ts` (`devAuthCallback`, solo en el servidor de dev) recibe el regreso
    del navegador: guarda el código y muestra «Listo: ya podés volver a Vimo», o un aviso si Supabase
    volvió con error.
  - `subscribeToAuthCallback` le pide el código a ese mismo servidor cada segundo
    (`AUTH_DEV_CALLBACK_PATH`, `AUTH_DEV_CALLBACK_POLL_MS`). El servidor lo entrega una sola vez, y
    la app lo canjea con el verificador PKCE de su propio storage.
  - En producción no cambia nada: deep link `vimo://` como siempre.
- **Botón:**
  - `useLogin` separa `opening` (el navegador se está abriendo) de `waiting` (ya se abrió). Al
    abrirse el navegador el botón vuelve a estar disponible para reintentar.
  - La vista muestra «Terminá de iniciar sesión en el navegador: Vimo se abre solo. Si no volvió,
    tocá el botón de nuevo.».
  - Texto nuevo `login.esperando` en es, en y pt.

## Límites deliberados

- El retorno de dev no es un servidor nuevo: usa el de Vite, que ya corre en dev. La ADR-0006 había
  descartado un loopback aparte («un tercer proceso escuchando en un puerto»). Queda como nota en
  esa ADR.
- El arranque en frío por deep link (la app cerrada cuando vuelve el navegador) sigue como lo dejó
  la ADR-0006: pendiente.
- Reintentar abre un consentimiento nuevo con su propio verificador. Si después llega el código del
  intento anterior, el canje falla y se ve el error de siempre: se vuelve a tocar el botón.

## Validación reproducible

```bash
pnpm dev --port 5199 --strictPort &
B=http://localhost:5199/auth/desktop-callback
curl -s $B/code                       # {"code":null}
curl -s "$B?code=prueba123"           # «Listo: ya podés volver a Vimo.»
curl -s $B/code                       # {"code":"prueba123"}
curl -s $B/code                       # {"code":null}: se entrega una sola vez
curl -s "$B?error=access_denied"      # «No se pudo iniciar sesión…»
pnpm check:locales && pnpm lint && pnpm build
```

## Pruebas manuales

Pendiente del dueño, con `pnpm tauri dev` en la Mac:

1. Iniciar sesión con Google: el navegador termina en «Listo: ya podés volver a Vimo» y la app entra
   sola a Crear.
2. Tocar el botón, cerrar la pestaña del navegador sin terminar y volver a la app: el botón está
   disponible, con el aviso de que se puede reintentar.
