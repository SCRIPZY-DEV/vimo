# ADR-0006 — Autenticación: doble flujo OAuth (web/deep link) y gate por loaders del router

- **Estado:** Aceptada
- **Fecha:** 2026-08-13
- **Área:** app

## Problema

La app original hacía OAuth con Google vía Supabase redirigiendo a
`window.location.origin/auth/callback`. Eso funciona en un navegador, pero en el Tauri
empaquetado ese origin no es una URL a la que Google/Supabase puedan volver. Además, el
gate de acceso del origen era un componente (`GateDeAcceso`) que devolvía pantallas
según el estado — patrón ya descartado en la ADR-0005: acá la autorización se decide en
el router, no en la presentación. Había que fijar cómo entra la sesión en cada entorno
y cómo se compone el gate.

## Decisión

**1. Doble flujo OAuth, bifurcado con `isTauri()`** (envuelto como `authApi.isNative()`):

- **Web** (`pnpm dev`, navegador): `signInWithOAuth` con
  `redirectTo: ${origin}/#/auth/callback`. GoTrue coloca `?code=` en la query (antes del
  fragmento), `detectSessionInUrl: true` lo intercambia solo, y la vista `Callback`
  espera la sesión con polling de `getSession()` (100 ms × 40, como el origen).
- **Tauri**: `skipBrowserRedirect: true` + apertura del consent en el **navegador del
  sistema** (plugin `opener`); el retorno llega por **deep link** `vimo://auth/callback`
  (plugin `deep-link`, scheme `vimo`) con el `?code=`, y el hook `useLogin` hace
  `exchangeCodeForSession(code)`. El listener vive en `useLogin` porque el flujo
  siempre nace en la vista Login. En macOS el deep link solo funciona con la app
  empaquetada (Info.plist); en Windows/Linux `register_all()` lo habilita en dev.

**2. Verificación de acceso portada del origen**: POST a
`https://vimo.click/api/verificar-acceso` con `Authorization: Bearer <access_token>`.
Solo `no-en-allowlist` y `trial-expirado` bloquean; red caída, timeout o
`error-interno` son **fail-open** (`offline`) para no bloquear el trabajo local.

**3. Gate como composición en el router** (cumple ADR-0005): tres loaders en
`src/modules/auth/guards.ts` — `requireAuthLoader` (rama autenticada),
`guestOnlyLoader` (login/callback), `accessDeniedLoader` (access-denied exige sesión
bloqueada). Comparten veredicto vía `queryClient.fetchQuery` con
`authQueryKeys.access` y `staleTime` de 5 min: los loaders y el hook `useAccess()` de
las vistas usan la misma clave, así que verificar una vez alcanza para todos. Esto
obligó a extraer el `queryClient` a `src/modules/common/queryClient.ts`.

**4. Excepción acotada al fetcher**: el `fetcher` común es sidecar-only, así que
`authApi.verifyAccess()` usa `fetch` directo con la URL en `constants.ts` del módulo.
La excepción vive únicamente en el `api/` — la única capa autorizada a hablar con el
exterior (regla nueva en CLAUDE.md).

**5. `onAuthStateChange` no se porta**: con gate por loaders no hace falta suscripción
reactiva — los loaders re-corren en cada navegación y el logout navega él mismo. El
origen además ignoraba `TOKEN_REFRESHED`/`USER_UPDATED` a propósito.

### Forma

```
/            Splash: espera el doodle → navigate(/create)
/create      requireAuthLoader: sin sesión → /login · bloqueado → /access-denied
/login       guestOnlyLoader: sesión autorizada → /create
/auth/callback  guestOnlyLoader + polling de sesión (solo flujo web)
/access-denied  accessDeniedLoader: sin sesión → /login · autorizado → /create
```

**Configuración manual requerida** (Supabase Dashboard → Auth → URL Configuration →
Redirect URLs): `vimo://auth/callback`, `http://localhost:5173/#/auth/callback` y
`http://localhost:5173/**` (comodín doble: el fragmento contiene `/`).

## Alternativas consideradas

- **Solo deep link** — descartada: en macOS no funciona en dev sin empaquetar; el
  flujo web mantiene el ciclo de desarrollo rápido en navegador.
- **Loopback server local para el retorno OAuth** (`tauri-plugin-oauth`) — descartada:
  un tercer proceso escuchando en un puerto para algo que el deep link resuelve sin
  servidor.
- **Redirect web a `${origin}/` pelado** (el Splash absorbe el `?code=`) — queda como
  **plan B** de una línea en `authApi.signInWithGoogleWeb` si el allowlist de Supabase
  rechazara la URL con fragmento.
- **Guard-componente como el origen** — ya descartada en ADR-0005.
- **Verificar acceso contra Supabase directo** — descartada: la lógica de
  allowlist/trial vive en el edge de vimo.click y no se duplica en el cliente.

## Consecuencias

- ✅ Login real en ambos entornos con una sola vista Login; la bifurcación está en un
  único punto (`useLogin` → `authApi`).
- ✅ El patrón loaders + TanStack queda instaurado como referencia para los próximos
  módulos (primeras query keys del repo: `authQueryKeys`).
- ⚠️ El deep link con la app **cerrada** (cold start) no está manejado: el listener
  vive en Login montado. Pendiente para la fase de empaquetado.
- ⚠️ `verifyAccess` es fail-open: sin red se entra igual (decisión heredada del
  origen; la defensa real será server-side cuando exista backend).
- 🔒 La vista `Callback` no es alcanzable desde ningún `<Link>` (se entra por redirect
  externo): excepción documentada a la regla de vistas alcanzables.

## Verificación de cumplimiento

- **Build/lint:** `pnpm format && pnpm lint && pnpm build` en verde.
- **Greps ejecutables:**
  - `grep -rln "supabase/client" src/ --include="*.ts*"` → solo
    `src/modules/auth/api/index.ts` (fuera de `common/supabase`) y, desde la
    ADR-0038, `src/modules/diagnostics/api/index.ts`.
  - `grep -rn "fetch(" src/modules/auth` → solo `api/index.ts` (la excepción).
  - `grep -rn "isTauri" src/` → solo `api/index.ts`.
- **Flujo web (manual):** `pnpm dev` sin sesión → `/` rebota a login → Google →
  `/create`; cuenta fuera de allowlist → `/access-denied` con email real; «Cambiar de
  cuenta» → login; sin red → entra con motivo `offline`.
- **Flujo deep link (manual):** Windows/Linux `pnpm tauri dev` (macOS: bundle
  instalado) → botón abre el navegador del sistema → retorno `vimo://` → `/create`.
- **Regresión típica:** una vista importando `supabase` o llamando `fetch`; un loader
  con su propio array de query key en lugar de `authQueryKeys.access`.

## Referencias

- ADR-0005 (gate por composición en el router), ADR-0007 (futuro del backend local).
- Origen portado: `caracteristicas/gestion-de-licencias/` de `02-vimo/cursor-video`
  (`useAcceso.ts`, `supabase.ts`, `PantallaCallback.tsx`).
- Docs Tauri: plugins `deep-link` y `opener`.
