# ADR-0006 — Autenticación: doble flujo OAuth (web/deep link) y gate por loaders del router

- **Estado:** Aceptada
- **Fecha:** 2026-08-13
- **Área:** app
- **Enmendada:** 2026-09-30, con la
  [ADR-0048](ADR-0048-gemas-por-secciones-y-agente-reconstructor.md) (ver
  «Enmiendas»).

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
    `src/modules/auth/api/index.ts` (fuera de `common/supabase`), desde la
    ADR-0038 `src/modules/diagnostics/api/index.ts` y, desde la enmienda
    2026-09-30, `src/modules/common/fetcher/vimoServer.ts`.
  - `grep -rln "vimoServerFetch" src/ --include="*.ts*"` → solo
    `src/modules/common/fetcher/vimoServer.ts` y los `api/index.ts` de los módulos
    (el primero, `src/modules/videos/api/index.ts`).
  - `grep -rn "https://vimo.click" src/ --include="*.ts*"` → la URL base en
    `src/modules/common/constants.ts` y el enlace de descarga del instalador en
    `src/modules/settings/constants.ts` (una página, no un endpoint).
  - `grep -rn "fetch(" src/modules/auth` → solo `api/index.ts` (la excepción).
  - `grep -rn "isTauri" src/` → solo `api/index.ts`.
  - `grep -rn "commonQueryKeys.access" src/ --include="*.ts*"` → solo
    `src/modules/auth/constants.ts` y `src/modules/common/hooks/useAccessFeature.ts`
    (enmienda 2026-09-30): nadie más arma la clave del veredicto.
  - `node --test scripts/test/check-app-access-flags.mjs` y
    `node --test scripts/test/check-app-vimo-server.mjs` en verde.
- **Flujo web (manual):** `pnpm dev` sin sesión → `/` rebota a login → Google →
  `/create`; cuenta fuera de allowlist → `/access-denied` con email real; «Cambiar de
  cuenta» → login; sin red → entra con motivo `offline`.
- **Flujo deep link (manual):** Windows/Linux `pnpm tauri dev` (macOS: bundle
  instalado) → botón abre el navegador del sistema → retorno `vimo://` → `/create`.
- **Regresión típica:** una vista importando `supabase` o llamando `fetch`; un loader
  con su propio array de query key en lugar de `authQueryKeys.access`; un módulo que
  importa `authQueryKeys` o `AccessStatus` para leer un interruptor en vez de
  `useAccessFeature`; un hook o componente que llama a `vimoServerFetch` (o a `fetch`
  contra vimo.click) en vez de pasar por el `api/` de su módulo.

## Enmiendas

### 2026-09-30 — Interruptores del veredicto y cómo los lee otro módulo

Con la [ADR-0048](ADR-0048-gemas-por-secciones-y-agente-reconstructor.md), el
veredicto suma `admin` (solo para los correos de la tabla `admins`) y `features`
(`gemTemplate` y `newCatalog`): interruptores de salida que vimo.click enciende para
nadie, para los admins o para todos, sin sacar versión de la app.

- **Normalización.** `verifyAccess` los pasa por `accessFlagsFrom`
  (`src/modules/auth/utilities/accessFlags.ts`): solo un `true` explícito enciende.
  Un servidor viejo sin `admin` ni `features`, o uno a medio desplegar, deja todo
  apagado y la app sigue como antes.
- **Sin red.** Como `demo` (ADR-0029), `demo`, `admin` y `features` se recuerdan por
  correo (`accessFlagsMemory.ts`, que reemplaza a `demoAccessMemory.ts` y conserva su
  clave `vimo:demo:access:v1` para no perder lo ya recordado) y el veredicto
  `offline` los reutiliza. Otro correo no los hereda.
- **Lectura desde otro módulo.** La clave del veredicto sube a `common`
  (`commonQueryKeys.access`; `authQueryKeys.access` apunta a la misma, así que los
  loaders y `useAccess` no cambian). Un módulo que no es `auth` lee un interruptor
  con `useAccessFeature(nombre)` (`src/modules/common/hooks/useAccessFeature.ts`): lee
  el caché que ya pobló el loader del layout (`queryFn: skipToken`, como el `Sidebar`
  con `demo`), nunca verifica y no importa tipos ni hooks de `auth`. `common` conoce
  solo los nombres (`AccessFeatureName`); la forma del veredicto sigue siendo de
  `auth` (`AccessFeatures`). Un interruptor nuevo se suma en los dos lugares: si falta
  en `common`, el módulo que lo pide no compila; si falta en `auth`, se lee apagado.
- **Descartado.** Importar `authQueryKeys` y `AccessStatus` desde `videos` como hace el
  `Sidebar` (un layout puede importar constantes de un módulo; otro módulo, solo sus
  rutas); leer el loader del layout con `useRouteLoaderData` (`requireAuthLoader`
  devuelve `null`, no se revalida al navegar entre rutas hijas y el tipo seguiría
  siendo de `auth`); pasar el interruptor por props (es configuración global: se lee
  donde se usa).

### 2026-09-30 — Cliente de vimo.click en `common`

El agente reconstructor de gemas (ADR-0048) es el segundo endpoint de vimo.click que
usa la app. En vez de otra excepción de `fetch` por módulo hay un cliente único,
`vimoServerFetch` (`src/modules/common/fetcher/vimoServer.ts`): el tercer transporte
del borde con el exterior, junto a `fetcher.ts` y `pipeline.ts`.

- Adjunta `Authorization: Bearer <access_token>` de la sesión de Supabase
  (`common/supabase/client`). Sin sesión, el pedido viaja sin ese encabezado y el
  servidor responde `401 sin-token`.
- La URL base vive en `src/modules/common/constants.ts` (`VIMO_SERVER_BASE_URL`;
  `VERIFY_ACCESS_URL` de `auth` se arma con ella). La ruta de cada endpoint va en el
  `constants.ts` de su módulo.
- Cada pedido tiene su tope (`timeoutMs`; por defecto `VIMO_SERVER_TIMEOUT_MS`, 15 s;
  el agente usa 150 s), que cubre también la lectura de la sesión.
- Falla siempre con `VimoServerError` (`src/modules/common/fetcher/vimoServerError.ts`):
  `kind` `network`, `timeout` o `http`, con `status`, el `code` del cuerpo y
  `retryAfterSeconds`. `vimoServerErrorCode` da el código estable que cada módulo
  traduce en su `constants.ts`.
- Solo lo llama el `api/` de un módulo (el primero, `videos/api`).
- **Excepción ampliada:** el SDK de Supabase y `fetch` directo se permiten en
  `auth/api`, en `diagnostics/api` (ADR-0038) y en este cliente. `verifyAccess` sigue
  con su `fetch` propio en `auth/api`: es fail-open y recuerda flags, dos cosas que el
  cliente común no hace.

## Referencias

- ADR-0005 (gate por composición en el router), ADR-0007 (futuro del backend local).
- ADR-0040 (el trial no vence durante la beta: el veredicto `trial` llega sin fechas ni
  días restantes).
- Origen portado: `caracteristicas/gestion-de-licencias/` de `02-vimo/cursor-video`
  (`useAcceso.ts`, `supabase.ts`, `PantallaCallback.tsx`).
- Docs Tauri: plugins `deep-link` y `opener`.
