# Frente C (app): Mi estilo por secciones — plan de implementación de la Entrega 1

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development
> (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los
> pasos usan casillas (`- [ ]`) para el seguimiento.

**Goal:** Que la app encienda con `features.gemTemplate` la gema por secciones de Mi estilo: el
acceso trae `admin` y los interruptores, un cliente único habla con vimo.click, el modal crea,
reconstruye y edita gemas por secciones, las gemas viejas se migran solas sin bloquear a nadie y
el proyecto viaja con las secciones.

**Architecture:** La lógica que decide (normalizar flags, clasificar fallos, leer la respuesta del
agente, límites, heurística de inglés, payloads, deduplicar pedidos) vive en módulos puros con solo
`import type`, probados con `node --test` sin bundler. La UI los consume por la cadena de siempre
(componente → hook → `api/` → `vimoServerFetch` o sidecar). `videos` lee el interruptor con un hook
de `common` que lee el veredicto cacheado, sin importar nada de `auth`. Una gema de plantilla viaja
por secciones al proyecto, a sus muestras y a «Crear personaje con mi estilo»: la app nunca arma su
texto. Sin el interruptor, todo lo que existe hoy se ve y viaja igual.

**Tech Stack:** React 19, TypeScript, Vite, Tauri 2, TanStack Query 5, i18next, Supabase JS,
`node:test` con type stripping (Node 25) y esbuild para un guard.

**Spec:** [design.md](design.md) (§4, §6.1, §7, §10 y §11) y los contratos congelados del
[plan maestro](plan.md). Se leen los dos junto con este plan.

## Global Constraints

- Este frente toca solo `src/**`, `public/locales/*.json`, los guards nuevos
  `scripts/test/check-app-*.mjs` y `docs/adr/ADR-0006-autenticacion-doble-flujo-oauth-y-gate-por-loaders.md`.
  Nada de `pipeline/`, del resto de `docs/` ni de `package.json`.
- Estado de partida: la Tarea 0 (plan del sidecar) ya está commiteada; la Tarea C6b además
  necesita la sub-tarea A8c del sidecar. Ver «Estado de partida».
- Código en inglés; comentarios y documentación en español. Sin `enum`, imports con `@/`, sin
  barriles nuevos, guard clauses, nombres completos y sin casts que el compilador no pida
  (CLAUDE.md).
- Un módulo importa de `common` y de sí mismo; de otro módulo, solo sus rutas (las excepciones ya
  declaradas del repo siguen: `settings/hooks`, `api-keys`, `voices` y el `CharacterModal` de
  `characters` en el selector de personajes, ADR-0020). Este plan no suma ninguna.
- Módulos puros: solo `import type` (Node borra esos imports al quitar tipos). Sus constantes viven
  con su lógica, como `common/utilities/promptCost.ts` (ADR-0020, decisión 4).
- `src/` importa de `pipeline/` solo tipos (`@pipeline/types/<archivo>.ts`). Los valores
  `GEM_SECTION_KEYS`, `GEM_TEMPLATE_VERSION` y `COLOR_FILTER_IDS` se espejan con una anotación
  `typeof` que rompe la compilación si divergen.
- Lint del repo: `react-hooks` 7 (sin `setState` síncrono en efectos, sin leer refs en el render,
  sin llamadas impuras en el render) y `react-refresh` (un archivo `.tsx` exporta solo componentes).
- Textos visibles: ninguno en el código. Todos en `public/locales/{es,en,pt}.json`, con la misma
  clave en los tres archivos en el mismo cambio, bajo `create.gemTemplate.*`. Castellano con voseo,
  como el resto del catálogo («Pegá tu gema»).
- Límites (spec §4.1): cada sección hasta 12 000 caracteres y la suma hasta 30 000; `character`
  hasta 700; `promptStart` y `promptEnd` hasta 600 cada una. Sin `visualStyle` no se guarda.
- Endpoint: `POST https://vimo.click/api/estilos/reconstruir` con
  `Authorization: Bearer <access_token>`; cuerpo `GemRebuildRequest`; el cliente espera 150 s y
  distingue `network` y `timeout`. Códigos del servidor: `sin-token`, `token-invalido`, `sin-acceso`,
  `funcion-desactivada`, `pedido-invalido`, `texto-invalido`, `cupo-agotado` (con
  `retryAfterSeconds`), `modelo-fallo`, `modelo-timeout` y `error-interno`.
- Acceso: `features` ausente o incompleto = `false`; `admin` ausente = `false`; sin red, los
  últimos valores recibidos para ese correo.
- Una gema tiene `sections` o `systemPrompt`, nunca los dos. Una gema vieja viaja al proyecto byte
  por byte como hoy. La sección `character` termina con una oración que empieza con «Outfit:».
- `style-save` con `sections` lleva SIEMPRE `templateVersion`: el que devolvió el agente (al preparar
  o migrar una gema) o el guardado (al editarla). Con `systemPrompt`, nunca: el sidecar lo rechaza.
- «Crear personaje con mi estilo» (`design-style-character`) recibe `gem` (gema vieja, como texto) o
  `sections` (gema de plantilla), nunca los dos; el sidecar pasa las secciones a texto sin la
  sección `character` (A8c del plan del sidecar, Tarea C6b).
- Sin `features.gemTemplate`, la UI de Mi estilo queda exactamente como hoy para toda gema sin
  secciones. Un solo modal Radix abierto a la vez; el modal guarda al cerrar; quién está abierto
  lo decide `useCustomStyleEditor`.
- Verificación permitida en cada tarea: `pnpm exec prettier --write <archivos>`,
  `pnpm exec eslint <archivos .ts/.tsx>`, `pnpm exec tsc -p tsconfig.app.json --noEmit`,
  `node --test scripts/test/<guard>` y `node scripts/test/check-locales.mjs`. Nada de `git add`,
  `git commit`, `pnpm format`, `pnpm build` ni `pnpm install`: el commit lo hace el orquestador.
- Cómo leer los pasos de código: «Crear» y «Reemplazar entero» traen el archivo completo;
  «reemplazar … por …» es un reemplazo exacto de texto, y el bloque viejo aparece una sola vez en
  el archivo tal como lo dejó la tarea anterior; «debajo de …» y «antes de …» nombran una línea
  completa y única. Cada bloque lleva `<!-- prettier-ignore -->`: `pnpm format` no los
  reformatea y los reemplazos exactos siguen valiendo.
- Commits: título en Conventional Commits en inglés; cuerpo en español (qué, por qué, con qué
  interactúa); última línea `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **Una respuesta de `verificar-acceso` sin `features`, incompleta o con valores raros**
   (`"gemTemplate": "true"`, `1`, `null`; servidor viejo o a medio desplegar): todo apagado y la
   app como hoy; sin red, lo último recibido para ese correo, nunca lo de otro correo. Lo fijan
   los casos «un servidor viejo…», «solo un true explícito…» y «memoria…» de
   `check-app-access-flags.mjs` (Tarea C1).
2. **Doble clic en «Preparar con IA», o la misma gema vieja abierta en el modal y elegida en Crear
   a la vez:** un solo pedido al agente (cada uno gasta cupo y deja una fila). Lo fijan «una sola
   ejecución en vuelo por clave» de `check-app-gem-rebuild.mjs` (C3) y «una gema vieja se manda
   una sola vez…» de `check-app-gem-migration.mjs` (C5), más el botón deshabilitado (C4b).
3. **Gema vieja con el servidor caído, sin red o con el cupo agotado:** la migración queda
   fallida con «Reintentar», no se repite sola en cada apertura y el envío de Crear sale por el
   camino viejo, byte por byte. Lo fijan «si falla queda el aviso…» (C5) y «una gema vieja viaja
   byte por byte como antes» de `check-app-custom-style-payload.mjs` (C6).
4. **`character`, `promptStart` o `promptEnd` en español o portugués:** aviso que no bloquea; un
   texto en inglés con un nombre acentuado («Sofía … Outfit: …») no avisa. Lo fijan los casos
   «inglés: …» de `check-app-gem-sections.mjs` (C4a).
5. **El interruptor vuelve a `off` con gemas de plantilla ya guardadas:** el modal las sigue
   abriendo por secciones (sin «Pegar gema nueva» ni agente), el payload las manda con sus
   secciones y las viejas no se migran. Lo fijan los casos de
   `check-app-custom-style-payload.mjs` (C6: el payload depende de lo guardado, nunca del
   interruptor) y el paso F de «QA manual».
6. **«Crear personaje con mi estilo» con una gema de plantilla:** el pedido lleva `sections` y
   nunca `gem` a la vez; una gema vieja manda su texto como antes; sin gema, el experto de la
   casa. Lo fija `check-app-style-character-gem.mjs` (C6b).

---

## Estado de partida (Tarea 0)

Este plan parte de la Tarea 0 de [plan-e1-sidecar.md](plan-e1-sidecar.md) ya commiteada (Ola 0):

- `pipeline/types/styles.ts` exporta `GemSections`, `GemSectionKey`, `GEM_SECTION_KEYS`,
  `GEM_TEMPLATE_VERSION`, `COLOR_FILTER_IDS`, `ColorFilterId` y `GemOrigin`, con los campos nuevos
  de `CustomStyleSummary`, `StyleSavePayload` y `GenerateStyleSamplesPayload` del plan maestro
  (entre ellos, `systemPrompt?` opcional y `promptModel?`).
- `pipeline/types/video-project.ts`: `ProjectCustomStyle` con `systemPrompt?`, `sections?`,
  `templateVersion?`, `colorFilter?` y `catalogStyleId?`.
- En `src/`, la Tarea 0 solo arregla lo que deja de compilar, con `?? ''`: en
  `selectedCustomStyle.ts`, en el conteo de `CustomStyleCard.tsx` y en `toDraft` y `save` de
  `CustomStyleGallery.tsx`. Este plan reescribe esos lugares.
- La Tarea C6b además parte de la sub-tarea A8c del sidecar: `DesignStyleCharacterPayload` con
  `gem?: string` y `sections?: GemSections`, excluyentes. Es la única dependencia con otro frente
  después de la Ola 0.

Este plan se ejecutó tal como está escrito, paso por paso y con un script que aplica cada
reemplazo exigiendo que su ancla sea única, sobre una copia del repo en `e50be2a1` con los tipos y
los arreglos de `src/` de la Tarea 0 (y, antes de C6b, el tipo de A8c). En cada tarea, prettier no cambió nada, eslint y
`tsc -p tsconfig.app.json` terminaron en 0 y sus guards y `check-locales` pasaron. Al final, el
eslint de todo el repo quedó en 0, `vite build` en verde y los 7 guards nuevos con 65 casos en
verde.

## Mapa de archivos

| Archivo                                                                                                                    | Tarea                 | Responsabilidad                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/auth/types/access.ts`                                                                                         | C1                    | `AccessFeatures`, `admin`/`features` en `VerifyAccessResponse` y `AccessStatus`, `AccessFlags`                                         |
| `src/modules/auth/utilities/accessFlags.ts` (nuevo, puro)                                                                  | C1                    | Normalizar flags y leer/escribir la memoria por correo                                                                                 |
| `src/modules/auth/utilities/accessFlagsMemory.ts` (nuevo; reemplaza `demoAccessMemory.ts`)                                 | C1                    | `localStorage` de los flags                                                                                                            |
| `src/modules/auth/api/index.ts`, `src/modules/auth/constants.ts`                                                           | C1, C2                | `verifyAccess` con flags; la clave del veredicto viene de `common`; URL con la base común                                              |
| `src/modules/common/constants.ts`                                                                                          | C1, C2                | `commonQueryKeys.access`, `VIMO_SERVER_BASE_URL`, `VIMO_SERVER_TIMEOUT_MS`                                                             |
| `src/modules/common/types/accessFeatures.ts` (nuevo)                                                                       | C1                    | `AccessFeatureName`                                                                                                                    |
| `src/modules/common/utilities/readAccessFeature.ts` (nuevo, puro)                                                          | C1                    | Leer un interruptor del veredicto cacheado                                                                                             |
| `src/modules/common/hooks/useAccessFeature.ts` (nuevo)                                                                     | C1                    | Hook del interruptor para cualquier módulo                                                                                             |
| `src/modules/common/types/vimoServer.ts` (nuevo)                                                                           | C2                    | Tipos del cliente de vimo.click                                                                                                        |
| `src/modules/common/fetcher/vimoServerError.ts` (nuevo, puro)                                                              | C2                    | `VimoServerError` y la clasificación de fallos                                                                                         |
| `src/modules/common/fetcher/vimoServer.ts` (nuevo)                                                                         | C2                    | `vimoServerFetch`                                                                                                                      |
| `src/modules/videos/types/gemRebuild.ts` (nuevo)                                                                           | C3                    | Contrato del agente (plan maestro)                                                                                                     |
| `src/modules/videos/utilities/gemTemplate.ts` (nuevo, puro)                                                                | C3, C4a, C5, C6b      | Espejos, límites, pedido y respuesta del agente, reglas de secciones, payloads de style-save y la gema para el diseñador de personajes |
| `src/modules/videos/utilities/singleFlight.ts` (nuevo, puro)                                                               | C3                    | Un solo pedido en vuelo por clave                                                                                                      |
| `src/modules/videos/api/index.ts`, `src/modules/videos/constants.ts`                                                       | C3, C4a               | `rebuildGem`, `gemRebuildErrorKey`, mapa de errores, textos de secciones y presets                                                     |
| `src/modules/videos/hooks/useGemRebuild.ts` (nuevo)                                                                        | C3                    | Mutación del agente                                                                                                                    |
| `src/modules/videos/components/GemRebuildErrorText.tsx` (nuevo)                                                            | C3                    | Error del agente traducido                                                                                                             |
| `src/modules/videos/types/styles.ts`                                                                                       | C4a, C5, C6, C6b      | Snapshot y borrador con secciones; tipos nuevos                                                                                        |
| `src/modules/videos/utilities/englishSections.ts` (nuevo, puro)                                                            | C4a                   | Heurística de inglés                                                                                                                   |
| `src/modules/videos/utilities/selectedCustomStyle.ts`                                                                      | C4a, C5               | Snapshot, borrador y refresco tras migrar                                                                                              |
| `src/modules/videos/hooks/useGemTemplateDraft.ts` (nuevo)                                                                  | C4b                   | Borrador de la gema de plantilla en el modal                                                                                           |
| `src/modules/videos/components/Gem*.tsx`, `ColorFilterPicker.tsx` (nuevos)                                                 | C4b, C5               | Paso de pegado, cajas, avisos, filtro y aviso de migración                                                                             |
| `src/modules/videos/components/CustomStyleModal.tsx`                                                                       | C4c, C5, C6, C6b      | Integración                                                                                                                            |
| `src/modules/videos/components/CustomStyleGallery.tsx`                                                                     | C4c, C5               | Integración                                                                                                                            |
| `src/modules/videos/utilities/gemMigrations.ts` (nuevo, puro), `hooks/useGemMigrations.ts` (nuevo)                         | C5                    | Store de migraciones                                                                                                                   |
| `src/modules/videos/views/Create/Create.tsx`                                                                               | C5                    | Refresco del snapshot en el render                                                                                                     |
| `src/modules/videos/utilities/projectCustomStyle.ts` (nuevo, puro)                                                         | C6                    | `options.customStyle`                                                                                                                  |
| `formPayload.ts`, `CustomStyleCard.tsx`, `PromptModelSection.tsx`, `useStyleCharacter.ts`, `useStyleSampleGeneration.ts`   | C6                    | Payload, cuenta, costo, chip y muestras                                                                                                |
| `src/modules/characters/types/characters.ts`, `utilities/styleDesignGem.ts` (nuevo, puro), `components/CharacterModal.tsx` | C6b                   | La gema de «Crear personaje con mi estilo»: texto o secciones                                                                          |
| `src/modules/videos/components/CharacterSection.tsx`                                                                       | C6b                   | Contexto de estilo por secciones desde Crear                                                                                           |
| `public/locales/{es,en,pt}.json`                                                                                           | C3, C4a, C4b, C4c, C5 | Grupo `create.gemTemplate`                                                                                                             |
| `docs/adr/ADR-0006-…md`                                                                                                    | C1, C2                | Enmiendas y greps de cumplimiento                                                                                                      |
| `scripts/test/check-app-*.mjs` (7 nuevos)                                                                                  | C1–C6b                | Guards                                                                                                                                 |

## Decisión: cómo lee `videos` el interruptor `gemTemplate`

- **Elegida:** la clave del veredicto sube a `common` (`commonQueryKeys.access`; auth la usa como
  `authQueryKeys.access`, mismo valor). `common` suma `useAccessFeature(name)`, que lee el caché
  con `queryFn: skipToken` (el loader del layout ya lo pobló, igual que hace el `Sidebar` con
  `demo`) y pasa el valor por `readAccessFeature`, un lector puro que no conoce la forma del
  veredicto. `common` solo conoce los nombres (`AccessFeatureName`); el tipo `AccessFeatures`
  sigue en `auth`, como congela el plan maestro. `videos` no importa nada de `auth`.
- **Descartadas:** importar `authQueryKeys` y `AccessStatus` desde `videos` como el `Sidebar` (un
  layout puede, un módulo no); `useRouteLoaderData` del layout (`requireAuthLoader` devuelve
  `null`, no se revalida al navegar entre hijas y el tipo seguiría siendo de `auth`); pasar el
  interruptor por props desde Create (es configuración global y CLAUDE.md pide leerla donde se usa).
- Va como enmienda de la ADR-0006 en la Tarea C1 (la ADR que gobierna `authQueryKeys.access`).

---

### Tarea C1: `admin` y `features` en el acceso

**Files:**

- Modify: `src/modules/auth/types/access.ts` (entero)
- Create: `src/modules/auth/utilities/accessFlags.ts`
- Create: `src/modules/auth/utilities/accessFlagsMemory.ts`
- Delete: `src/modules/auth/utilities/demoAccessMemory.ts`
- Modify: `src/modules/auth/constants.ts`
- Modify: `src/modules/auth/api/index.ts` (imports y `verifyAccess`)
- Modify: `src/modules/common/constants.ts` (`commonQueryKeys`)
- Create: `src/modules/common/types/accessFeatures.ts`
- Create: `src/modules/common/utilities/readAccessFeature.ts`
- Create: `src/modules/common/hooks/useAccessFeature.ts`
- Modify: `docs/adr/ADR-0006-autenticacion-doble-flujo-oauth-y-gate-por-loaders.md`
- Test: `scripts/test/check-app-access-flags.mjs`

**Interfaces:**

- Consumes: nada de otras tareas de este frente (estado de la Tarea 0).
- Produces:
  - `interface AccessFeatures { gemTemplate: boolean; newCatalog: boolean }`,
    `AccessStatus.admin: boolean`, `AccessStatus.features: AccessFeatures`,
    `type AccessFlags = Pick<AccessStatus, 'demo' | 'admin' | 'features'>`
    (`@/modules/auth/types/access`).
  - `normalizeAccessFeatures(features: Partial<AccessFeatures> | undefined): AccessFeatures` y
    `accessFlagsFrom(response: Pick<VerifyAccessResponse, 'demo' | 'admin' | 'features'>): AccessFlags`
    (`@/modules/auth/utilities/accessFlags`).
  - `type AccessFeatureName = 'gemTemplate' | 'newCatalog'` (`@/modules/common/types/accessFeatures`).
  - `useAccessFeature(name: AccessFeatureName): boolean` (`@/modules/common/hooks/useAccessFeature`).
  - `commonQueryKeys.access` (`['auth', 'access']`).

- [ ] **Paso 0: Confirmar el estado de partida**

Run: `grep -n "GEM_SECTION_KEYS\|systemPrompt?: string" pipeline/types/styles.ts && pnpm exec tsc -p tsconfig.app.json --noEmit`
Expected: aparecen `GEM_SECTION_KEYS` y `systemPrompt?: string`, y tsc termina sin errores. Si no,
la Tarea 0 no está: frenar y avisar al orquestador.

- [ ] **Paso 1: Escribir el guard que falla**

Crear `scripts/test/check-app-access-flags.mjs`:

<!-- prettier-ignore -->
```js
// Flags del veredicto de acceso (ADR-0006, ADR-0048): `admin` y los
// interruptores de salida se normalizan a false si faltan o llegan raros, y se
// recuerdan por correo para el modo sin red, igual que `demo`. También la
// lectura de un interruptor desde cualquier módulo, sin conocer el veredicto.
// Módulos puros de src/ corridos con Node (type stripping), sin bundler.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  accessFlagsFrom,
  normalizeAccessFeatures,
  parseRememberedAccess,
  serializeRememberedAccess,
} from '../../src/modules/auth/utilities/accessFlags.ts'
import { readAccessFeature } from '../../src/modules/common/utilities/readAccessFeature.ts'

const ALL_OFF = {
  demo: false,
  admin: false,
  features: { gemTemplate: false, newCatalog: false },
}

test('un servidor viejo sin admin ni features deja todo apagado', () => {
  assert.deepEqual(accessFlagsFrom({}), ALL_OFF)
  assert.deepEqual(accessFlagsFrom({ demo: true }), { ...ALL_OFF, demo: true })
})

test('features incompleto: lo que falta cuenta como apagado', () => {
  assert.deepEqual(normalizeAccessFeatures({ gemTemplate: true }), {
    gemTemplate: true,
    newCatalog: false,
  })
  assert.deepEqual(normalizeAccessFeatures({ newCatalog: true }), {
    gemTemplate: false,
    newCatalog: true,
  })
  assert.deepEqual(normalizeAccessFeatures(undefined), {
    gemTemplate: false,
    newCatalog: false,
  })
})

test('solo un true explícito enciende: strings, números o null no', () => {
  const off = { gemTemplate: false, newCatalog: false }
  assert.deepEqual(
    normalizeAccessFeatures({ gemTemplate: 'true', newCatalog: 1 }),
    off,
  )
  assert.deepEqual(normalizeAccessFeatures(null), off)
  assert.deepEqual(normalizeAccessFeatures('all'), off)
  assert.equal(accessFlagsFrom({ admin: 'true' }).admin, false)
  assert.equal(accessFlagsFrom({ admin: true }).admin, true)
})

test('memoria: el mismo correo recupera sus flags; otro no hereda nada', () => {
  const flags = {
    demo: true,
    admin: true,
    features: { gemTemplate: true, newCatalog: false },
  }
  const raw = serializeRememberedAccess('ana@example.com', flags)
  assert.deepEqual(parseRememberedAccess(raw, 'ana@example.com'), flags)
  assert.deepEqual(parseRememberedAccess(raw, 'otro@example.com'), ALL_OFF)
  assert.deepEqual(parseRememberedAccess(raw, null), ALL_OFF)
})

test('una memoria anterior a ADR-0048 (solo demo) sigue valiendo', () => {
  const legacy = JSON.stringify({ email: 'ana@example.com', demo: true })
  assert.deepEqual(parseRememberedAccess(legacy, 'ana@example.com'), {
    ...ALL_OFF,
    demo: true,
  })
})

test('memoria vacía, corrupta o con otra forma: todo apagado', () => {
  for (const raw of [null, '', '{', '"texto"', '42', 'null', '[]'])
    assert.deepEqual(parseRememberedAccess(raw, 'ana@example.com'), ALL_OFF)
})

test('readAccessFeature: solo un true explícito del veredicto enciende', () => {
  assert.equal(readAccessFeature(undefined, 'gemTemplate'), false)
  assert.equal(readAccessFeature(null, 'gemTemplate'), false)
  assert.equal(readAccessFeature({ authorized: true }, 'gemTemplate'), false)
  assert.equal(readAccessFeature({ features: null }, 'gemTemplate'), false)
  assert.equal(
    readAccessFeature({ features: { gemTemplate: 'true' } }, 'gemTemplate'),
    false,
  )
  assert.equal(
    readAccessFeature({ features: { gemTemplate: true } }, 'gemTemplate'),
    true,
  )
  assert.equal(
    readAccessFeature({ features: { gemTemplate: true } }, 'newCatalog'),
    false,
  )
})
```

- [ ] **Paso 2: Correrlo y verlo fallar**

Run: `node --test scripts/test/check-app-access-flags.mjs`
Expected: FAIL con `ERR_MODULE_NOT_FOUND` (todavía no existe `accessFlags.ts`).

- [ ] **Paso 3: Tipos del veredicto**

Reemplazar entero `src/modules/auth/types/access.ts`:

<!-- prettier-ignore -->
```ts
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
```

- [ ] **Paso 4: Flags normalizados (puro)**

Crear `src/modules/auth/utilities/accessFlags.ts`:

<!-- prettier-ignore -->
```ts
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
```

- [ ] **Paso 5: Lector del interruptor en `common` (puro)**

Crear `src/modules/common/types/accessFeatures.ts`:

<!-- prettier-ignore -->
```ts
// Nombre de cada interruptor de salida del veredicto de acceso (ADR-0048). La
// forma completa del veredicto es de auth (`AccessFeatures`): common conoce
// solo los nombres, para que cualquier módulo lea un interruptor sin importar
// auth (ADR-0006, enmienda 2026-09-30). Uno nuevo se suma acá y en auth.
export type AccessFeatureName = 'gemTemplate' | 'newCatalog'
```

Crear `src/modules/common/utilities/readAccessFeature.ts`:

<!-- prettier-ignore -->
```ts
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
```

- [ ] **Paso 6: Correr el guard**

Run: `node --test scripts/test/check-app-access-flags.mjs`
Expected: PASS, 7 casos.

- [ ] **Paso 7: Memoria por correo (reemplaza a la de la demo)**

Borrar `src/modules/auth/utilities/demoAccessMemory.ts` y crear
`src/modules/auth/utilities/accessFlagsMemory.ts`:

<!-- prettier-ignore -->
```ts
import { ACCESS_FLAGS_STORAGE_KEY } from '@/modules/auth/constants'
import {
  parseRememberedAccess,
  serializeRememberedAccess,
} from '@/modules/auth/utilities/accessFlags'
import type { AccessFlags } from '@/modules/auth/types/access'

// El veredicto de vimo.click es fail-open sin red (ADR-0006), pero sus flags
// no se pueden inventar: se recuerda lo último recibido para ESTE correo y se
// reutiliza offline (`demo` desde ADR-0029; `admin` y los interruptores desde
// ADR-0048). Otro correo no lo hereda.
export function rememberAccessFlags(
  email: string | null,
  flags: AccessFlags,
): void {
  if (!email) return
  try {
    localStorage.setItem(
      ACCESS_FLAGS_STORAGE_KEY,
      serializeRememberedAccess(email, flags),
    )
  } catch {
    // Storage lleno o deshabilitado: la próxima verificación con red lo repone.
  }
}

export function recallAccessFlags(email: string | null): AccessFlags {
  try {
    return parseRememberedAccess(
      localStorage.getItem(ACCESS_FLAGS_STORAGE_KEY),
      email,
    )
  } catch {
    return parseRememberedAccess(null, email)
  }
}
```

- [ ] **Paso 8: Clave del veredicto en `common` y constantes de `auth`**

En `src/modules/common/constants.ts`, reemplazar:

<!-- prettier-ignore -->
```ts
export const commonQueryKeys = {
  promptModels: ['common', 'promptModels'],
```

por:

<!-- prettier-ignore -->
```ts
export const commonQueryKeys = {
  // Veredicto de acceso de vimo.click (ADR-0006): lo verifica y lo cachea
  // auth (`authQueryKeys.access` es esta misma clave); los demás módulos solo
  // leen sus interruptores con useAccessFeature, sin verificar.
  access: ['auth', 'access'],
  promptModels: ['common', 'promptModels'],
```

En `src/modules/auth/constants.ts`: agregar como primera línea
`import { commonQueryKeys } from '@/modules/common/constants'` y una línea en blanco; reemplazar:

<!-- prettier-ignore -->
```ts
export const authQueryKeys = {
  access: ['auth', 'access'],
} as const
```

por:

<!-- prettier-ignore -->
```ts
export const authQueryKeys = {
  // La clave del veredicto vive en common para que otros módulos lean sus
  // interruptores con useAccessFeature (ADR-0006, enmienda 2026-09-30). Es la
  // misma de siempre: auth la sigue usando con este nombre.
  access: commonQueryKeys.access,
} as const
```

y reemplazar:

<!-- prettier-ignore -->
```ts
/** Último flag `demo` recibido, por correo: sobrevive al modo sin red (ADR-0029). */
export const DEMO_ACCESS_STORAGE_KEY = 'vimo:demo:access:v1'
```

por:

<!-- prettier-ignore -->
```ts
/**
 * Últimos flags del veredicto (demo, admin e interruptores), por correo:
 * sobreviven al modo sin red (ADR-0029, ADR-0048). La clave conserva su
 * nombre histórico para no perder lo que ya estaba recordado.
 */
export const ACCESS_FLAGS_STORAGE_KEY = 'vimo:demo:access:v1'
```

- [ ] **Paso 9: `verifyAccess` con los flags**

En `src/modules/auth/api/index.ts`, reemplazar:

<!-- prettier-ignore -->
```ts
import type { AccessStatus, VerifyAccessResponse } from '../types/access'
import {
  recallDemoAccess,
  rememberDemoAccess,
} from '../utilities/demoAccessMemory'
```

por:

<!-- prettier-ignore -->
```ts
import { accessFlagsFrom } from '@/modules/auth/utilities/accessFlags'
import {
  recallAccessFlags,
  rememberAccessFlags,
} from '@/modules/auth/utilities/accessFlagsMemory'
import type {
  AccessStatus,
  VerifyAccessResponse,
} from '@/modules/auth/types/access'
```

En el return sin sesión, reemplazar `        demo: false,` (el que está dentro de
`if (!session?.access_token)`) por `        ...accessFlagsFrom({}),`.

Reemplazar:

<!-- prettier-ignore -->
```ts
      const body = (await response.json()) as VerifyAccessResponse
      // El flag de la demo se recuerda por correo para el modo sin red.
      const demo = body.demo === true
      rememberDemoAccess(email, demo)
      return {
        authorized: body.autorizado,
        reason: body.motivo,
        plan: body.plan ?? null,
        email,
        name,
        avatar,
        demo,
      }
```

por:

<!-- prettier-ignore -->
```ts
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
```

Reemplazar:

<!-- prettier-ignore -->
```ts
      // Fail-open deliberado (regla del origen): sin red o con el server caído
      // se asume acceso vigente para no bloquear el trabajo local del usuario.
      return {
        authorized: true,
        reason: 'offline',
        plan: null,
        email,
        name,
        avatar,
        demo: recallDemoAccess(email),
      }
```

por:

<!-- prettier-ignore -->
```ts
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
```

- [ ] **Paso 10: Hook del interruptor**

Crear `src/modules/common/hooks/useAccessFeature.ts`:

<!-- prettier-ignore -->
```ts
import { skipToken, useQuery } from '@tanstack/react-query'
import { commonQueryKeys } from '@/modules/common/constants'
import { readAccessFeature } from '@/modules/common/utilities/readAccessFeature'
import type { AccessFeatureName } from '@/modules/common/types/accessFeatures'

// ¿Está encendido este interruptor para la persona (ADR-0048)? Lee el
// veredicto que el loader del layout ya cacheó, sin disparar otra verificación
// (como el Sidebar con `demo`). Es configuración global: se lee donde se usa y
// no viaja por props. Sin veredicto en caché: apagado.
export function useAccessFeature(name: AccessFeatureName): boolean {
  const { data } = useQuery({
    queryKey: commonQueryKeys.access,
    queryFn: skipToken,
    select: (verdict: unknown) => readAccessFeature(verdict, name),
  })

  return data === true
}
```

- [ ] **Paso 11: Enmienda de la ADR-0006 (interruptores)**

En `docs/adr/ADR-0006-autenticacion-doble-flujo-oauth-y-gate-por-loaders.md`:

1. Debajo de `- **Área:** app` agregar:

<!-- prettier-ignore -->
```markdown
- **Enmendada:** 2026-09-30, con la
  [ADR-0048](ADR-0048-gemas-por-secciones-y-agente-reconstructor.md) (ver
  «Enmiendas»).
```

2. Debajo de la línea:

<!-- prettier-ignore -->
```markdown
  - `grep -rn "isTauri" src/` → solo `api/index.ts`.
```

agregar:

<!-- prettier-ignore -->
```markdown
  - `grep -rn "commonQueryKeys.access" src/ --include="*.ts*"` → solo
    `src/modules/auth/constants.ts` y `src/modules/common/hooks/useAccessFeature.ts`
    (enmienda 2026-09-30): nadie más arma la clave del veredicto.
  - `node --test scripts/test/check-app-access-flags.mjs` en verde.
```

3. Reemplazar el ítem de regresión:

<!-- prettier-ignore -->
```markdown
- **Regresión típica:** una vista importando `supabase` o llamando `fetch`; un loader
  con su propio array de query key en lugar de `authQueryKeys.access`.
```

por:

<!-- prettier-ignore -->
```markdown
- **Regresión típica:** una vista importando `supabase` o llamando `fetch`; un loader
  con su propio array de query key en lugar de `authQueryKeys.access`; un módulo que
  importa `authQueryKeys` o `AccessStatus` para leer un interruptor en vez de
  `useAccessFeature`.
```

4. Antes de `## Referencias` agregar:

<!-- prettier-ignore -->
```markdown
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

```

- [ ] **Paso 12: Verificación**

Run:

<!-- prettier-ignore -->
```bash
pnpm exec prettier --write src/modules/auth/types/access.ts src/modules/auth/utilities/accessFlags.ts src/modules/auth/utilities/accessFlagsMemory.ts src/modules/auth/constants.ts src/modules/auth/api/index.ts src/modules/common/constants.ts src/modules/common/types/accessFeatures.ts src/modules/common/utilities/readAccessFeature.ts src/modules/common/hooks/useAccessFeature.ts scripts/test/check-app-access-flags.mjs docs/adr/ADR-0006-autenticacion-doble-flujo-oauth-y-gate-por-loaders.md
pnpm exec eslint src/modules/auth/types/access.ts src/modules/auth/utilities/accessFlags.ts src/modules/auth/utilities/accessFlagsMemory.ts src/modules/auth/constants.ts src/modules/auth/api/index.ts src/modules/common/constants.ts src/modules/common/types/accessFeatures.ts src/modules/common/utilities/readAccessFeature.ts src/modules/common/hooks/useAccessFeature.ts
pnpm exec tsc -p tsconfig.app.json --noEmit
node --test scripts/test/check-app-access-flags.mjs
node scripts/test/check-locales.mjs
grep -rn "demoAccessMemory\|DEMO_ACCESS_STORAGE_KEY\|recallDemoAccess\|rememberDemoAccess" src
grep -rn "commonQueryKeys.access" src/ --include="*.ts*"
```

Expected: eslint y tsc sin errores; el guard con 7 casos en verde; `check-locales` alineado (sin
claves nuevas); el primer grep sin resultados; el segundo, solo `auth/constants.ts` y
`common/hooks/useAccessFeature.ts`.

- [ ] **Paso 13: Commit (orquestador)**

<!-- prettier-ignore -->
```bash
git add src/modules/auth/types/access.ts src/modules/auth/utilities/accessFlags.ts src/modules/auth/utilities/accessFlagsMemory.ts src/modules/auth/utilities/demoAccessMemory.ts src/modules/auth/constants.ts src/modules/auth/api/index.ts src/modules/common/constants.ts src/modules/common/types/accessFeatures.ts src/modules/common/utilities/readAccessFeature.ts src/modules/common/hooks/useAccessFeature.ts scripts/test/check-app-access-flags.mjs docs/adr/ADR-0006-autenticacion-doble-flujo-oauth-y-gate-por-loaders.md
git commit -F - <<'EOF'
feat(auth): read admin and feature switches from the access verdict

Qué: AccessStatus suma `admin` y `features` (gemTemplate, newCatalog).
verifyAccess los normaliza con accessFlagsFrom (solo un true explícito
enciende) y los recuerda por correo junto con `demo` para el modo sin red:
accessFlagsMemory reemplaza a demoAccessMemory y conserva su clave de
localStorage. La clave del veredicto sube a common (commonQueryKeys.access;
authQueryKeys.access es la misma) y common suma useAccessFeature, que lee un
interruptor del caché sin verificar ni importar auth.

Por qué: la Entrega 1 del catálogo sobre el carril de Mi estilo (ADR-0048) se
enciende con interruptores que decide vimo.click (off, admins o all). Un
servidor viejo o a medio desplegar no manda `features` y la app tiene que
seguir como hoy. El módulo videos necesita leer `gemTemplate` sin importar
entrañas de auth (regla de dependencias de CLAUDE.md).

Con qué interactúa: verificar-acceso de vimo-landing (frente B), los loaders
y useAccess de auth (misma clave, sin cambios) y el Sidebar (sigue leyendo
`demo`). Enmienda la ADR-0006. Guard nuevo:
scripts/test/check-app-access-flags.mjs. Queda fuera: ningún componente usa
todavía los interruptores (llegan con C4).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Tarea C2: cliente de vimo.click en `common`

**Files:**

- Create: `src/modules/common/types/vimoServer.ts`
- Create: `src/modules/common/fetcher/vimoServerError.ts`
- Create: `src/modules/common/fetcher/vimoServer.ts`
- Modify: `src/modules/common/constants.ts` (URL base y timeout)
- Modify: `src/modules/auth/constants.ts` (`VERIFY_ACCESS_URL` con la base)
- Modify: `src/modules/auth/api/index.ts` (un comentario)
- Modify: `docs/adr/ADR-0006-autenticacion-doble-flujo-oauth-y-gate-por-loaders.md`
- Test: `scripts/test/check-app-vimo-server.mjs`

**Interfaces:**

- Consumes: `supabase` de `@/modules/common/supabase/client`.
- Produces:
  - `vimoServerFetch<TResponse>(path: string, options?: VimoServerRequestOptions): Promise<TResponse>`
    (`@/modules/common/fetcher/vimoServer`), con
    `VimoServerRequestOptions { method?: 'GET' | 'POST'; body?: unknown; timeoutMs?: number }`.
  - `class VimoServerError extends Error` con `kind: 'network' | 'timeout' | 'http'`,
    `status: number | null`, `code: string | null`, `retryAfterSeconds: number | null` y
    `receivedAt: number | null`; constructor `(kind, details?: VimoServerErrorDetails)`.
  - `vimoServerErrorCode(error: unknown): string | null` y
    `vimoServerRetryAt(error: unknown): string | null` (ISO 8601)
    (`@/modules/common/fetcher/vimoServerError`).
  - `VIMO_SERVER_BASE_URL = 'https://vimo.click'` y `VIMO_SERVER_TIMEOUT_MS = 15_000`
    (`@/modules/common/constants`).

- [ ] **Paso 1: Escribir el guard que falla**

Crear `scripts/test/check-app-vimo-server.mjs`. La segunda mitad empaqueta el cliente real con
esbuild (como los guards de interfaz), reemplaza solo la URL base y la sesión, y lo prueba contra
un servidor HTTP local:

<!-- prettier-ignore -->
```js
// Cliente de vimo.click (ADR-0006, enmienda 2026-09-30). Primero la
// clasificación de fallos como módulo puro (Node con type stripping); después
// el cliente real, empaquetado con esbuild con la sesión de Supabase y la URL
// base simuladas, contra un servidor HTTP local. Sin red real ni claves.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import {
  VimoServerError,
  readJsonBody,
  toVimoServerError,
  vimoServerErrorCode,
  vimoServerErrorFromResponse,
  vimoServerHeaders,
  vimoServerRetryAt,
} from '../../src/modules/common/fetcher/vimoServerError.ts'

test('un error del servidor trae status, code y retryAfterSeconds', () => {
  const error = vimoServerErrorFromResponse(
    429,
    { code: 'cupo-agotado', retryAfterSeconds: 3600 },
    1000,
  )
  assert.equal(error.kind, 'http')
  assert.equal(error.status, 429)
  assert.equal(error.code, 'cupo-agotado')
  assert.equal(error.retryAfterSeconds, 3600)
  assert.equal(error.receivedAt, 1000)
})

test('un cuerpo sin code, vacío o que no es objeto no inventa uno', () => {
  for (const body of [
    undefined,
    null,
    'texto',
    {},
    { code: '' },
    { code: 7 },
  ]) {
    const error = vimoServerErrorFromResponse(502, body, 0)
    assert.equal(error.kind, 'http')
    assert.equal(error.status, 502)
    assert.equal(error.code, null)
  }
})

test('un retryAfterSeconds que no es un número válido se ignora', () => {
  for (const retryAfterSeconds of ['3600', -1, Number.NaN, null]) {
    const body = { code: 'cupo-agotado', retryAfterSeconds }
    const error = vimoServerErrorFromResponse(429, body, 0)
    assert.equal(error.retryAfterSeconds, null)
  }
})

test('lo que tira fetch: el tiempo agotado es timeout; el resto, network', () => {
  const timeout = new DOMException('lento', 'TimeoutError')
  assert.equal(toVimoServerError(timeout).kind, 'timeout')
  assert.equal(toVimoServerError(new TypeError('fetch failed')).kind, 'network')
  assert.equal(toVimoServerError('raro').kind, 'network')
  const http = new VimoServerError('http', { status: 403, code: 'sin-acceso' })
  assert.equal(toVimoServerError(http), http)
})

test('código estable para i18n', () => {
  assert.equal(vimoServerErrorCode(new VimoServerError('network')), 'network')
  assert.equal(vimoServerErrorCode(new VimoServerError('timeout')), 'timeout')
  const modelTimeout = new VimoServerError('http', {
    status: 504,
    code: 'modelo-timeout',
  })
  assert.equal(vimoServerErrorCode(modelTimeout), 'modelo-timeout')
  const withoutCode = new VimoServerError('http', { status: 500 })
  assert.equal(vimoServerErrorCode(withoutCode), null)
  assert.equal(vimoServerErrorCode(new Error('otro')), null)
})

test('cuándo vuelve el cupo: desde que llegó la respuesta', () => {
  const receivedAt = Date.UTC(2026, 8, 30, 12, 0, 0)
  const body = { code: 'cupo-agotado', retryAfterSeconds: 60 }
  const error = vimoServerErrorFromResponse(429, body, receivedAt)
  assert.equal(vimoServerRetryAt(error), '2026-09-30T12:01:00.000Z')
  const withoutRetry = new VimoServerError('http', {
    status: 429,
    code: 'cupo-agotado',
  })
  assert.equal(vimoServerRetryAt(withoutRetry), null)
  assert.equal(vimoServerRetryAt(new Error('otro')), null)
})

test('encabezados: el Bearer viaja solo con sesión', () => {
  assert.deepEqual(vimoServerHeaders('abc'), {
    'Content-Type': 'application/json',
    Authorization: 'Bearer abc',
  })
  assert.deepEqual(vimoServerHeaders(null), {
    'Content-Type': 'application/json',
  })
})

test('cuerpo: JSON, o undefined si no lo es', async () => {
  assert.deepEqual(await readJsonBody(new Response('{"a":1}')), { a: 1 })
  assert.equal(await readJsonBody(new Response('<html>')), undefined)
  assert.equal(await readJsonBody(new Response('')), undefined)
})

// ── El cliente real, empaquetado, contra un servidor local ──

let server
let client
let workdir
const requests = []

function reply(response, status, body, contentType = 'application/json') {
  response.writeHead(status, { 'Content-Type': contentType })
  response.end(body)
}

function handle(request, response, raw) {
  requests.push({ headers: request.headers, method: request.method, raw })
  if (request.url === '/ok')
    return reply(response, 200, JSON.stringify({ echo: JSON.parse(raw) }))
  if (request.url === '/quota') {
    const body = { code: 'cupo-agotado', retryAfterSeconds: 3600 }
    return reply(response, 429, JSON.stringify(body))
  }
  if (request.url === '/html')
    return reply(response, 502, '<html>bad gateway</html>', 'text/html')
  if (request.url === '/not-json')
    return reply(response, 200, 'hola', 'text/plain')
  if (request.url === '/slow') {
    setTimeout(() => reply(response, 200, '{}'), 2000)
    return
  }
  if (request.url === '/slow-body') {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.write('{"echo":')
    setTimeout(() => response.end('1}'), 2000)
    return
  }
  reply(response, 404, '{}')
}

function useSession(accessToken) {
  globalThis.vimoServerSession = async () => ({
    data: { session: accessToken ? { access_token: accessToken } : null },
  })
}

before(async () => {
  server = createServer((request, response) => {
    let raw = ''
    request.on('data', (chunk) => {
      raw += chunk
    })
    request.on('end', () => handle(request, response, raw))
  })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const baseUrl = `http://127.0.0.1:${server.address().port}`
  // La URL base y la sesión se reemplazan; el resto es el código real.
  const fixtures = {
    '@/modules/common/constants': `export const VIMO_SERVER_BASE_URL = ${JSON.stringify(baseUrl)}; export const VIMO_SERVER_TIMEOUT_MS = 1000`,
    '@/modules/common/supabase/client':
      'export const supabase = { auth: { getSession: () => globalThis.vimoServerSession() } }',
  }
  const output = await build({
    entryPoints: [resolve('src/modules/common/fetcher/vimoServer.ts')],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    tsconfig: 'tsconfig.app.json',
    plugins: [
      {
        name: 'fixtures',
        setup(plugin) {
          plugin.onResolve({ filter: /^@\// }, (args) =>
            fixtures[args.path]
              ? { path: args.path, namespace: 'fixture' }
              : undefined,
          )
          plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
            contents: fixtures[args.path],
            loader: 'js',
          }))
        },
      },
    ],
  })
  workdir = await mkdtemp(join(tmpdir(), 'vimo-server-guard-'))
  const file = join(workdir, 'vimo-server.mjs')
  await writeFile(file, output.outputFiles[0].contents)
  client = await import(pathToFileURL(file).href)
})

after(async () => {
  await rm(workdir, { recursive: true, force: true })
})

// El bundle trae su propia copia de la clase: se mira el nombre, no instanceof.
function isFailure(kind, check = () => {}) {
  return (error) => {
    assert.equal(error.name, 'VimoServerError')
    assert.equal(error.kind, kind)
    check(error)
    return true
  }
}

test('cliente: POST con el Bearer de la sesión y el cuerpo en JSON', async () => {
  useSession('token-1')
  const result = await client.vimoServerFetch('/ok', { body: { text: 'hola' } })
  assert.deepEqual(result, { echo: { text: 'hola' } })
  const last = requests.at(-1)
  assert.equal(last.method, 'POST')
  assert.equal(last.headers.authorization, 'Bearer token-1')
  assert.equal(last.headers['content-type'], 'application/json')
})

test('cliente: sin sesión el pedido viaja sin Authorization', async () => {
  useSession(null)
  await client.vimoServerFetch('/ok', { body: {} })
  assert.equal(requests.at(-1).headers.authorization, undefined)
})

test('cliente: un 429 del servidor es http con code y retryAfterSeconds', async () => {
  useSession('token-1')
  await assert.rejects(
    client.vimoServerFetch('/quota', { body: {} }),
    isFailure('http', (error) => {
      assert.equal(error.status, 429)
      assert.equal(error.code, 'cupo-agotado')
      assert.equal(error.retryAfterSeconds, 3600)
      assert.equal(typeof error.receivedAt, 'number')
    }),
  )
})

test('cliente: un 502 con HTML es http sin code', async () => {
  useSession('token-1')
  await assert.rejects(
    client.vimoServerFetch('/html', { body: {} }),
    isFailure('http', (error) => {
      assert.equal(error.status, 502)
      assert.equal(error.code, null)
    }),
  )
})

test('cliente: un 200 que no es JSON es http sin code', async () => {
  useSession('token-1')
  await assert.rejects(
    client.vimoServerFetch('/not-json', { body: {} }),
    isFailure('http', (error) => assert.equal(error.status, 200)),
  )
})

test('cliente: sin respuesta a tiempo es timeout', async () => {
  useSession('token-1')
  await assert.rejects(
    client.vimoServerFetch('/slow', { body: {}, timeoutMs: 150 }),
    isFailure('timeout'),
  )
})

test('cliente: un cuerpo que no termina de llegar es timeout', async () => {
  useSession('token-1')
  await assert.rejects(
    client.vimoServerFetch('/slow-body', { body: {}, timeoutMs: 200 }),
    isFailure('timeout'),
  )
})

test('cliente: una sesión que no responde es timeout', async () => {
  globalThis.vimoServerSession = () => new Promise(() => {})
  await assert.rejects(
    client.vimoServerFetch('/ok', { body: {}, timeoutMs: 100 }),
    isFailure('timeout'),
  )
})

// Último: apaga el servidor local.
test('cliente: con el servidor caído es network', async () => {
  useSession('token-1')
  await new Promise((done) => {
    server.close(done)
    server.closeAllConnections()
  })
  await assert.rejects(
    client.vimoServerFetch('/ok', { body: {} }),
    isFailure('network'),
  )
})
```

- [ ] **Paso 2: Correrlo y verlo fallar**

Run: `node --test scripts/test/check-app-vimo-server.mjs`
Expected: FAIL con `ERR_MODULE_NOT_FOUND` (todavía no existe `vimoServerError.ts`).

- [ ] **Paso 3: Tipos del cliente**

Crear `src/modules/common/types/vimoServer.ts`:

<!-- prettier-ignore -->
```ts
// Cliente de vimo.click (ADR-0006, enmienda 2026-09-30).

/** Por qué falló un pedido: sin red, sin respuesta a tiempo o un status que no es 2xx. */
export type VimoServerErrorKind = 'network' | 'timeout' | 'http'

export interface VimoServerErrorDetails {
  status?: number
  // `code` y `retryAfterSeconds` del cuerpo de error del servidor.
  code?: string
  retryAfterSeconds?: number
  // Cuándo llegó la respuesta (ms desde epoch).
  receivedAt?: number
}

export interface VimoServerRequestOptions {
  // POST por defecto: los endpoints de vimo.click que usa la app son pedidos.
  method?: 'GET' | 'POST'
  // Viaja como JSON.
  body?: unknown
  // Tope del pedido entero, sesión incluida. Ausente = VIMO_SERVER_TIMEOUT_MS.
  timeoutMs?: number
}
```

- [ ] **Paso 4: Clasificación de fallos (puro)**

Crear `src/modules/common/fetcher/vimoServerError.ts`:

<!-- prettier-ignore -->
```ts
import type {
  VimoServerErrorDetails,
  VimoServerErrorKind,
} from '@/modules/common/types/vimoServer'

// Fallos del cliente de vimo.click (ADR-0006, enmienda 2026-09-30). Puro, solo
// con `import type`: lo corre scripts/test/check-app-vimo-server.mjs con Node.

/** Fallo de un pedido a vimo.click: `kind` dice si fue la red, el tiempo o el servidor. */
export class VimoServerError extends Error {
  readonly kind: VimoServerErrorKind
  // Solo con `http`: el status y lo que dijo el cuerpo `{ code, retryAfterSeconds }`.
  readonly status: number | null
  readonly code: string | null
  readonly retryAfterSeconds: number | null
  // Cuándo llegó la respuesta: `retryAfterSeconds` cuenta desde acá.
  readonly receivedAt: number | null

  constructor(kind: VimoServerErrorKind, details: VimoServerErrorDetails = {}) {
    super(`vimo.click ${kind}`)
    this.name = 'VimoServerError'
    this.kind = kind
    this.status = details.status ?? null
    this.code = details.code ?? null
    this.retryAfterSeconds = details.retryAfterSeconds ?? null
    this.receivedAt = details.receivedAt ?? null
  }
}

// AbortSignal.timeout corta el fetch, y también la lectura del cuerpo, con un
// DOMException llamado TimeoutError.
function isTimeoutError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  return Reflect.get(error, 'name') === 'TimeoutError'
}

/** Una respuesta que no es 2xx, con el cuerpo `{ code, retryAfterSeconds? }` del contrato. */
export function vimoServerErrorFromResponse(
  status: number,
  body: unknown,
  receivedAt: number,
): VimoServerError {
  if (typeof body !== 'object' || body === null)
    return new VimoServerError('http', { status, receivedAt })

  const code: unknown = Reflect.get(body, 'code')
  const retryAfterSeconds: unknown = Reflect.get(body, 'retryAfterSeconds')
  const validRetry =
    typeof retryAfterSeconds === 'number' &&
    Number.isFinite(retryAfterSeconds) &&
    retryAfterSeconds >= 0

  return new VimoServerError('http', {
    status,
    receivedAt,
    ...(typeof code === 'string' && code.length > 0 ? { code } : {}),
    ...(validRetry ? { retryAfterSeconds } : {}),
  })
}

/** Lo que tiró el pedido como VimoServerError: el tiempo agotado es `timeout`; el resto, `network`. */
export function toVimoServerError(error: unknown): VimoServerError {
  if (error instanceof VimoServerError) return error
  if (isTimeoutError(error)) return new VimoServerError('timeout')
  return new VimoServerError('network')
}

/** El cuerpo como JSON, o undefined si no lo es. Quedarse sin tiempo leyéndolo sigue siendo un error. */
export async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch (error) {
    if (isTimeoutError(error)) throw error
    return undefined
  }
}

/** Encabezados del pedido: JSON y, con sesión, el Bearer de Supabase. */
export function vimoServerHeaders(
  accessToken: string | null,
): Record<string, string> {
  if (!accessToken) return { 'Content-Type': 'application/json' }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  }
}

/**
 * Código estable para i18n: los del cliente (`network`, `timeout`) o el `code`
 * del servidor. null = sin código (otro error, o un cuerpo que no se reconoce):
 * quien traduce usa su mensaje genérico.
 */
export function vimoServerErrorCode(error: unknown): string | null {
  if (!(error instanceof VimoServerError)) return null
  if (error.kind !== 'http') return error.kind
  return error.code
}

/** Cuándo vuelve a haber cupo (ISO 8601), si el servidor lo dijo; si no, null. */
export function vimoServerRetryAt(error: unknown): string | null {
  if (!(error instanceof VimoServerError)) return null
  if (error.retryAfterSeconds === null || error.receivedAt === null) return null

  return new Date(
    error.receivedAt + error.retryAfterSeconds * 1000,
  ).toISOString()
}
```

- [ ] **Paso 5: URL base y timeout en `common`**

En `src/modules/common/constants.ts`, antes de `export const TOAST_LIMIT = 1` agregar:

<!-- prettier-ignore -->
```ts
// vimo.click: el servidor de Vimo (acceso y agente reconstructor). La ruta de
// cada endpoint vive en el constants.ts de su módulo (ADR-0006, enmienda
// 2026-09-30).
export const VIMO_SERVER_BASE_URL = 'https://vimo.click'
// Tope por defecto de un pedido a vimo.click; un endpoint lento pide el suyo.
export const VIMO_SERVER_TIMEOUT_MS = 15_000

```

- [ ] **Paso 6: El cliente**

Crear `src/modules/common/fetcher/vimoServer.ts`:

<!-- prettier-ignore -->
```ts
import {
  VIMO_SERVER_BASE_URL,
  VIMO_SERVER_TIMEOUT_MS,
} from '@/modules/common/constants'
import {
  VimoServerError,
  readJsonBody,
  toVimoServerError,
  vimoServerErrorFromResponse,
  vimoServerHeaders,
} from '@/modules/common/fetcher/vimoServerError'
import { supabase } from '@/modules/common/supabase/client'
import type { VimoServerRequestOptions } from '@/modules/common/types/vimoServer'

// El token de la sesión, con el mismo tope que el pedido: getSession puede
// colgarse (navigator.locks, ver SESSION_TIMEOUT_MS de auth). Sin sesión el
// pedido viaja sin encabezado y el servidor responde 401 `sin-token`.
async function sessionAccessToken(signal: AbortSignal): Promise<string | null> {
  const timedOut = new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), {
      once: true,
    })
  })
  const { data } = await Promise.race([supabase.auth.getSession(), timedOut])
  return data.session?.access_token ?? null
}

/**
 * Único cliente de los endpoints de vimo.click que usan la sesión (ADR-0006,
 * enmienda 2026-09-30): el tercer transporte del borde con el exterior, junto
 * a `fetcher.ts` (HTTP del sidecar, legado) y `pipeline.ts` (jobs). Adjunta el
 * Bearer de Supabase y falla siempre con VimoServerError. Solo lo llama el
 * `api/` de un módulo; `verificar-acceso` sigue en `auth/api` porque es
 * fail-open y recuerda flags.
 */
export async function vimoServerFetch<TResponse>(
  path: string,
  options: VimoServerRequestOptions = {},
): Promise<TResponse> {
  const signal = AbortSignal.timeout(
    options.timeoutMs ?? VIMO_SERVER_TIMEOUT_MS,
  )
  try {
    const accessToken = await sessionAccessToken(signal)
    const response = await fetch(`${VIMO_SERVER_BASE_URL}${path}`, {
      method: options.method ?? 'POST',
      headers: vimoServerHeaders(accessToken),
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
    })
    const body = await readJsonBody(response)
    if (!response.ok)
      throw vimoServerErrorFromResponse(response.status, body, Date.now())
    // Un 2xx sin JSON no cumple el contrato: cuenta como error del servidor.
    if (body === undefined)
      throw new VimoServerError('http', { status: response.status })

    return body as TResponse
  } catch (error) {
    throw toVimoServerError(error)
  }
}
```

- [ ] **Paso 7: `auth` usa la URL base**

En `src/modules/auth/constants.ts`, reemplazar `import { commonQueryKeys } from '@/modules/common/constants'`
por:

<!-- prettier-ignore -->
```ts
import {
  commonQueryKeys,
  VIMO_SERVER_BASE_URL,
} from '@/modules/common/constants'
```

y `export const VERIFY_ACCESS_URL = 'https://vimo.click/api/verificar-acceso'` por:

<!-- prettier-ignore -->
```ts
export const VERIFY_ACCESS_URL = `${VIMO_SERVER_BASE_URL}/api/verificar-acceso`
```

En `src/modules/auth/api/index.ts`, reemplazar el comentario
`        // fetch directo a propósito: el fetcher común es sidecar-only (ADR-0006).` por:

<!-- prettier-ignore -->
```ts
        // fetch directo a propósito: el veredicto es fail-open y recuerda sus
        // flags, dos cosas que vimoServerFetch no hace (ADR-0006).
```

- [ ] **Paso 8: Correr el guard**

Run: `node --test scripts/test/check-app-vimo-server.mjs`
Expected: PASS, 17 casos (8 puros y 9 del cliente empaquetado).

- [ ] **Paso 9: Enmienda de la ADR-0006 (cliente de `common`)**

En `docs/adr/ADR-0006-autenticacion-doble-flujo-oauth-y-gate-por-loaders.md`:

1. Reemplazar:

<!-- prettier-ignore -->
```markdown
  - `grep -rln "supabase/client" src/ --include="*.ts*"` → solo
    `src/modules/auth/api/index.ts` (fuera de `common/supabase`) y, desde la
    ADR-0038, `src/modules/diagnostics/api/index.ts`.
```

por:

<!-- prettier-ignore -->
```markdown
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
```

2. Reemplazar:

<!-- prettier-ignore -->
```markdown
  - `node --test scripts/test/check-app-access-flags.mjs` en verde.
```

por:

<!-- prettier-ignore -->
```markdown
  - `node --test scripts/test/check-app-access-flags.mjs` y
    `node --test scripts/test/check-app-vimo-server.mjs` en verde.
```

3. En el ítem de regresión, reemplazar:

<!-- prettier-ignore -->
```markdown
  importa `authQueryKeys` o `AccessStatus` para leer un interruptor en vez de
  `useAccessFeature`.
```

por:

<!-- prettier-ignore -->
```markdown
  importa `authQueryKeys` o `AccessStatus` para leer un interruptor en vez de
  `useAccessFeature`; un hook o componente que llama a `vimoServerFetch` (o a `fetch`
  contra vimo.click) en vez de pasar por el `api/` de su módulo.
```

4. Antes de `## Referencias` (después de la enmienda de C1) agregar:

<!-- prettier-ignore -->
```markdown
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

```

- [ ] **Paso 10: Verificación**

Run:

<!-- prettier-ignore -->
```bash
pnpm exec prettier --write src/modules/common/types/vimoServer.ts src/modules/common/fetcher/vimoServerError.ts src/modules/common/fetcher/vimoServer.ts src/modules/common/constants.ts src/modules/auth/constants.ts src/modules/auth/api/index.ts scripts/test/check-app-vimo-server.mjs docs/adr/ADR-0006-autenticacion-doble-flujo-oauth-y-gate-por-loaders.md
pnpm exec eslint src/modules/common/types/vimoServer.ts src/modules/common/fetcher/vimoServerError.ts src/modules/common/fetcher/vimoServer.ts src/modules/common/constants.ts src/modules/auth/constants.ts src/modules/auth/api/index.ts
pnpm exec tsc -p tsconfig.app.json --noEmit
node --test scripts/test/check-app-vimo-server.mjs scripts/test/check-app-access-flags.mjs
node scripts/test/check-locales.mjs
grep -rln "supabase/client" src/ --include="*.ts*"
grep -rn "https://vimo.click" src/ --include="*.ts*"
```

Expected: todo en verde; `supabase/client` solo en `auth/api`, `diagnostics/api` y
`common/fetcher/vimoServer.ts`; `https://vimo.click` solo en `common/constants.ts` y
`settings/constants.ts`.

- [ ] **Paso 11: Commit (orquestador)**

<!-- prettier-ignore -->
```bash
git add src/modules/common/types/vimoServer.ts src/modules/common/fetcher/vimoServerError.ts src/modules/common/fetcher/vimoServer.ts src/modules/common/constants.ts src/modules/auth/constants.ts src/modules/auth/api/index.ts scripts/test/check-app-vimo-server.mjs docs/adr/ADR-0006-autenticacion-doble-flujo-oauth-y-gate-por-loaders.md
git commit -F - <<'EOF'
feat(common): add the vimo.click client with typed failures

Qué: vimoServerFetch (common/fetcher/vimoServer.ts) adjunta el Bearer de la
sesión de Supabase, manda el cuerpo en JSON, corta por timeout (15 s por
defecto, configurable por pedido, sesión incluida) y falla siempre con
VimoServerError: `network`, `timeout` o `http` con status, el `code` del
cuerpo y retryAfterSeconds. La clasificación vive en vimoServerError.ts
(puro). La URL base pasa a common (VIMO_SERVER_BASE_URL) y VERIFY_ACCESS_URL
se arma con ella.

Por qué: el agente reconstructor (ADR-0048) es el segundo endpoint de
vimo.click que usa la app; en vez de otra excepción de fetch por módulo hay
un cliente único, con errores que cada módulo traduce por código.

Con qué interactúa: lo va a usar videos/api (C3). verifyAccess sigue con su
fetch propio en auth/api (es fail-open y recuerda flags). Enmienda la
ADR-0006: excepción ampliada al cliente de common y greps de cumplimiento.
Guard nuevo: scripts/test/check-app-vimo-server.mjs, que además empaqueta el
cliente real con esbuild y lo prueba contra un servidor HTTP local.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Tarea C3: reconstruir desde la app

**Files:**

- Create: `src/modules/videos/types/gemRebuild.ts`
- Create: `src/modules/videos/utilities/gemTemplate.ts`
- Create: `src/modules/videos/utilities/singleFlight.ts`
- Modify: `src/modules/videos/constants.ts` (bloque del agente)
- Modify: `src/modules/videos/api/index.ts` (`rebuildGem`, `gemRebuildErrorKey`)
- Create: `src/modules/videos/hooks/useGemRebuild.ts`
- Create: `src/modules/videos/components/GemRebuildErrorText.tsx`
- Modify: `public/locales/es.json`, `public/locales/en.json`, `public/locales/pt.json`
- Test: `scripts/test/check-app-gem-rebuild.mjs`

**Interfaces:**

- Consumes: `vimoServerFetch`, `VimoServerError`, `vimoServerErrorCode`, `vimoServerRetryAt` (C2);
  `GemSections`, `GemSectionKey`, `StyleCharacterMode`, `GEM_SECTION_KEYS`, `GEM_TEMPLATE_VERSION`
  (tipos de la Tarea 0).
- Produces:
  - `GemRebuildOrigin`, `GemRebuildRequest`, `GemRebuildResponse` (`@/modules/videos/types/gemRebuild`,
    tal cual el plan maestro).
  - En `@/modules/videos/utilities/gemTemplate`: `GEM_SECTION_KEYS`, `GEM_TEMPLATE_VERSION`,
    `GEM_SECTION_LIMITS: Record<GemSectionKey, number>`, `GEM_TOTAL_CHAR_LIMIT`,
    `cleanGemSections(sections: GemSections): GemSections`,
    `gemSectionsLength(sections: GemSections): number`,
    `gemSectionsWithinLimits(sections: GemSections): boolean`,
    `gemRebuildRequest(text: string, origin: GemRebuildOrigin, appVersion: string, language: string | undefined): GemRebuildRequest`,
    `readGemRebuildResponse(body: unknown): GemRebuildResponse | null`.
  - `createSingleFlight<TResult>(): { run(key: string, task: () => Promise<TResult>): Promise<TResult> }`.
  - `videosApi.rebuildGem(request: GemRebuildRequest): Promise<GemRebuildResponse>` y
    `videosApi.gemRebuildErrorKey(error: unknown): string`.
  - `useGemRebuild(): { rebuild(flightKey: string, text: string, origin: GemRebuildOrigin): Promise<GemRebuildResponse | null>; pending: boolean; error: Error | null; reset: () => void }`.
  - `GemRebuildErrorText({ error }: { error: unknown })`: devuelve el texto traducido.

`appVersion` sale de `Brand.version` (`__APP_VERSION__`, que `vite.config.ts` lee de
`package.json`, ADR-0027). `locale` sale de `i18n.resolvedLanguage`: uno fuera de es/en/pt cae a
`en`, el `fallbackLng` de i18next.

- [ ] **Paso 1: Escribir el guard que falla**

Crear `scripts/test/check-app-gem-rebuild.mjs`:

<!-- prettier-ignore -->
```js
// El pedido y la respuesta del agente reconstructor (spec §6.1) del lado de la
// app, los límites de la gema por secciones (spec §4.1) y la regla de un solo
// pedido en vuelo por clave (el doble clic en «Preparar con IA»). Módulos puros
// de src/ corridos con Node (type stripping), sin bundler ni red.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  cleanGemSections,
  GEM_SECTION_KEYS,
  GEM_SECTION_LIMITS,
  GEM_TEMPLATE_VERSION,
  GEM_TOTAL_CHAR_LIMIT,
  gemRebuildRequest,
  gemSectionsLength,
  gemSectionsWithinLimits,
  readGemRebuildResponse,
} from '../../src/modules/videos/utilities/gemTemplate.ts'
import { createSingleFlight } from '../../src/modules/videos/utilities/singleFlight.ts'

const VALID_RESPONSE = {
  templateVersion: 1,
  sections: {
    visualStyle: '  Acuarela editorial, tinta suelta.  ',
    character: 'A tall woman with short gray hair. Outfit: a green raincoat.',
    dynamism: '',
    rules: '   ',
  },
  suggestions: {
    allowedModes: ['generic', 'own', 'none'],
    characterMode: 'generic',
  },
  warnings: ['La gema pedía escribir en español: se quitó.'],
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

test('orden, versión y límites de la spec §4.1', () => {
  assert.deepEqual(GEM_SECTION_KEYS, [
    'visualStyle',
    'character',
    'dynamism',
    'camera',
    'rules',
    'promptStart',
    'promptEnd',
  ])
  assert.equal(GEM_TEMPLATE_VERSION, 1)
  assert.deepEqual(GEM_SECTION_LIMITS, {
    visualStyle: 12_000,
    character: 700,
    dynamism: 12_000,
    camera: 12_000,
    rules: 12_000,
    promptStart: 600,
    promptEnd: 600,
  })
  assert.equal(GEM_TOTAL_CHAR_LIMIT, 30_000)
})

test('el pedido lleva la gema sin bordes, el origen, la versión y el idioma', () => {
  assert.deepEqual(
    gemRebuildRequest('  mi gema  ', 'mi-estilo', '0.9.0', 'es'),
    {
      text: 'mi gema',
      origin: 'mi-estilo',
      appVersion: '0.9.0',
      locale: 'es',
    },
  )
  assert.equal(gemRebuildRequest('g', 'migracion', '0.9.0', 'pt').locale, 'pt')
  assert.equal(
    gemRebuildRequest('g', 'migracion', '0.9.0', 'pt-BR').locale,
    'pt',
  )
})

test('un idioma fuera de es/en/pt, o ninguno, pide los avisos en inglés', () => {
  for (const language of [undefined, 'fr', 'en', 'EN-us'])
    assert.equal(
      gemRebuildRequest('g', 'mi-estilo', '0.9.0', language).locale,
      'en',
    )
})

test('cleanGemSections: sin bordes y sin opcionales vacías', () => {
  assert.deepEqual(
    cleanGemSections({ visualStyle: ' a ', character: '  ', camera: ' b ' }),
    { visualStyle: 'a', camera: 'b' },
  )
  assert.deepEqual(cleanGemSections({ visualStyle: '   ' }), {
    visualStyle: '',
  })
})

test('una respuesta válida sale con las secciones limpias', () => {
  assert.deepEqual(readGemRebuildResponse(VALID_RESPONSE), {
    templateVersion: 1,
    sections: {
      visualStyle: 'Acuarela editorial, tinta suelta.',
      character: 'A tall woman with short gray hair. Outfit: a green raincoat.',
    },
    suggestions: {
      allowedModes: ['generic', 'own', 'none'],
      characterMode: 'generic',
    },
    warnings: ['La gema pedía escribir en español: se quitó.'],
  })
})

test('claves de sección desconocidas y secciones null se ignoran', () => {
  const body = {
    ...VALID_RESPONSE,
    sections: { visualStyle: 'x', inventada: 'y', camera: null },
  }
  assert.deepEqual(readGemRebuildResponse(body)?.sections, { visualStyle: 'x' })
})

test('sin cuerpo, de otra versión, sin visualStyle o con una sección que no es texto: null', () => {
  const invalid = [
    null,
    'texto',
    { ...VALID_RESPONSE, templateVersion: 2 },
    { ...VALID_RESPONSE, templateVersion: '1' },
    { ...VALID_RESPONSE, sections: undefined },
    { ...VALID_RESPONSE, sections: { character: 'x' } },
    { ...VALID_RESPONSE, sections: { visualStyle: '   ' } },
    { ...VALID_RESPONSE, sections: { visualStyle: 'x', rules: 42 } },
  ]
  for (const body of invalid) assert.equal(readGemRebuildResponse(body), null)
})

test('una respuesta que pasa los límites no se usa', () => {
  const longCharacter = { visualStyle: 'x', character: 'a'.repeat(701) }
  assert.equal(
    readGemRebuildResponse({ ...VALID_RESPONSE, sections: longCharacter }),
    null,
  )
  const longTotal = {
    visualStyle: 'a'.repeat(12_000),
    dynamism: 'b'.repeat(12_000),
    camera: 'c'.repeat(6_001),
  }
  assert.equal(gemSectionsLength(longTotal), 30_001)
  assert.equal(
    readGemRebuildResponse({ ...VALID_RESPONSE, sections: longTotal }),
    null,
  )
  assert.equal(
    gemSectionsWithinLimits({ ...longTotal, camera: 'c'.repeat(6_000) }),
    true,
  )
})

test('avisos y sugerencias tolerantes: lo que no sirve se descarta', () => {
  const body = {
    ...VALID_RESPONSE,
    suggestions: {
      allowedModes: ['generic', 'otro', 3],
      characterMode: 'nadie',
    },
    warnings: ['a', ' a ', '', 7, 'b'],
  }
  const response = readGemRebuildResponse(body)
  assert.deepEqual(response?.suggestions, { allowedModes: ['generic'] })
  assert.deepEqual(response?.warnings, ['a', 'b'])
  const bare = {
    ...VALID_RESPONSE,
    suggestions: undefined,
    warnings: undefined,
  }
  assert.deepEqual(readGemRebuildResponse(bare)?.suggestions, {})
  assert.deepEqual(readGemRebuildResponse(bare)?.warnings, [])
})

test('una sola ejecución en vuelo por clave (doble clic)', async () => {
  const flights = createSingleFlight()
  const pending = deferred()
  let calls = 0
  const task = () => {
    calls += 1
    return pending.promise
  }
  const first = flights.run('st-1', task)
  const second = flights.run('st-1', task)
  assert.equal(first, second)
  pending.resolve('secciones')
  assert.deepEqual(await Promise.all([first, second]), [
    'secciones',
    'secciones',
  ])
  assert.equal(calls, 1)
})

test('al terminar, bien o mal, la clave queda libre para otro intento', async () => {
  const flights = createSingleFlight()
  const failing = deferred()
  const first = flights.run('st-1', () => failing.promise)
  failing.reject(new Error('sin red'))
  await assert.rejects(first, /sin red/)
  assert.equal(await flights.run('st-1', async () => 'reintento'), 'reintento')
})

test('claves distintas corren a la vez', async () => {
  const flights = createSingleFlight()
  let calls = 0
  const task = async () => {
    calls += 1
    return calls
  }
  await Promise.all([flights.run('st-1', task), flights.run('st-2', task)])
  assert.equal(calls, 2)
})
```

- [ ] **Paso 2: Correrlo y verlo fallar**

Run: `node --test scripts/test/check-app-gem-rebuild.mjs`
Expected: FAIL con `ERR_MODULE_NOT_FOUND` (todavía no existe `gemTemplate.ts`).

- [ ] **Paso 3: Tipos del contrato**

Crear `src/modules/videos/types/gemRebuild.ts` (el plan maestro, ya formateado):

<!-- prettier-ignore -->
```ts
import type { GemSections, StyleCharacterMode } from '@pipeline/types/styles.ts'

export type GemRebuildOrigin = 'mi-estilo' | 'catalogo' | 'migracion'

export interface GemRebuildRequest {
  text: string
  origin: GemRebuildOrigin
  appVersion: string
  locale: 'es' | 'en' | 'pt'
}

export interface GemRebuildResponse {
  templateVersion: number
  sections: GemSections
  suggestions: {
    allowedModes?: StyleCharacterMode[]
    characterMode?: StyleCharacterMode
  }
  warnings: string[]
}
```

- [ ] **Paso 4: Gema por secciones del lado de la app (puro)**

Crear `src/modules/videos/utilities/gemTemplate.ts`:

<!-- prettier-ignore -->
```ts
import type {
  GEM_SECTION_KEYS as PIPELINE_GEM_SECTION_KEYS,
  GEM_TEMPLATE_VERSION as PIPELINE_GEM_TEMPLATE_VERSION,
  GemSectionKey,
  GemSections,
  StyleCharacterMode,
} from '@pipeline/types/styles.ts'
import type {
  GemRebuildOrigin,
  GemRebuildRequest,
  GemRebuildResponse,
} from '@/modules/videos/types/gemRebuild'

// La gema por secciones del lado de la app (ADR-0048, spec §4 y §6.1). Módulo
// puro, sin imports de runtime, como utilities/promptCost.ts (ADR-0020): así
// los guards scripts/test/check-app-gem-*.mjs lo corren con Node, sin bundler.
// Por eso sus constantes viven acá y no en constants.ts.

// Espejos de pipeline/types/styles.ts. `src/` solo importa TIPOS de
// `pipeline/` (ADR-0010: el alias @pipeline no existe en runtime), así que los
// valores se repiten; la anotación con `typeof` obliga a que coincidan
// elemento por elemento: si el sidecar cambia el orden o la versión, esto deja
// de compilar.
export const GEM_SECTION_KEYS: typeof PIPELINE_GEM_SECTION_KEYS = [
  'visualStyle',
  'character',
  'dynamism',
  'camera',
  'rules',
  'promptStart',
  'promptEnd',
]
export const GEM_TEMPLATE_VERSION: typeof PIPELINE_GEM_TEMPLATE_VERSION = 1

// Límites de la spec §4.1: cada sección hasta 12 000 caracteres, `character`
// hasta 700 (la identidad tejida), las frases fijas hasta 600 y la suma hasta
// 30 000 (el tope de siempre de una gema).
export const GEM_SECTION_LIMITS: Record<GemSectionKey, number> = {
  visualStyle: 12_000,
  character: 700,
  dynamism: 12_000,
  camera: 12_000,
  rules: 12_000,
  promptStart: 600,
  promptEnd: 600,
}
export const GEM_TOTAL_CHAR_LIMIT = 30_000

/**
 * Las secciones como se guardan: sin espacios en los bordes y sin las
 * opcionales vacías (una sección vacía no existe). `visualStyle` queda
 * siempre, aunque esté vacía: decide quien valida.
 */
export function cleanGemSections(sections: GemSections): GemSections {
  const cleaned: GemSections = { visualStyle: sections.visualStyle.trim() }
  for (const key of GEM_SECTION_KEYS) {
    if (key === 'visualStyle') continue
    const value = sections[key]?.trim()
    if (value) cleaned[key] = value
  }

  return cleaned
}

/** Caracteres de todas las secciones, tal como están. */
export function gemSectionsLength(sections: GemSections): number {
  return GEM_SECTION_KEYS.reduce(
    (total, key) => total + (sections[key] ?? '').length,
    0,
  )
}

/** Cada sección dentro de su límite y la suma dentro del total. */
export function gemSectionsWithinLimits(sections: GemSections): boolean {
  if (gemSectionsLength(sections) > GEM_TOTAL_CHAR_LIMIT) return false
  return GEM_SECTION_KEYS.every(
    (key) => (sections[key] ?? '').length <= GEM_SECTION_LIMITS[key],
  )
}

// El idioma de la app como lo pide el contrato. Uno fuera de es/en/pt (o
// ninguno todavía) cae al de respaldo de i18next: inglés.
function rebuildLocaleOf(
  language: string | undefined,
): GemRebuildRequest['locale'] {
  const base = language?.slice(0, 2).toLowerCase()
  if (base === 'es' || base === 'pt') return base
  return 'en'
}

/**
 * El pedido al agente reconstructor: la gema sin espacios en los bordes, de
 * dónde viene, la versión de la app y su idioma (el agente escribe los avisos
 * en ese idioma).
 */
export function gemRebuildRequest(
  text: string,
  origin: GemRebuildOrigin,
  appVersion: string,
  language: string | undefined,
): GemRebuildRequest {
  return {
    text: text.trim(),
    origin,
    appVersion,
    locale: rebuildLocaleOf(language),
  }
}

function isStyleCharacterMode(value: unknown): value is StyleCharacterMode {
  return value === 'own' || value === 'generic' || value === 'none'
}

function readGemSections(value: unknown): GemSections | null {
  if (typeof value !== 'object' || value === null) return null
  const visualStyle: unknown = Reflect.get(value, 'visualStyle')
  if (typeof visualStyle !== 'string' || !visualStyle.trim()) return null

  const sections: GemSections = { visualStyle }
  for (const key of GEM_SECTION_KEYS) {
    if (key === 'visualStyle') continue
    const section: unknown = Reflect.get(value, key)
    if (section === undefined || section === null) continue
    if (typeof section !== 'string') return null
    sections[key] = section
  }

  const cleaned = cleanGemSections(sections)
  if (!gemSectionsWithinLimits(cleaned)) return null
  return cleaned
}

function readSuggestions(value: unknown): GemRebuildResponse['suggestions'] {
  if (typeof value !== 'object' || value === null) return {}
  const allowedModes: unknown = Reflect.get(value, 'allowedModes')
  const characterMode: unknown = Reflect.get(value, 'characterMode')

  return {
    ...(Array.isArray(allowedModes)
      ? { allowedModes: allowedModes.filter(isStyleCharacterMode) }
      : {}),
    ...(isStyleCharacterMode(characterMode) ? { characterMode } : {}),
  }
}

function readWarnings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const warnings = value
    .filter((warning): warning is string => typeof warning === 'string')
    .map((warning) => warning.trim())
    .filter(Boolean)
  return [...new Set(warnings)]
}

/**
 * La respuesta 200 del agente, revisada antes de usarla (un servidor a medio
 * desplegar puede mandar otra cosa): la versión de plantilla que entiende esta
 * app, un `visualStyle` con texto, cada sección presente como texto y todo
 * dentro de los límites. Las secciones salen limpias y los avisos sin
 * repetidos. null = no se usa: la app lo muestra como error del servidor.
 */
export function readGemRebuildResponse(
  body: unknown,
): GemRebuildResponse | null {
  if (typeof body !== 'object' || body === null) return null
  if (Reflect.get(body, 'templateVersion') !== GEM_TEMPLATE_VERSION) return null

  const sections = readGemSections(Reflect.get(body, 'sections'))
  if (!sections) return null

  return {
    templateVersion: GEM_TEMPLATE_VERSION,
    sections,
    suggestions: readSuggestions(Reflect.get(body, 'suggestions')),
    warnings: readWarnings(Reflect.get(body, 'warnings')),
  }
}
```

- [ ] **Paso 5: Un solo pedido en vuelo por clave (puro)**

Crear `src/modules/videos/utilities/singleFlight.ts`:

<!-- prettier-ignore -->
```ts
// Una sola ejecución en vuelo por clave: mientras la primera no termina, las
// siguientes reciben la MISMA promesa (un doble clic en «Preparar con IA», dos
// pantallas que piden lo mismo). Al terminar, bien o mal, la clave queda libre
// para otro intento. Puro: lo corre scripts/test/check-app-gem-rebuild.mjs.
export function createSingleFlight<TResult>() {
  const pending = new Map<string, Promise<TResult>>()

  return {
    run(key: string, task: () => Promise<TResult>): Promise<TResult> {
      const current = pending.get(key)
      if (current) return current

      const promise = task().finally(() => {
        pending.delete(key)
      })
      pending.set(key, promise)
      return promise
    },
  }
}
```

- [ ] **Paso 6: Correr el guard**

Run: `node --test scripts/test/check-app-gem-rebuild.mjs`
Expected: PASS, 12 casos.

- [ ] **Paso 7: Constantes del agente**

En `src/modules/videos/constants.ts`, justo antes de la línea:

<!-- prettier-ignore -->
```ts
// Ids `st-<timestamp36>-<rand>`: cronológicos y dentro del STYLE_ID_PATTERN
```

agregar:

<!-- prettier-ignore -->
```ts
// ── Agente reconstructor de gemas (vimo.click, ADR-0048) ──

// Ruta del endpoint; la URL base es de common (VIMO_SERVER_BASE_URL).
export const GEM_REBUILD_PATH = '/api/estilos/reconstruir'
// El servidor corta al modelo a los 120 s: el cliente espera un poco más para
// recibir su `modelo-timeout` en vez de adelantarse con un timeout propio.
export const GEM_REBUILD_TIMEOUT_MS = 150_000
// Código → clave i18n: los del servidor (spec §6.1 más los tres que sumó el
// contrato: `pedido-invalido`, `funcion-desactivada` y `error-interno`; se
// comparan tal cual llegan) y los del cliente común de vimo.click (`network`
// y `timeout`).
export const GEM_REBUILD_ERROR_MESSAGE_KEYS: Record<string, string> = {
  'sin-token': 'create.gemTemplate.errors.session',
  'token-invalido': 'create.gemTemplate.errors.session',
  'sin-acceso': 'create.gemTemplate.errors.noAccess',
  'funcion-desactivada': 'create.gemTemplate.errors.featureOff',
  'pedido-invalido': 'create.gemTemplate.errors.invalidRequest',
  'texto-invalido': 'create.gemTemplate.errors.invalidText',
  'cupo-agotado': 'create.gemTemplate.errors.quotaExhausted',
  'modelo-fallo': 'create.gemTemplate.errors.modelFailed',
  'modelo-timeout': 'create.gemTemplate.errors.modelTimeout',
  'error-interno': 'create.gemTemplate.errors.serverError',
  network: 'create.gemTemplate.errors.network',
  timeout: 'create.gemTemplate.errors.timeout',
}
export const UNKNOWN_GEM_REBUILD_ERROR_KEY = 'create.gemTemplate.errors.unknown'
// Cupo agotado sin la hora en que vuelve (el contrato la manda siempre; si
// falta, el mensaje no la promete).
export const GEM_REBUILD_QUOTA_CODE = 'cupo-agotado'
export const GEM_REBUILD_QUOTA_LATER_KEY =
  'create.gemTemplate.errors.quotaExhaustedLater'

```

- [ ] **Paso 8: `videosApi` llama al agente**

En `src/modules/videos/api/index.ts`, reemplazar:

<!-- prettier-ignore -->
```ts
import { isNative } from '@/modules/common/utilities/isNative'
import {
  DEMO_ERROR_MESSAGE_KEYS,
  LIBRARY_ERROR_MESSAGE_KEYS,
  NARRATION_AUDIO_EXTENSIONS,
  UNKNOWN_CREATE_ERROR_KEY,
  UNKNOWN_DEMO_ERROR_KEY,
} from '@/modules/videos/constants'
import type { PipelineJobHandle } from '@/modules/common/fetcher/pipeline'
```

por:

<!-- prettier-ignore -->
```ts
import { vimoServerFetch } from '@/modules/common/fetcher/vimoServer'
import {
  VimoServerError,
  vimoServerErrorCode,
  vimoServerRetryAt,
} from '@/modules/common/fetcher/vimoServerError'
import { isNative } from '@/modules/common/utilities/isNative'
import {
  DEMO_ERROR_MESSAGE_KEYS,
  GEM_REBUILD_ERROR_MESSAGE_KEYS,
  GEM_REBUILD_PATH,
  GEM_REBUILD_QUOTA_CODE,
  GEM_REBUILD_QUOTA_LATER_KEY,
  GEM_REBUILD_TIMEOUT_MS,
  LIBRARY_ERROR_MESSAGE_KEYS,
  NARRATION_AUDIO_EXTENSIONS,
  UNKNOWN_CREATE_ERROR_KEY,
  UNKNOWN_DEMO_ERROR_KEY,
  UNKNOWN_GEM_REBUILD_ERROR_KEY,
} from '@/modules/videos/constants'
import { readGemRebuildResponse } from '@/modules/videos/utilities/gemTemplate'
import type { PipelineJobHandle } from '@/modules/common/fetcher/pipeline'
import type {
  GemRebuildRequest,
  GemRebuildResponse,
} from '@/modules/videos/types/gemRebuild'
```

y, en el objeto `videosApi`, justo antes de `  async demoStatus(): Promise<DemoStatusResult> {`,
agregar:

<!-- prettier-ignore -->
```ts
  // Agente reconstructor de vimo.click (ADR-0048): la gema entera vuelve por
  // secciones. Una respuesta 200 que no cumple el contrato no se usa.
  async rebuildGem(request: GemRebuildRequest): Promise<GemRebuildResponse> {
    const body = await vimoServerFetch<unknown>(GEM_REBUILD_PATH, {
      body: request,
      timeoutMs: GEM_REBUILD_TIMEOUT_MS,
    })
    const response = readGemRebuildResponse(body)
    if (!response) throw new VimoServerError('http', { status: 200 })
    return response
  },
  gemRebuildErrorKey(error: unknown): string {
    const code = vimoServerErrorCode(error)
    if (!code) return UNKNOWN_GEM_REBUILD_ERROR_KEY
    if (code === GEM_REBUILD_QUOTA_CODE && vimoServerRetryAt(error) === null)
      return GEM_REBUILD_QUOTA_LATER_KEY
    return GEM_REBUILD_ERROR_MESSAGE_KEYS[code] ?? UNKNOWN_GEM_REBUILD_ERROR_KEY
  },
```

- [ ] **Paso 9: Hook de la mutación**

Crear `src/modules/videos/hooks/useGemRebuild.ts`:

<!-- prettier-ignore -->
```ts
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Brand } from '@/modules/common/brand/brand'
import { videosApi } from '@/modules/videos/api'
import { gemRebuildRequest } from '@/modules/videos/utilities/gemTemplate'
import { createSingleFlight } from '@/modules/videos/utilities/singleFlight'
import type {
  GemRebuildOrigin,
  GemRebuildRequest,
  GemRebuildResponse,
} from '@/modules/videos/types/gemRebuild'

// Una sola reconstrucción en vuelo por clave: un doble clic en «Preparar con
// IA» recibe la MISMA promesa y al agente le llega un solo pedido (cada pedido
// gasta cupo diario y deja una fila en gem_rebuild_logs).
const rebuildFlights = createSingleFlight<GemRebuildResponse>()

// Manda una gema completa al agente reconstructor de vimo.click (ADR-0048),
// con la versión de la app (Brand.version, de package.json) y su idioma, en el
// que el agente escribe los avisos. Devuelve null si falla: el error queda en
// `error` para mostrarlo y el texto pegado lo conserva quien llama.
export function useGemRebuild() {
  const { i18n } = useTranslation()
  const mutation = useMutation({
    mutationFn: (request: GemRebuildRequest) => videosApi.rebuildGem(request),
  })

  const rebuild = async (
    flightKey: string,
    text: string,
    origin: GemRebuildOrigin,
  ): Promise<GemRebuildResponse | null> => {
    const request = gemRebuildRequest(
      text,
      origin,
      Brand.version,
      i18n.resolvedLanguage,
    )
    try {
      return await rebuildFlights.run(flightKey, () =>
        mutation.mutateAsync(request),
      )
    } catch {
      return null
    }
  }

  return {
    rebuild,
    pending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  }
}
```

- [ ] **Paso 10: Error traducido**

Crear `src/modules/videos/components/GemRebuildErrorText.tsx`:

<!-- prettier-ignore -->
```tsx
import { useTranslation } from 'react-i18next'
import { vimoServerRetryAt } from '@/modules/common/fetcher/vimoServerError'
import { formatDateTime } from '@/modules/common/utilities/formatDateTime'
import { videosApi } from '@/modules/videos/api'
import { CUSTOM_STYLE_PROMPT_LIMIT } from '@/modules/videos/constants'

interface GemRebuildErrorTextProps {
  error: unknown
}

// Por qué falló el agente reconstructor, traducido (spec §11): con el cupo
// agotado dice cuándo vuelve a haber; con el texto inválido, el tope.
export function GemRebuildErrorText({ error }: GemRebuildErrorTextProps) {
  const { t, i18n } = useTranslation()
  const retryAt = vimoServerRetryAt(error)

  return t(videosApi.gemRebuildErrorKey(error), {
    when: retryAt ? formatDateTime(retryAt, i18n.resolvedLanguage) : '',
    limit: CUSTOM_STYLE_PROMPT_LIMIT.toLocaleString(),
  })
}
```

- [ ] **Paso 11: Textos (es, en, pt)**

En cada catálogo, dentro de `create`, insertar el bloque justo antes de la línea
`    "promptModelIssue": {` (única en cada archivo).

`public/locales/es.json`:

<!-- prettier-ignore -->
```text
    "gemTemplate": {
      "errors": {
        "session": "Tu sesión venció. Cerrá sesión y volvé a entrar.",
        "noAccess": "Tu cuenta no tiene acceso a Vimo en este momento.",
        "featureOff": "Preparar estilos con IA no está disponible para tu cuenta por ahora.",
        "invalidRequest": "Vimo no entendió el pedido de la app. Actualizá Vimo y reintentá.",
        "invalidText": "La gema está vacía o pasa de {{limit}} caracteres.",
        "quotaExhausted": "Llegaste al máximo de estilos preparados por hoy. Vas a poder volver a intentarlo el {{when}}.",
        "quotaExhaustedLater": "Llegaste al máximo de estilos preparados por hoy. Volvé a intentarlo más tarde.",
        "modelFailed": "La IA no pudo ordenar tu gema. Reintentá en un momento.",
        "modelTimeout": "La IA tardó demasiado en responder. Reintentá.",
        "network": "No pudimos conectarnos con Vimo. Revisá tu conexión y reintentá.",
        "timeout": "Vimo tardó demasiado en responder. Reintentá.",
        "serverError": "Vimo tuvo un problema de su lado. Reintentá en unos minutos.",
        "unknown": "No pudimos preparar tu estilo. Reintentá."
      }
    },
```

`public/locales/en.json`:

<!-- prettier-ignore -->
```text
    "gemTemplate": {
      "errors": {
        "session": "Your session expired. Sign out and sign in again.",
        "noAccess": "Your account doesn't have access to Vimo right now.",
        "featureOff": "Preparing styles with AI isn't available for your account right now.",
        "invalidRequest": "Vimo couldn't understand the app's request. Update Vimo and try again.",
        "invalidText": "The gem is empty or longer than {{limit}} characters.",
        "quotaExhausted": "You've reached today's limit of prepared styles. You can try again on {{when}}.",
        "quotaExhaustedLater": "You've reached today's limit of prepared styles. Try again later.",
        "modelFailed": "The AI couldn't sort your gem. Try again in a moment.",
        "modelTimeout": "The AI took too long to answer. Try again.",
        "network": "We couldn't reach Vimo. Check your connection and try again.",
        "timeout": "Vimo took too long to answer. Try again.",
        "serverError": "Vimo had a problem on its side. Try again in a few minutes.",
        "unknown": "We couldn't prepare your style. Try again."
      }
    },
```

`public/locales/pt.json`:

<!-- prettier-ignore -->
```text
    "gemTemplate": {
      "errors": {
        "session": "Sua sessão expirou. Saia e entre de novo.",
        "noAccess": "Sua conta não tem acesso ao Vimo no momento.",
        "featureOff": "Preparar estilos com IA não está disponível para sua conta no momento.",
        "invalidRequest": "O Vimo não entendeu o pedido do app. Atualize o Vimo e tente de novo.",
        "invalidText": "A gema está vazia ou passa de {{limit}} caracteres.",
        "quotaExhausted": "Você chegou ao limite de estilos preparados de hoje. Poderá tentar de novo em {{when}}.",
        "quotaExhaustedLater": "Você chegou ao limite de estilos preparados de hoje. Tente de novo mais tarde.",
        "modelFailed": "A IA não conseguiu organizar sua gema. Tente de novo em instantes.",
        "modelTimeout": "A IA demorou demais para responder. Tente de novo.",
        "network": "Não conseguimos nos conectar ao Vimo. Verifique sua conexão e tente de novo.",
        "timeout": "O Vimo demorou demais para responder. Tente de novo.",
        "serverError": "O Vimo teve um problema do lado dele. Tente de novo em alguns minutos.",
        "unknown": "Não conseguimos preparar seu estilo. Tente de novo."
      }
    },
```

- [ ] **Paso 12: Verificación**

Run:

<!-- prettier-ignore -->
```bash
pnpm exec prettier --write src/modules/videos/types/gemRebuild.ts src/modules/videos/utilities/gemTemplate.ts src/modules/videos/utilities/singleFlight.ts src/modules/videos/constants.ts src/modules/videos/api/index.ts src/modules/videos/hooks/useGemRebuild.ts src/modules/videos/components/GemRebuildErrorText.tsx scripts/test/check-app-gem-rebuild.mjs public/locales/es.json public/locales/en.json public/locales/pt.json
pnpm exec eslint src/modules/videos/types/gemRebuild.ts src/modules/videos/utilities/gemTemplate.ts src/modules/videos/utilities/singleFlight.ts src/modules/videos/constants.ts src/modules/videos/api/index.ts src/modules/videos/hooks/useGemRebuild.ts src/modules/videos/components/GemRebuildErrorText.tsx
pnpm exec tsc -p tsconfig.app.json --noEmit
node --test scripts/test/check-app-gem-rebuild.mjs
node scripts/test/check-locales.mjs
```

Expected: todo en verde; `check-locales` con 13 claves más que antes, alineadas.

- [ ] **Paso 13: Commit (orquestador)**

<!-- prettier-ignore -->
```bash
git add src/modules/videos/types/gemRebuild.ts src/modules/videos/utilities/gemTemplate.ts src/modules/videos/utilities/singleFlight.ts src/modules/videos/constants.ts src/modules/videos/api/index.ts src/modules/videos/hooks/useGemRebuild.ts src/modules/videos/components/GemRebuildErrorText.tsx scripts/test/check-app-gem-rebuild.mjs public/locales/es.json public/locales/en.json public/locales/pt.json
git commit -F - <<'EOF'
feat(videos): call the gem rebuild agent from the app

Qué: los tipos del contrato del agente (videos/types/gemRebuild.ts);
videosApi.rebuildGem, que llama a POST /api/estilos/reconstruir con
vimoServerFetch (150 s) y revisa la respuesta antes de usarla;
videosApi.gemRebuildErrorKey con el mapa código → clave i18n de los códigos
del servidor (incluidos pedido-invalido, funcion-desactivada y error-interno)
más network y timeout; el hook useGemRebuild (un solo pedido en vuelo por
clave, appVersion de Brand.version y locale del idioma de la app) y
GemRebuildErrorText, que dice cuándo vuelve el cupo. gemTemplate.ts nace con
los espejos de GEM_SECTION_KEYS y GEM_TEMPLATE_VERSION (un `typeof` los ata
al sidecar), los límites de la spec §4.1 y la lectura de la respuesta.

Por qué: una gema completa (nueva, reemplazada o vieja por migrar) solo se
ordena por secciones con el agente reconstructor de vimo.click (ADR-0048).
Cada pedido gasta cupo y deja una fila en gem_rebuild_logs: un doble clic no
puede mandar dos.

Con qué interactúa: el endpoint del frente B, el cliente común de C2 y los
tipos de pipeline/types/styles.ts (Tarea 0). Lo usan el modal (C4) y la
migración (C5). Textos create.gemTemplate.errors.* en es, en y pt. Guard
nuevo: scripts/test/check-app-gem-rebuild.mjs. Todavía no hay UI que lo llame.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Tarea C4a: lógica de las secciones

**Files:**

- Modify: `src/modules/videos/utilities/gemTemplate.ts` (imports, `COLOR_FILTER_IDS` y funciones al final)
- Create: `src/modules/videos/utilities/englishSections.ts`
- Modify: `src/modules/videos/types/styles.ts` (entero)
- Modify: `src/modules/videos/utilities/selectedCustomStyle.ts` (entero)
- Modify: `src/modules/videos/constants.ts` (import y textos de secciones y presets)
- Modify: `public/locales/es.json`, `public/locales/en.json`, `public/locales/pt.json`
- Test: `scripts/test/check-app-gem-sections.mjs`

**Interfaces:**

- Consumes: `cleanGemSections`, `gemSectionsLength`, `GEM_SECTION_KEYS`, `GEM_SECTION_LIMITS`,
  `GEM_TOTAL_CHAR_LIMIT` (C3); tipos de la Tarea 0.
- Produces:
  - En `@/modules/videos/types/styles`: `SelectedCustomStyle` y `CustomStyleDraft` con
    `sections?`, `templateVersion?`, `colorFilter?` (`systemPrompt: string` queda y vale `''` en
    una gema de plantilla); `TemplateStyleDraft`; `GemTextSource = Pick<CustomStyleSummary, 'systemPrompt' | 'sections'>`.
  - En `@/modules/videos/utilities/gemTemplate`: `COLOR_FILTER_IDS`,
    `sectionMaxLength(sections: GemSections, key: GemSectionKey): number`,
    `sameGemSections(first: GemSections, second: GemSections): boolean`,
    `hasGemText(gem: GemTextSource): boolean`, `gemCharCount(gem: GemTextSource): number`,
    `templateStyleSavePayload(draft: TemplateStyleDraft): StyleSavePayload` (lleva siempre el
    `templateVersion` del borrador).
  - En `@/modules/videos/utilities/englishSections`: `ENGLISH_ONLY_SECTION_KEYS`,
    `looksEnglish(text: string): boolean`, `nonEnglishSectionKeys(sections: GemSections): GemSectionKey[]`.
  - En `@/modules/videos/utilities/selectedCustomStyle`: `selectedCustomStyleFrom(style)` (con
    secciones) y `customStyleDraftFrom(style: CustomStyleSummary): CustomStyleDraft`.
  - En `@/modules/videos/constants`: `CUSTOM_STYLE_FIELD_CLASS`,
    `GEM_SECTION_TEXT_KEYS: Record<GemSectionKey, { titleKey: string; hintKey: string }>` y
    `COLOR_FILTER_LABEL_KEYS: Record<ColorFilterId, string>`.

- [ ] **Paso 1: Escribir el guard que falla**

Crear `scripts/test/check-app-gem-sections.mjs`:

<!-- prettier-ignore -->
```js
// La gema por secciones en el modal (spec §4 y §7): topes por sección y total,
// qué cuenta como cambio, cuánto texto tiene la gema, el guardado con su
// `templateVersion` y sin `systemPrompt` ni `shots`, la heurística de inglés y
// el snapshot del formulario. Módulos puros de src/ corridos con Node (type
// stripping), sin bundler.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  COLOR_FILTER_IDS,
  gemCharCount,
  hasGemText,
  sameGemSections,
  sectionMaxLength,
  templateStyleSavePayload,
} from '../../src/modules/videos/utilities/gemTemplate.ts'
import {
  looksEnglish,
  nonEnglishSectionKeys,
} from '../../src/modules/videos/utilities/englishSections.ts'
import {
  customStyleDraftFrom,
  selectedCustomStyleFrom,
} from '../../src/modules/videos/utilities/selectedCustomStyle.ts'

const OLD_GEM = {
  id: 'st-vieja',
  name: 'Vieja',
  systemPrompt: 'Acuarela editorial con tinta suelta.',
  shots: ['Wide shot'],
  character: { mode: 'own', defaultCharacterId: 'ana' },
  createdAt: '2026-09-01T00:00:00.000Z',
  samples: [],
}

const TEMPLATE_GEM = {
  id: 'st-plantilla',
  name: 'Plantilla',
  shots: [],
  createdAt: '2026-09-30T00:00:00.000Z',
  samples: [],
  sections: {
    visualStyle: 'Acuarela editorial con tinta suelta.',
    character: 'A tall woman with short gray hair. Outfit: a green raincoat.',
    camera: 'Planos abiertos.',
  },
  templateVersion: 1,
  colorFilter: 'fantasy',
}

test('los tres presets de color, en el orden en que se ofrecen', () => {
  assert.deepEqual(COLOR_FILTER_IDS, ['none', 'fantasy', 'horror-bw'])
})

test('tope de una sección: su límite o lo que queda del total', () => {
  assert.equal(sectionMaxLength({ visualStyle: '' }, 'character'), 700)
  assert.equal(sectionMaxLength({ visualStyle: '' }, 'promptEnd'), 600)
  assert.equal(
    sectionMaxLength({ visualStyle: 'x'.repeat(100) }, 'visualStyle'),
    12_000,
  )
  const nearlyFull = {
    visualStyle: 'a'.repeat(12_000),
    dynamism: 'b'.repeat(12_000),
    rules: 'c'.repeat(5_900),
  }
  assert.equal(sectionMaxLength(nearlyFull, 'camera'), 100)
  assert.equal(sectionMaxLength(nearlyFull, 'rules'), 6_000)
  assert.equal(
    sectionMaxLength(
      { ...nearlyFull, rules: 'c'.repeat(6_000) },
      'promptStart',
    ),
    0,
  )
})

test('mismas secciones: espacios de más u opcionales vacías no son un cambio', () => {
  assert.equal(
    sameGemSections(
      { visualStyle: 'a', character: '' },
      { visualStyle: ' a ', rules: '   ' },
    ),
    true,
  )
  assert.equal(
    sameGemSections({ visualStyle: 'a' }, { visualStyle: 'b' }),
    false,
  )
  assert.equal(
    sameGemSections({ visualStyle: 'a' }, { visualStyle: 'a', camera: 'x' }),
    false,
  )
})

test('texto de la gema: estilo visual en una de plantilla, texto en una vieja', () => {
  assert.equal(hasGemText(TEMPLATE_GEM), true)
  assert.equal(hasGemText({ sections: { visualStyle: '   ' } }), false)
  assert.equal(hasGemText(OLD_GEM), true)
  assert.equal(hasGemText({ systemPrompt: '  ' }), false)
  assert.equal(gemCharCount(OLD_GEM), OLD_GEM.systemPrompt.length)
  assert.equal(
    gemCharCount(TEMPLATE_GEM),
    TEMPLATE_GEM.sections.visualStyle.length +
      TEMPLATE_GEM.sections.character.length +
      TEMPLATE_GEM.sections.camera.length,
  )
})

test('guardar una gema de plantilla: siempre con templateVersion, sin systemPrompt ni shots; sourcePrompt solo si se reconstruyó', () => {
  const draft = {
    id: 'st-plantilla',
    name: 'Plantilla',
    sections: {
      visualStyle: ' Acuarela ',
      character: '',
      camera: 'Planos abiertos.',
    },
    templateVersion: 1,
    colorFilter: 'horror-bw',
    character: { mode: 'generic' },
    sourcePrompt: null,
  }
  const edited = templateStyleSavePayload(draft)
  assert.deepEqual(edited, {
    id: 'st-plantilla',
    name: 'Plantilla',
    sections: { visualStyle: 'Acuarela', camera: 'Planos abiertos.' },
    templateVersion: 1,
    colorFilter: 'horror-bw',
    character: { mode: 'generic' },
  })
  assert.equal('systemPrompt' in edited, false)
  assert.equal('shots' in edited, false)
  const rebuilt = templateStyleSavePayload({
    ...draft,
    sourcePrompt: 'mi gema',
  })
  assert.equal(rebuilt.sourcePrompt, 'mi gema')
})

test('inglés: frases en inglés, aunque tengan un nombre con tilde', () => {
  for (const text of [
    'A 40-year-old man with gray hair. Outfit: navy blazer and brown leather boots.',
    'Sofía, a young woman with dark hair. Outfit: a red coat.',
    'Cinematic still, 35mm film grain',
    'Do not show any text in the image',
  ])
    assert.equal(looksEnglish(text), true, text)
})

test('inglés: español o portugués se detectan', () => {
  for (const text of [
    'Hombre de 40 años, pelo canoso, lleva un saco azul.',
    'Hombre de 40 años, pelo canoso. Outfit: saco azul.',
    'Mulher jovem de cabelo cacheado, veste uma jaqueta verde.',
    'Ilustración acuarela',
  ])
    assert.equal(looksEnglish(text), false, text)
})

test('solo se avisan las secciones en inglés con texto que no lo parece', () => {
  assert.deepEqual(
    nonEnglishSectionKeys({
      visualStyle: 'Acuarela con tinta suelta, en español a propósito.',
      character: 'Hombre de 40 años, lleva un saco azul.',
      promptStart: 'Editorial watercolor illustration,',
      promptEnd: '   ',
    }),
    ['character'],
  )
  assert.deepEqual(
    nonEnglishSectionKeys({
      visualStyle: 'x',
      promptEnd: 'con grano de película',
    }),
    ['promptEnd'],
  )
})

test('el snapshot de una gema vieja es exactamente el de antes', () => {
  const selected = selectedCustomStyleFrom(OLD_GEM)
  assert.equal(
    JSON.stringify(selected),
    JSON.stringify({
      styleId: 'st-vieja',
      name: 'Vieja',
      systemPrompt: 'Acuarela editorial con tinta suelta.',
      shots: ['Wide shot'],
      character: { mode: 'own', defaultCharacterId: 'ana' },
    }),
  )
})

test('el snapshot de una gema de plantilla lleva secciones, versión y filtro', () => {
  assert.deepEqual(selectedCustomStyleFrom(TEMPLATE_GEM), {
    styleId: 'st-plantilla',
    name: 'Plantilla',
    systemPrompt: '',
    shots: [],
    sections: TEMPLATE_GEM.sections,
    templateVersion: 1,
    colorFilter: 'fantasy',
  })
})

test('el borrador del modal sale de la tarjeta, vieja o de plantilla', () => {
  assert.deepEqual(customStyleDraftFrom(OLD_GEM), {
    name: 'Vieja',
    systemPrompt: 'Acuarela editorial con tinta suelta.',
    shots: ['Wide shot'],
    character: { mode: 'own', defaultCharacterId: 'ana' },
  })
  assert.deepEqual(customStyleDraftFrom(TEMPLATE_GEM), {
    name: 'Plantilla',
    systemPrompt: '',
    shots: [],
    sections: TEMPLATE_GEM.sections,
    templateVersion: 1,
    colorFilter: 'fantasy',
  })
})
```

- [ ] **Paso 2: Correrlo y verlo fallar**

Run: `node --test scripts/test/check-app-gem-sections.mjs`
Expected: FAIL (`COLOR_FILTER_IDS` y las funciones nuevas no existen; `englishSections.ts` no existe).

- [ ] **Paso 3: Tipos del formulario y del modal**

Reemplazar entero `src/modules/videos/types/styles.ts`:

<!-- prettier-ignore -->
```ts
import type {
  ColorFilterId,
  CustomStyleSummary,
  GemSections,
  StyleCharacter,
} from '@pipeline/types/styles.ts'

// Dominio UI de los estilos visuales propios («Mi estilo»).

// De dónde sale el estilo del video: el catálogo de Vimo o la galería propia.
export type StyleSource = 'catalog' | 'custom'

// Estilo propio elegido en el formulario; viaja INLINE en el payload como
// snapshot (ProjectCustomStyle del pipeline): el proyecto es autocontenido.
export interface SelectedCustomStyle {
  styleId: string
  name: string
  // El texto de una gema vieja; vacío en una de plantilla, que no lo tiene.
  systemPrompt: string
  shots: string[]
  // Qué declaró la gema sobre su protagonista (ausente = genérico).
  character?: StyleCharacter
  // Gema de plantilla (ADR-0048): las secciones que envuelve el marco de Vimo.
  sections?: GemSections
  templateVersion?: number
  colorFilter?: ColorFilterId
}

// Lo editable de un estilo en el modal (sin id ni muestras).
export interface CustomStyleDraft {
  name: string
  // El texto del editor de siempre (gema vieja); vacío en una de plantilla.
  systemPrompt: string
  shots: string[]
  character?: StyleCharacter
  // Gema de plantilla (ADR-0048).
  sections?: GemSections
  templateVersion?: number
  colorFilter?: ColorFilterId
}

// Lo que el modal guarda de una gema de plantilla con style-save.
export interface TemplateStyleDraft {
  id: string
  name: string
  sections: GemSections
  templateVersion: number
  colorFilter: ColorFilterId
  character: StyleCharacter
  // El texto que se mandó al agente en esta apertura; null = conservar el
  // guardado.
  sourcePrompt: string | null
}

// Algo con texto de gema: una tarjeta de la galería, el estilo elegido o el
// borrador del modal.
export type GemTextSource = Pick<
  CustomStyleSummary,
  'systemPrompt' | 'sections'
>
```

- [ ] **Paso 4: Reglas de secciones en `gemTemplate.ts`**

En `src/modules/videos/utilities/gemTemplate.ts`, reemplazar el bloque de imports del principio
por:

<!-- prettier-ignore -->
```ts
import type {
  COLOR_FILTER_IDS as PIPELINE_COLOR_FILTER_IDS,
  GEM_SECTION_KEYS as PIPELINE_GEM_SECTION_KEYS,
  GEM_TEMPLATE_VERSION as PIPELINE_GEM_TEMPLATE_VERSION,
  GemSectionKey,
  GemSections,
  StyleCharacterMode,
  StyleSavePayload,
} from '@pipeline/types/styles.ts'
import type {
  GemRebuildOrigin,
  GemRebuildRequest,
  GemRebuildResponse,
} from '@/modules/videos/types/gemRebuild'
import type {
  GemTextSource,
  TemplateStyleDraft,
} from '@/modules/videos/types/styles'
```

Debajo de `export const GEM_TEMPLATE_VERSION: typeof PIPELINE_GEM_TEMPLATE_VERSION = 1` agregar:

<!-- prettier-ignore -->
```ts
// Presets de color del estilo (spec §5.5), en el orden en que se ofrecen.
export const COLOR_FILTER_IDS: typeof PIPELINE_COLOR_FILTER_IDS = [
  'none',
  'fantasy',
  'horror-bw',
]
```

Al final del archivo agregar:

<!-- prettier-ignore -->
```ts

/**
 * Tope del textarea de una sección: su propio límite o lo que queda del total,
 * lo que llegue primero. Así el modal nunca arma una gema que style-save
 * rechace.
 */
export function sectionMaxLength(
  sections: GemSections,
  key: GemSectionKey,
): number {
  const own = (sections[key] ?? '').length
  const others = gemSectionsLength(sections) - own
  return Math.max(
    0,
    Math.min(GEM_SECTION_LIMITS[key], GEM_TOTAL_CHAR_LIMIT - others),
  )
}

/** ¿Las mismas secciones una vez limpias? Espacios de más o una opcional vacía no son un cambio. */
export function sameGemSections(
  first: GemSections,
  second: GemSections,
): boolean {
  const firstClean = cleanGemSections(first)
  const secondClean = cleanGemSections(second)
  return GEM_SECTION_KEYS.every(
    (key) => (firstClean[key] ?? '') === (secondClean[key] ?? ''),
  )
}

/** ¿Hay estilo escrito? En una gema de plantilla, su estilo visual; en una vieja, su texto. */
export function hasGemText(gem: GemTextSource): boolean {
  if (gem.sections) return gem.sections.visualStyle.trim().length > 0
  return (gem.systemPrompt ?? '').trim().length > 0
}

/** Caracteres de la gema: las secciones limpias sumadas, o el texto de una vieja. */
export function gemCharCount(gem: GemTextSource): number {
  if (gem.sections) return gemSectionsLength(cleanGemSections(gem.sections))
  return (gem.systemPrompt ?? '').trim().length
}

/**
 * style-save de una gema de plantilla editada en el modal: las secciones
 * limpias y SIEMPRE su `templateVersion` (la que devolvió el agente o la
 * guardada), sin `systemPrompt` ni `shots` (spec §4.2: los planos los
 * reemplaza la sección `camera`). `sourcePrompt` viaja solo si la gema pasó
 * por el agente en esta apertura; ausente, el sidecar conserva el guardado.
 */
export function templateStyleSavePayload(
  draft: TemplateStyleDraft,
): StyleSavePayload {
  return {
    id: draft.id,
    name: draft.name,
    sections: cleanGemSections(draft.sections),
    templateVersion: draft.templateVersion,
    colorFilter: draft.colorFilter,
    character: draft.character,
    ...(draft.sourcePrompt === null
      ? {}
      : { sourcePrompt: draft.sourcePrompt }),
  }
}
```

- [ ] **Paso 5: Heurística de inglés (puro)**

Crear `src/modules/videos/utilities/englishSections.ts`:

<!-- prettier-ignore -->
```ts
import type { GemSectionKey, GemSections } from '@pipeline/types/styles.ts'

// Las secciones que Vimo pega TAL CUAL en cada prompt de imagen (spec §4.1):
// no pasan por el modelo, así que nadie las traduce. Módulo puro: lo corre
// scripts/test/check-app-gem-sections.mjs con Node.
export const ENGLISH_ONLY_SECTION_KEYS: readonly GemSectionKey[] = [
  'character',
  'promptStart',
  'promptEnd',
]

// Palabras funcionales que delatan el idioma. «a», «as», «do», «no», «me» y
// «sin» quedan fuera a propósito: existen en inglés y en español o portugués.
const ENGLISH_WORDS = new Set([
  'the',
  'and',
  'of',
  'with',
  'in',
  'on',
  'at',
  'to',
  'is',
  'are',
  'his',
  'her',
  'their',
  'outfit',
  'wears',
  'wearing',
  'for',
  'from',
  'by',
  'an',
  'this',
  'that',
  'into',
  'over',
  'under',
  'each',
  'every',
  'while',
  'without',
])
const SPANISH_PORTUGUESE_WORDS = new Set([
  'el',
  'la',
  'los',
  'las',
  'un',
  'una',
  'unos',
  'unas',
  'y',
  'de',
  'del',
  'con',
  'en',
  'por',
  'para',
  'que',
  'es',
  'su',
  'sus',
  'lleva',
  'viste',
  'al',
  'o',
  'uma',
  'e',
  'da',
  'dos',
  'das',
  'com',
  'em',
  'na',
  'nas',
  'nos',
  'seu',
  'sua',
  'veste',
  'cada',
  'sem',
])
// Letras que el inglés no usa: una palabra con alguna cuenta del otro lado.
const SPANISH_PORTUGUESE_LETTERS = /[áéíóúñãõçâêôàü¿¡]/

/**
 * ¿Parece inglés? Heurística para AVISAR, nunca para bloquear: cuenta palabras
 * de cada lado y gana la mayoría. Un empate, también cero a cero («cinematic
 * still, 35mm»), cuenta como inglés, así un nombre con tilde en una frase en
 * inglés («Sofía … Outfit: …») no dispara el aviso.
 */
export function looksEnglish(text: string): boolean {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? []
  let english = 0
  let foreign = 0
  for (const word of words) {
    if (ENGLISH_WORDS.has(word)) english += 1
    if (
      SPANISH_PORTUGUESE_WORDS.has(word) ||
      SPANISH_PORTUGUESE_LETTERS.test(word)
    )
      foreign += 1
  }

  return foreign <= english
}

/** Las secciones que van en inglés y no lo parecen; las vacías no se miran. */
export function nonEnglishSectionKeys(sections: GemSections): GemSectionKey[] {
  return ENGLISH_ONLY_SECTION_KEYS.filter((key) => {
    const value = sections[key]?.trim() ?? ''
    return value.length > 0 && !looksEnglish(value)
  })
}
```

- [ ] **Paso 6: Snapshot y borrador con secciones**

Reemplazar entero `src/modules/videos/utilities/selectedCustomStyle.ts` (sea cual sea el parche
que dejó la Tarea 0):

<!-- prettier-ignore -->
```ts
import type {
  CustomStyleDraft,
  SelectedCustomStyle,
} from '@/modules/videos/types/styles'
import type { CustomStyleSummary } from '@pipeline/types/styles.ts'

// Una tarjeta de la galería como estilo elegido del formulario (snapshot
// inline; el proyecto es autocontenido). Una gema vieja queda exactamente como
// antes de ADR-0048; una de plantilla suma secciones, versión y filtro, y su
// `systemPrompt` queda vacío porque no lo tiene.
export function selectedCustomStyleFrom(
  style: CustomStyleSummary,
): SelectedCustomStyle {
  return {
    styleId: style.id,
    name: style.name,
    systemPrompt: style.systemPrompt ?? '',
    shots: style.shots,
    ...(style.character ? { character: style.character } : {}),
    ...(style.sections ? { sections: style.sections } : {}),
    ...(style.templateVersion === undefined
      ? {}
      : { templateVersion: style.templateVersion }),
    ...(style.colorFilter ? { colorFilter: style.colorFilter } : {}),
  }
}

// Una tarjeta como borrador del modal: lo editable, sin id ni muestras.
export function customStyleDraftFrom(
  style: CustomStyleSummary,
): CustomStyleDraft {
  return {
    name: style.name,
    systemPrompt: style.systemPrompt ?? '',
    shots: style.shots,
    ...(style.character ? { character: style.character } : {}),
    ...(style.sections ? { sections: style.sections } : {}),
    ...(style.templateVersion === undefined
      ? {}
      : { templateVersion: style.templateVersion }),
    ...(style.colorFilter ? { colorFilter: style.colorFilter } : {}),
  }
}
```

- [ ] **Paso 7: Correr el guard**

Run: `node --test scripts/test/check-app-gem-sections.mjs`
Expected: PASS, 11 casos.

- [ ] **Paso 8: Constantes de la UI**

En `src/modules/videos/constants.ts`, debajo del import de `@pipeline/types/video-project.ts`
agregar:

<!-- prettier-ignore -->
```ts
import type { ColorFilterId, GemSectionKey } from '@pipeline/types/styles.ts'
```

y justo antes de `// Planos recomendados que llena el botón del modal (verbatim del origen).`
agregar:

<!-- prettier-ignore -->
```ts
// Campo de texto del modal de estilo: nombre, gema, secciones y planos.
export const CUSTOM_STYLE_FIELD_CLASS =
  'w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary disabled:opacity-60'

// Título y ayuda de cada sección de la gema en el modal (spec §4.1). El orden
// en que se muestran es GEM_SECTION_KEYS (utilities/gemTemplate.ts).
export const GEM_SECTION_TEXT_KEYS: Record<
  GemSectionKey,
  { titleKey: string; hintKey: string }
> = {
  visualStyle: {
    titleKey: 'create.gemTemplate.sections.visualStyle.title',
    hintKey: 'create.gemTemplate.sections.visualStyle.hint',
  },
  character: {
    titleKey: 'create.gemTemplate.sections.character.title',
    hintKey: 'create.gemTemplate.sections.character.hint',
  },
  dynamism: {
    titleKey: 'create.gemTemplate.sections.dynamism.title',
    hintKey: 'create.gemTemplate.sections.dynamism.hint',
  },
  camera: {
    titleKey: 'create.gemTemplate.sections.camera.title',
    hintKey: 'create.gemTemplate.sections.camera.hint',
  },
  rules: {
    titleKey: 'create.gemTemplate.sections.rules.title',
    hintKey: 'create.gemTemplate.sections.rules.hint',
  },
  promptStart: {
    titleKey: 'create.gemTemplate.sections.promptStart.title',
    hintKey: 'create.gemTemplate.sections.promptStart.hint',
  },
  promptEnd: {
    titleKey: 'create.gemTemplate.sections.promptEnd.title',
    hintKey: 'create.gemTemplate.sections.promptEnd.hint',
  },
}

// Nombre de cada preset de color del estilo (spec §5.5). El filtro de FFmpeg
// lo aplica el sidecar al render.
export const COLOR_FILTER_LABEL_KEYS: Record<ColorFilterId, string> = {
  none: 'create.gemTemplate.colorFilters.none',
  fantasy: 'create.gemTemplate.colorFilters.fantasy',
  'horror-bw': 'create.gemTemplate.colorFilters.horror-bw',
}

```

- [ ] **Paso 9: Textos (es, en, pt)**

En cada catálogo, justo después de la línea `    "gemTemplate": {` (única), insertar:

`public/locales/es.json`:

<!-- prettier-ignore -->
```text
      "sections": {
        "visualStyle": {
          "title": "Estilo visual",
          "hint": "Técnica, paleta, luz, textura y composición. Es la única sección obligatoria: sin ella el estilo no se guarda."
        },
        "character": {
          "title": "Personaje del estilo",
          "hint": "Solo se usa cuando arriba elegís «Personaje genérico»: es el protagonista de tus videos con este estilo. Con «Mi personaje» o «Sin personaje» no se usa. Va en inglés: primero cómo es físicamente y, al final, una oración «Outfit: …» con su ropa base."
        },
        "dynamism": {
          "title": "Dinamismo",
          "hint": "Cuándo sale el protagonista y cuándo una metáfora, un objeto o un lugar, y en qué proporción."
        },
        "camera": {
          "title": "Encuadres y cámara",
          "hint": "Planos, ángulos y reglas de variedad."
        },
        "rules": {
          "title": "Reglas y prohibiciones",
          "hint": "Lo que el estilo nunca hace."
        },
        "promptStart": {
          "title": "Inicio fijo de cada imagen",
          "hint": "Frase en inglés que Vimo pone al principio de cada prompt de imagen."
        },
        "promptEnd": {
          "title": "Final fijo de cada imagen",
          "hint": "Frase en inglés que Vimo agrega al final de cada prompt de imagen."
        }
      },
      "colorFilters": {
        "none": "Natural",
        "fantasy": "Fantasía (colores vivos)",
        "horror-bw": "Terror (blanco y negro)"
      },
```

`public/locales/en.json`:

<!-- prettier-ignore -->
```text
      "sections": {
        "visualStyle": {
          "title": "Visual style",
          "hint": "Technique, palette, lighting, texture and composition. It's the only required section: without it the style isn't saved."
        },
        "character": {
          "title": "Style character",
          "hint": "Only used when you pick “Generic character” above: it's the protagonist of your videos with this style. With “My character” or “No character” it isn't used. Write it in English: physical identity first and, at the end, an “Outfit: …” sentence with the base outfit."
        },
        "dynamism": {
          "title": "Dynamism",
          "hint": "When the protagonist appears and when a metaphor, an object or a place does, and in what proportion."
        },
        "camera": {
          "title": "Framing and camera",
          "hint": "Shots, angles and variety rules."
        },
        "rules": {
          "title": "Rules and prohibitions",
          "hint": "What the style never does."
        },
        "promptStart": {
          "title": "Fixed start of every image",
          "hint": "English phrase Vimo puts at the start of every image prompt."
        },
        "promptEnd": {
          "title": "Fixed end of every image",
          "hint": "English phrase Vimo adds at the end of every image prompt."
        }
      },
      "colorFilters": {
        "none": "Natural",
        "fantasy": "Fantasy (vivid colors)",
        "horror-bw": "Horror (black and white)"
      },
```

`public/locales/pt.json`:

<!-- prettier-ignore -->
```text
      "sections": {
        "visualStyle": {
          "title": "Estilo visual",
          "hint": "Técnica, paleta, luz, textura e composição. É a única seção obrigatória: sem ela o estilo não é salvo."
        },
        "character": {
          "title": "Personagem do estilo",
          "hint": "Só é usado quando você escolhe «Personagem genérico» acima: é o protagonista dos seus vídeos com este estilo. Com «Meu personagem» ou «Sem personagem» não é usado. Vai em inglês: primeiro como ele é fisicamente e, no final, uma frase «Outfit: …» com a roupa base."
        },
        "dynamism": {
          "title": "Dinamismo",
          "hint": "Quando o protagonista aparece e quando aparece uma metáfora, um objeto ou um lugar, e em que proporção."
        },
        "camera": {
          "title": "Enquadramentos e câmera",
          "hint": "Planos, ângulos e regras de variedade."
        },
        "rules": {
          "title": "Regras e proibições",
          "hint": "O que o estilo nunca faz."
        },
        "promptStart": {
          "title": "Início fixo de cada imagem",
          "hint": "Frase em inglês que o Vimo coloca no início de cada prompt de imagem."
        },
        "promptEnd": {
          "title": "Final fixo de cada imagem",
          "hint": "Frase em inglês que o Vimo adiciona no final de cada prompt de imagem."
        }
      },
      "colorFilters": {
        "none": "Natural",
        "fantasy": "Fantasia (cores vivas)",
        "horror-bw": "Terror (preto e branco)"
      },
```

- [ ] **Paso 10: Verificación**

Run:

<!-- prettier-ignore -->
```bash
pnpm exec prettier --write src/modules/videos/types/styles.ts src/modules/videos/utilities/gemTemplate.ts src/modules/videos/utilities/englishSections.ts src/modules/videos/utilities/selectedCustomStyle.ts src/modules/videos/constants.ts scripts/test/check-app-gem-sections.mjs public/locales/es.json public/locales/en.json public/locales/pt.json
pnpm exec eslint src/modules/videos/types/styles.ts src/modules/videos/utilities/gemTemplate.ts src/modules/videos/utilities/englishSections.ts src/modules/videos/utilities/selectedCustomStyle.ts src/modules/videos/constants.ts
pnpm exec tsc -p tsconfig.app.json --noEmit
node --test scripts/test/check-app-gem-sections.mjs scripts/test/check-app-gem-rebuild.mjs
node scripts/test/check-locales.mjs
```

Expected: todo en verde; `check-locales` con 17 claves más, alineadas.

- [ ] **Paso 11: Commit (orquestador)**

<!-- prettier-ignore -->
```bash
git add src/modules/videos/types/styles.ts src/modules/videos/utilities/gemTemplate.ts src/modules/videos/utilities/englishSections.ts src/modules/videos/utilities/selectedCustomStyle.ts src/modules/videos/constants.ts scripts/test/check-app-gem-sections.mjs public/locales/es.json public/locales/en.json public/locales/pt.json
git commit -F - <<'EOF'
feat(videos): add the section logic for template gems

Qué: gemTemplate.ts suma los presets de color (espejo de COLOR_FILTER_IDS),
el tope de cada caja (su límite o lo que queda del total), qué cuenta como
cambio, cuánto texto tiene una gema y el style-save de una gema de plantilla:
siempre con su templateVersion y sin systemPrompt ni shots. englishSections.ts
avisa cuándo
character, promptStart o promptEnd no parecen inglés. Los tipos del
formulario y del modal suman secciones, versión y filtro; el snapshot de una
gema vieja no cambia. constants.ts suma los textos de cada sección y de cada
preset.

Por qué: el modal por secciones (C4b y C4c) y el payload (C6) necesitan estas
reglas; como módulos puros se prueban con Node sin montar la UI.

Con qué interactúa: los tipos de la Tarea 0 y gemTemplate.ts de C3. Textos
create.gemTemplate.sections.* y colorFilters.* en es, en y pt. Guard nuevo:
scripts/test/check-app-gem-sections.mjs. Sin cambios visibles todavía.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Tarea C4b: componentes del editor por secciones

**Files:**

- Create: `src/modules/videos/hooks/useGemTemplateDraft.ts`
- Create: `src/modules/videos/components/GemSectionBox.tsx`
- Create: `src/modules/videos/components/GemSectionsEditor.tsx`
- Create: `src/modules/videos/components/GemPasteStep.tsx`
- Create: `src/modules/videos/components/GemAgentWarnings.tsx`
- Create: `src/modules/videos/components/ColorFilterPicker.tsx`
- Modify: `public/locales/es.json`, `public/locales/en.json`, `public/locales/pt.json`

**Interfaces:**

- Consumes: `GemRebuildResponse` y `GemRebuildErrorText` (C3); `cleanGemSections`,
  `sameGemSections`, `sectionMaxLength`, `gemSectionsLength`, `GEM_SECTION_KEYS`,
  `GEM_SECTION_LIMITS`, `GEM_TOTAL_CHAR_LIMIT`, `GEM_TEMPLATE_VERSION`, `COLOR_FILTER_IDS`,
  `nonEnglishSectionKeys`, `CUSTOM_STYLE_FIELD_CLASS`, `GEM_SECTION_TEXT_KEYS`,
  `COLOR_FILTER_LABEL_KEYS` (C4a); `SegmentedTabs` de common.
- Produces:
  - `useGemTemplateDraft(initial: CustomStyleDraft)` (su `templateVersion` es el que devolvió el
    agente o, sin reconstruir, el guardado) devuelve `{ pasting: boolean; pasteText: string; sections: GemSections; templateVersion: number; colorFilter: ColorFilterId; sourcePrompt: string | null; warnings: string[]; unsavedSections: boolean; setPasteText(text); setColorFilter(id); editSection(key: GemSectionKey, value: string); startPasting(); stopPasting(); applyRebuild(response: GemRebuildResponse, sourceText: string); markSaved(saved: GemSections) }`.
  - `GemSectionsEditor({ sections: GemSections; disabled: boolean; onChange: (key: GemSectionKey, value: string) => void })`.
  - `GemSectionBox({ sectionKey, value, expanded, maxLength, notEnglish, disabled, onToggle, onChange })`.
  - `GemPasteStep({ text: string; pending: boolean; error: Error | null; onTextChange: (text: string) => void; onPrepare: () => void; onBack?: () => void })`.
  - `GemAgentWarnings({ warnings: string[] })`.
  - `ColorFilterPicker({ value: ColorFilterId; disabled: boolean; onChange: (value: ColorFilterId) => void })`.

Los componentes todavía no se montan (lo hace C4c). La lógica que deciden ya está probada en C4a;
acá la verificación es lint, tipos y catálogos.

- [ ] **Paso 1: Borrador de la gema de plantilla**

Crear `src/modules/videos/hooks/useGemTemplateDraft.ts`:

<!-- prettier-ignore -->
```ts
import { useState } from 'react'
import {
  cleanGemSections,
  GEM_TEMPLATE_VERSION,
  sameGemSections,
} from '@/modules/videos/utilities/gemTemplate'
import type { GemRebuildResponse } from '@/modules/videos/types/gemRebuild'
import type { CustomStyleDraft } from '@/modules/videos/types/styles'
import type {
  ColorFilterId,
  GemSectionKey,
  GemSections,
} from '@pipeline/types/styles.ts'

// Borrador de una gema de plantilla en el modal (ADR-0048): el paso «Pegá tu
// gema», las secciones que se editan y lo que devolvió el agente. Todo queda
// en memoria: el modal lo guarda al cerrar (o antes de generar muestras) con
// style-save, sin volver a pasar por el agente.
export function useGemTemplateDraft(initial: CustomStyleDraft) {
  // Una gema sin secciones (un estilo nuevo) arranca pegando su texto.
  const [pasting, setPasting] = useState(initial.sections === undefined)
  const [pasteText, setPasteText] = useState('')
  const [sections, setSections] = useState<GemSections>(
    initial.sections ?? { visualStyle: '' },
  )
  // Lo último guardado: contra esto se mide si «Pegar gema nueva» haría perder
  // algo que todavía no se guardó.
  const [savedSections, setSavedSections] = useState<GemSections>(
    initial.sections ?? { visualStyle: '' },
  )
  // Viaja SIEMPRE con las secciones en style-save: la que devolvió el agente
  // al preparar la gema, o la guardada al editarla.
  const [templateVersion, setTemplateVersion] = useState(
    initial.templateVersion ?? GEM_TEMPLATE_VERSION,
  )
  const [colorFilter, setColorFilter] = useState<ColorFilterId>(
    initial.colorFilter ?? 'none',
  )
  // El texto que se mandó al agente en esta apertura; null = conservar el
  // guardado.
  const [sourcePrompt, setSourcePrompt] = useState<string | null>(null)
  // Avisos de la última reconstrucción: se muestran, no se guardan.
  const [warnings, setWarnings] = useState<string[]>([])

  return {
    pasting,
    pasteText,
    sections,
    templateVersion,
    colorFilter,
    sourcePrompt,
    warnings,
    unsavedSections: !sameGemSections(sections, savedSections),
    setPasteText,
    setColorFilter,
    editSection(key: GemSectionKey, value: string) {
      setSections((current) => ({ ...current, [key]: value }))
    },
    startPasting() {
      setPasteText('')
      setPasting(true)
    },
    stopPasting() {
      setPasting(false)
    },
    applyRebuild(response: GemRebuildResponse, sourceText: string) {
      setSections(cleanGemSections(response.sections))
      setTemplateVersion(response.templateVersion)
      setSourcePrompt(sourceText)
      setWarnings(response.warnings)
      setPasteText('')
      setPasting(false)
    },
    markSaved(saved: GemSections) {
      setSavedSections(saved)
    },
  }
}
```

- [ ] **Paso 2: Una caja por sección**

Crear `src/modules/videos/components/GemSectionBox.tsx`:

<!-- prettier-ignore -->
```tsx
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import {
  CUSTOM_STYLE_FIELD_CLASS,
  GEM_SECTION_TEXT_KEYS,
} from '@/modules/videos/constants'
import { GEM_SECTION_LIMITS } from '@/modules/videos/utilities/gemTemplate'
import type { GemSectionKey } from '@pipeline/types/styles.ts'

interface GemSectionBoxProps {
  sectionKey: GemSectionKey
  value: string
  expanded: boolean
  // Tope del textarea: el límite de la sección o lo que queda del total.
  maxLength: number
  // La sección va en inglés y no lo parece: se avisa, sin bloquear.
  notEnglish: boolean
  disabled: boolean
  onToggle: () => void
  onChange: (value: string) => void
}

// Una sección de la gema como caja plegable (spec §7): el título y su contador
// siempre a la vista; abierta, la ayuda y el texto. Presentacional.
export function GemSectionBox({
  sectionKey,
  value,
  expanded,
  maxLength,
  notEnglish,
  disabled,
  onToggle,
  onChange,
}: GemSectionBoxProps) {
  const { t } = useTranslation()
  const texts = GEM_SECTION_TEXT_KEYS[sectionKey]
  const limit = GEM_SECTION_LIMITS[sectionKey]
  const fieldId = `gem-section-${sectionKey}`

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={fieldId}
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
      >
        <span className="min-w-0">
          <span className="block font-display text-sm font-bold text-foreground">
            {t(texts.titleKey)}
          </span>
          {!expanded && value && (
            <span className="block truncate font-body text-xs text-muted-foreground">
              {value}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              'font-body text-[11px] tabular-nums',
              value.length >= limit
                ? 'text-destructive'
                : 'text-muted-foreground',
            )}
          >
            {t('create.gemTemplate.sectionCount', {
              used: value.length.toLocaleString(),
              limit: limit.toLocaleString(),
            })}
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              expanded && 'rotate-180',
            )}
          />
        </span>
      </button>

      {expanded && (
        <div className="space-y-1.5 border-t border-border px-3 pb-3 pt-2">
          <p className="font-body text-xs text-muted-foreground">
            {t(texts.hintKey)}
          </p>
          <textarea
            id={fieldId}
            aria-label={t(texts.titleKey)}
            value={value}
            maxLength={maxLength}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            rows={sectionKey === 'visualStyle' ? 10 : 4}
            spellCheck={false}
            className={cn(
              CUSTOM_STYLE_FIELD_CLASS,
              'resize-y font-mono text-xs leading-relaxed',
            )}
          />
          {notEnglish && (
            <p className="font-body text-xs text-saffron">
              {t('create.gemTemplate.notEnglish')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Paso 3: El editor de secciones**

Crear `src/modules/videos/components/GemSectionsEditor.tsx`:

<!-- prettier-ignore -->
```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { GemSectionBox } from '@/modules/videos/components/GemSectionBox'
import { GEM_SECTION_TEXT_KEYS } from '@/modules/videos/constants'
import { nonEnglishSectionKeys } from '@/modules/videos/utilities/englishSections'
import {
  GEM_SECTION_KEYS,
  GEM_TOTAL_CHAR_LIMIT,
  gemSectionsLength,
  sectionMaxLength,
} from '@/modules/videos/utilities/gemTemplate'
import type { GemSectionKey, GemSections } from '@pipeline/types/styles.ts'

interface GemSectionsEditorProps {
  sections: GemSections
  disabled: boolean
  onChange: (key: GemSectionKey, value: string) => void
}

// Las secciones de una gema de plantilla, una caja cada una en el orden
// canónico (spec §7). `visualStyle` arranca abierta; una opcional vacía es un
// «Agregar sección» hasta que se abre. Qué caja está abierta es estado de esta
// vista; el texto lo maneja el modal, que lo guarda al cerrar.
export function GemSectionsEditor({
  sections,
  disabled,
  onChange,
}: GemSectionsEditorProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState<ReadonlySet<GemSectionKey>>(
    () => new Set<GemSectionKey>(['visualStyle']),
  )

  const notEnglish = new Set(nonEnglishSectionKeys(sections))
  const total = gemSectionsLength(sections)
  const totalFull = total >= GEM_TOTAL_CHAR_LIMIT

  const toggle = (key: GemSectionKey) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
        return next
      }
      next.add(key)
      return next
    })
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-medium">
          {t('create.gemTemplate.sectionsTitle')}
        </p>
        <p className="font-body text-xs text-muted-foreground">
          {t('create.gemTemplate.sectionsHint')}
        </p>
      </div>

      {GEM_SECTION_KEYS.map((key) => {
        const value = sections[key] ?? ''
        const shown =
          key === 'visualStyle' || value.length > 0 || expanded.has(key)
        if (!shown)
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => toggle(key)}
              className="flex w-full items-center gap-2 rounded-xl border-2 border-dashed border-border px-3 py-2 text-left font-display text-sm font-bold text-muted-foreground transition-colors hover:border-saffron/60 hover:text-foreground disabled:opacity-60"
            >
              <Plus className="h-4 w-4 shrink-0" />
              {t('create.gemTemplate.addSection', {
                title: t(GEM_SECTION_TEXT_KEYS[key].titleKey),
              })}
            </button>
          )

        return (
          <GemSectionBox
            key={key}
            sectionKey={key}
            value={value}
            expanded={expanded.has(key)}
            maxLength={sectionMaxLength(sections, key)}
            notEnglish={notEnglish.has(key)}
            disabled={disabled}
            onToggle={() => toggle(key)}
            onChange={(next) => onChange(key, next)}
          />
        )
      })}

      <p
        className={cn(
          'font-body text-xs tabular-nums',
          totalFull ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {t('create.gemTemplate.totalCount', {
          used: total.toLocaleString(),
          limit: GEM_TOTAL_CHAR_LIMIT.toLocaleString(),
        })}
      </p>
      {totalFull && (
        <p className="font-body text-xs text-destructive">
          {t('create.gemTemplate.totalFull')}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Paso 4: «Pegá tu gema»**

Crear `src/modules/videos/components/GemPasteStep.tsx`:

<!-- prettier-ignore -->
```tsx
import { useTranslation } from 'react-i18next'
import { Loader2, Sparkles } from 'lucide-react'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { Button } from '@/modules/common/ui/button'
import { cn } from '@/modules/common/utilities/cn'
import { GemRebuildErrorText } from '@/modules/videos/components/GemRebuildErrorText'
import {
  CUSTOM_STYLE_FIELD_CLASS,
  CUSTOM_STYLE_PROMPT_LIMIT,
} from '@/modules/videos/constants'

interface GemPasteStepProps {
  text: string
  pending: boolean
  // Error del último intento, que se muestra traducido; null = ninguno.
  error: Error | null
  onTextChange: (text: string) => void
  onPrepare: () => void
  // Solo al reemplazar una gema que ya tiene secciones: volver sin cambiarlas.
  onBack?: () => void
}

// «Pegá tu gema» (spec §7): una caja grande y «Preparar con IA». Mientras la IA
// trabaja todo queda quieto (el botón deshabilitado evita un segundo pedido);
// si falla, el texto sigue en la caja y el botón pasa a «Reintentar».
export function GemPasteStep({
  text,
  pending,
  error,
  onTextChange,
  onPrepare,
  onBack,
}: GemPasteStepProps) {
  const { t } = useTranslation()
  const canPrepare = text.trim().length > 0 && !pending

  return (
    <div className="space-y-3">
      <label
        htmlFor="gem-paste"
        className="block font-display text-sm font-bold text-foreground"
      >
        {t('create.gemTemplate.pasteTitle')}
      </label>
      <textarea
        id="gem-paste"
        value={text}
        maxLength={CUSTOM_STYLE_PROMPT_LIMIT}
        disabled={pending}
        onChange={(event) => onTextChange(event.target.value)}
        placeholder={t('create.gemTemplate.pastePlaceholder')}
        rows={16}
        spellCheck={false}
        className={cn(
          CUSTOM_STYLE_FIELD_CLASS,
          'resize-y font-mono text-xs leading-relaxed placeholder:text-muted-foreground/70',
        )}
      />
      <p className="text-right font-body text-[11px] tabular-nums text-muted-foreground">
        {t('create.gemTemplate.pasteCount', {
          used: text.length.toLocaleString(),
          limit: CUSTOM_STYLE_PROMPT_LIMIT.toLocaleString(),
        })}
      </p>

      {pending && (
        <p role="status" className="font-body text-xs text-muted-foreground">
          {t('create.gemTemplate.preparingHint')}
        </p>
      )}
      {error && !pending && (
        <ErrorMessage>
          <GemRebuildErrorText error={error} />
        </ErrorMessage>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {onBack && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={onBack}
          >
            {t('create.gemTemplate.backToSections')}
          </Button>
        )}
        <Button type="button" disabled={!canPrepare} onClick={onPrepare}>
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('create.gemTemplate.preparing')}
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              {error
                ? t('create.gemTemplate.retry')
                : t('create.gemTemplate.prepare')}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Paso 5: Avisos del agente y filtro de color**

Crear `src/modules/videos/components/GemAgentWarnings.tsx`:

<!-- prettier-ignore -->
```tsx
import { useTranslation } from 'react-i18next'
import { Alert } from '@/modules/common/components/Alert'

interface GemAgentWarningsProps {
  warnings: string[]
}

// Lo que el agente descartó o encontró ambiguo al ordenar la gema (spec §6.2),
// escrito en el idioma de la app. Se muestra después de «Preparar con IA»; no
// se guarda con el estilo.
export function GemAgentWarnings({ warnings }: GemAgentWarningsProps) {
  const { t } = useTranslation()

  if (warnings.length === 0) return null

  return (
    <Alert tone="info" title={t('create.gemTemplate.warningsTitle')}>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </Alert>
  )
}
```

Crear `src/modules/videos/components/ColorFilterPicker.tsx`:

<!-- prettier-ignore -->
```tsx
import { useTranslation } from 'react-i18next'
import { SegmentedTabs } from '@/modules/common/components/SegmentedTabs'
import { COLOR_FILTER_LABEL_KEYS } from '@/modules/videos/constants'
import { COLOR_FILTER_IDS } from '@/modules/videos/utilities/gemTemplate'
import type { ColorFilterId } from '@pipeline/types/styles.ts'

interface ColorFilterPickerProps {
  value: ColorFilterId
  disabled: boolean
  onChange: (value: ColorFilterId) => void
}

// El filtro de color del estilo (spec §5.5): uno de tres presets, que el
// sidecar aplica al video terminado. Presentacional.
export function ColorFilterPicker({
  value,
  disabled,
  onChange,
}: ColorFilterPickerProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium">
        {t('create.gemTemplate.colorFilterTitle')}
      </p>
      <SegmentedTabs
        value={value}
        ariaLabel={t('create.gemTemplate.colorFilterTitle')}
        disabled={disabled}
        options={COLOR_FILTER_IDS.map((id) => ({
          id,
          label: t(COLOR_FILTER_LABEL_KEYS[id]),
        }))}
        onChange={onChange}
      />
      <p className="font-body text-xs text-muted-foreground">
        {t('create.gemTemplate.colorFilterHint')}
      </p>
    </div>
  )
}
```

- [ ] **Paso 6: Textos (es, en, pt)**

En cada catálogo, justo después de la línea `    "gemTemplate": {`, insertar:

`public/locales/es.json`:

<!-- prettier-ignore -->
```text
      "pasteTitle": "Pegá tu gema",
      "pastePlaceholder": "Pegá acá tu gema completa…",
      "pasteCount": "{{used}} / {{limit}} caracteres",
      "prepare": "Preparar con IA",
      "preparing": "Preparando…",
      "preparingHint": "La IA está ordenando tu gema. Puede tardar hasta dos minutos.",
      "retry": "Reintentar",
      "backToSections": "Volver a las secciones",
      "sectionsTitle": "Secciones del estilo",
      "sectionsHint": "Editá cada sección acá mismo: se guarda al cerrar, sin volver a pasar por la IA.",
      "addSection": "Agregar sección: {{title}}",
      "sectionCount": "{{used}} / {{limit}}",
      "totalCount": "Total del estilo: {{used}} / {{limit}} caracteres",
      "totalFull": "Llegaste al máximo del estilo. Acortá alguna sección para seguir escribiendo.",
      "notEnglish": "No parece estar en inglés. Vimo pega este texto tal cual en cada imagen, así que conviene escribirlo en inglés.",
      "warningsTitle": "Lo que la IA ajustó de tu gema",
      "colorFilterTitle": "Filtro de color",
      "colorFilterHint": "Se aplica al video terminado.",
```

`public/locales/en.json`:

<!-- prettier-ignore -->
```text
      "pasteTitle": "Paste your gem",
      "pastePlaceholder": "Paste your full gem here…",
      "pasteCount": "{{used}} / {{limit}} characters",
      "prepare": "Prepare with AI",
      "preparing": "Preparing…",
      "preparingHint": "The AI is sorting your gem. It can take up to two minutes.",
      "retry": "Try again",
      "backToSections": "Back to the sections",
      "sectionsTitle": "Style sections",
      "sectionsHint": "Edit each section right here: it's saved when you close, without going through the AI again.",
      "addSection": "Add section: {{title}}",
      "sectionCount": "{{used}} / {{limit}}",
      "totalCount": "Style total: {{used}} / {{limit}} characters",
      "totalFull": "You've reached the style's maximum. Shorten a section to keep writing.",
      "notEnglish": "This doesn't look like English. Vimo pastes this text as is into every image, so it's best written in English.",
      "warningsTitle": "What the AI adjusted in your gem",
      "colorFilterTitle": "Color filter",
      "colorFilterHint": "Applied to the finished video.",
```

`public/locales/pt.json`:

<!-- prettier-ignore -->
```text
      "pasteTitle": "Cole sua gema",
      "pastePlaceholder": "Cole aqui sua gema completa…",
      "pasteCount": "{{used}} / {{limit}} caracteres",
      "prepare": "Preparar com IA",
      "preparing": "Preparando…",
      "preparingHint": "A IA está organizando sua gema. Pode levar até dois minutos.",
      "retry": "Tentar de novo",
      "backToSections": "Voltar às seções",
      "sectionsTitle": "Seções do estilo",
      "sectionsHint": "Edite cada seção aqui mesmo: ela é salva ao fechar, sem passar pela IA de novo.",
      "addSection": "Adicionar seção: {{title}}",
      "sectionCount": "{{used}} / {{limit}}",
      "totalCount": "Total do estilo: {{used}} / {{limit}} caracteres",
      "totalFull": "Você chegou ao máximo do estilo. Encurte alguma seção para continuar escrevendo.",
      "notEnglish": "Não parece estar em inglês. O Vimo cola este texto como está em cada imagem, então é melhor escrevê-lo em inglês.",
      "warningsTitle": "O que a IA ajustou na sua gema",
      "colorFilterTitle": "Filtro de cor",
      "colorFilterHint": "Aplicado ao vídeo finalizado.",
```

- [ ] **Paso 7: Verificación**

Run:

<!-- prettier-ignore -->
```bash
pnpm exec prettier --write src/modules/videos/hooks/useGemTemplateDraft.ts src/modules/videos/components/GemSectionBox.tsx src/modules/videos/components/GemSectionsEditor.tsx src/modules/videos/components/GemPasteStep.tsx src/modules/videos/components/GemAgentWarnings.tsx src/modules/videos/components/ColorFilterPicker.tsx public/locales/es.json public/locales/en.json public/locales/pt.json
pnpm exec eslint src/modules/videos/hooks/useGemTemplateDraft.ts src/modules/videos/components/GemSectionBox.tsx src/modules/videos/components/GemSectionsEditor.tsx src/modules/videos/components/GemPasteStep.tsx src/modules/videos/components/GemAgentWarnings.tsx src/modules/videos/components/ColorFilterPicker.tsx
pnpm exec tsc -p tsconfig.app.json --noEmit
node scripts/test/check-locales.mjs
```

Expected: todo en verde; `check-locales` con 18 claves más, alineadas.

- [ ] **Paso 8: Commit (orquestador)**

<!-- prettier-ignore -->
```bash
git add src/modules/videos/hooks/useGemTemplateDraft.ts src/modules/videos/components/GemSectionBox.tsx src/modules/videos/components/GemSectionsEditor.tsx src/modules/videos/components/GemPasteStep.tsx src/modules/videos/components/GemAgentWarnings.tsx src/modules/videos/components/ColorFilterPicker.tsx public/locales/es.json public/locales/en.json public/locales/pt.json
git commit -F - <<'EOF'
feat(videos): add the section editor and paste step components

Qué: GemPasteStep («Pegá tu gema» con «Preparar con IA», deshabilitado
mientras la IA trabaja, y el error traducido con «Reintentar»),
GemSectionsEditor y GemSectionBox (una caja plegable por sección en el orden
canónico, visualStyle abierta, las opcionales vacías como «Agregar sección»,
contador por sección y total, un tope que nunca deja pasar el límite y aviso
si una sección en inglés no lo parece), GemAgentWarnings, ColorFilterPicker y
el hook useGemTemplateDraft con el borrador de la gema de plantilla.

Por qué: la UI de Mi estilo por secciones de la Entrega 1 (spec §7). Son
presentacionales y el borrador vive en un hook para que el modal (C4c) solo
orqueste.

Con qué interactúa: gemTemplate.ts y englishSections.ts (C4a),
GemRebuildErrorText (C3) y SegmentedTabs de common. Textos del editor en
create.gemTemplate.* en es, en y pt. Todavía no se montan: los usa el modal
en C4c.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Tarea C4c: el modal y la galería por secciones

**Files:**

- Modify: `src/modules/videos/components/CustomStyleModal.tsx` (entero)
- Modify: `src/modules/videos/components/CustomStyleGallery.tsx` (entero)
- Modify: `public/locales/es.json`, `public/locales/en.json`, `public/locales/pt.json`

**Interfaces:**

- Consumes: `useAccessFeature` (C1); `useGemRebuild` (C3); `hasGemText`,
  `templateStyleSavePayload`, `customStyleDraftFrom`, `selectedCustomStyleFrom`,
  `CUSTOM_STYLE_FIELD_CLASS` (C4a); `useGemTemplateDraft`, `GemPasteStep`, `GemSectionsEditor`,
  `GemAgentWarnings`, `ColorFilterPicker` (C4b).
- Produces: `CustomStyleModal` recibe la prop nueva `isNew: boolean`. La galería toma el snapshot
  en uso de `StyleSaveResult.entry` (lo guardado, con sus secciones).

Reglas que este paso cumple: el editor de cada apertura se fija al montar (`templateMode`); una
gema con secciones siempre se edita por secciones; una nueva, solo con el interruptor; las viejas
con el editor de siempre. «Pegar gema nueva» solo con el interruptor (sin él no hay agente). El
guardado sigue siendo al cerrar y la confirmación es nativa (`window.confirm`, como al borrar una
tarjeta), así nunca hay dos modales Radix. Al revisar, usar `git diff -w`: el bloque del editor
viejo solo cambia de indentación y de `FIELD_CLASS` a `CUSTOM_STYLE_FIELD_CLASS` (mismo valor).
Hasta C6, Crear todavía no manda las secciones al proyecto: no se prueba el envío con una gema de
plantilla antes de C6. Hasta C6b, el selector de personajes del modal ofrece diseñar con la gema
solo si es vieja (una de plantilla no tiene texto que mandar).

- [ ] **Paso 1: El modal**

Reemplazar entero `src/modules/videos/components/CustomStyleModal.tsx`:

<!-- prettier-ignore -->
```tsx
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clapperboard, ClipboardPaste, Loader2, Sparkles } from 'lucide-react'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { ImageCreditsBadges } from '@/modules/common/components/ImageCreditsBadges'
import { useAccessFeature } from '@/modules/common/hooks/useAccessFeature'
import { useImageCredits } from '@/modules/common/hooks/useImageCredits'
import { Button } from '@/modules/common/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/modules/common/ui/dialog'
import { cn } from '@/modules/common/utilities/cn'
import { useRequiredApiKeys } from '@/modules/api-keys/hooks/useRequiredApiKeys'
import { videosApi } from '@/modules/videos/api'
import { CharacterPickerModal } from '@/modules/videos/components/CharacterPickerModal'
import { ColorFilterPicker } from '@/modules/videos/components/ColorFilterPicker'
import { GemAgentWarnings } from '@/modules/videos/components/GemAgentWarnings'
import { GemPasteStep } from '@/modules/videos/components/GemPasteStep'
import { GemSectionsEditor } from '@/modules/videos/components/GemSectionsEditor'
import { StyleCharacterBlock } from '@/modules/videos/components/StyleCharacterBlock'
import { StyleSamplesCarousel } from '@/modules/videos/components/StyleSamplesCarousel'
import { apiKeysApi } from '@/modules/api-keys/api'
import { providerLabel } from '@/modules/api-keys/utilities/providerLabel'
import { InsufficientCreditsAlert } from '@/modules/common/components/InsufficientCreditsAlert'
import { compareCostLines } from '@/modules/common/utilities/compareCostLines'
import { defaultQualityFor } from '@/modules/videos/utilities/imageQuality'
import { imageCostEstimate } from '@/modules/videos/utilities/imageCostEstimate'
import { useGemRebuild } from '@/modules/videos/hooks/useGemRebuild'
import { useGemTemplateDraft } from '@/modules/videos/hooks/useGemTemplateDraft'
import { useStyleSampleGeneration } from '@/modules/videos/hooks/useStyleSampleGeneration'
import {
  hasGemText,
  templateStyleSavePayload,
} from '@/modules/videos/utilities/gemTemplate'
import { preferredImageProvider } from '@/modules/videos/utilities/preferredImageProvider'
import {
  CUSTOM_STYLE_FIELD_CLASS,
  CUSTOM_STYLE_NAME_LIMIT,
  CUSTOM_STYLE_PROMPT_LIMIT,
  CUSTOM_STYLE_SAMPLE_COUNT,
  IMAGE_PROVIDERS,
  RECOMMENDED_SHOTS,
} from '@/modules/videos/constants'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'
import type { SelectedCharacter } from '@/modules/videos/types/create'
import type { CustomStyleDraft } from '@/modules/videos/types/styles'
import type {
  StyleCharacter,
  StyleSample,
  StyleSavePayload,
} from '@pipeline/types/styles.ts'

interface CustomStyleModalProps {
  styleId: string
  initial: CustomStyleDraft
  // Estilo nuevo, todavía fuera de la galería: con la plantilla encendida
  // arranca en «Pegá tu gema» (ADR-0048).
  isNew: boolean
  // Muestras VIVAS del estilo (derivadas de la query de la galería): se ven
  // al abrir y aparecen solas al terminar de generar.
  samples: StyleSample[]
  saving: boolean
  // Abierto desde «Generar 4 muestras» del menú: la intención ya se declaró
  // ahí, así que arranca apenas se elige el proveedor.
  generateOnOpen: boolean
  // Contexto para diseñar un personaje nuevo con esta gema desde el selector.
  script: string
  promptModel: string | null
  onSave: (payload: StyleSavePayload) => Promise<void>
  onClose: () => void
}

// El protagonista de la gema más lo que hay que recordar al pasar por otro
// modo: si la persona va a «Genérico» y vuelve a «Mi personaje», no pierde
// el personaje que ya había fijado (en disco solo se guarda con «own»).
interface CharacterDraft {
  character: StyleCharacter
  lastDefaultCharacterId?: string
}

// Qué queda en el borrador al cambiar el bloque de personaje. Pura: la
// elección del predeterminado se guarda en el mismo gesto que la aplica, así
// que hay que conocer el borrador nuevo antes de que React lo pinte.
function nextCharacterDraft(
  draft: CharacterDraft,
  next: StyleCharacter,
): CharacterDraft {
  const current = draft.character
  const returnsToOwn = next.mode === 'own' && current.mode !== 'own'
  // Volver a «Mi personaje» desde otro modo recupera el fijado que tenía.
  if (returnsToOwn && !next.defaultCharacterId && draft.lastDefaultCharacterId)
    return {
      ...draft,
      character: {
        mode: 'own',
        defaultCharacterId: draft.lastDefaultCharacterId,
      },
    }
  // Apagar el predeterminado estando en «Mi personaje» lo olvida.
  if (next.mode === 'own' && !next.defaultCharacterId && !returnsToOwn)
    return { character: next }
  return {
    character: next,
    lastDefaultCharacterId:
      next.defaultCharacterId ?? draft.lastDefaultCharacterId,
  }
}

// Ids de las muestras mientras el sidecar todavía no reportó ninguna.
const PLACEHOLDER_SAMPLE_IDS = Array.from(
  { length: CUSTOM_STYLE_SAMPLE_COUNT },
  (_, index) => index + 1,
)

// Modal del estilo (port de ModalEstilo del origen): verlo entero, editarlo y
// probarlo. Orden a propósito: personaje → muestras → proveedor → generar →
// nombre → estilo → Listo, porque el personaje cambia cómo salen las muestras
// y elegirlo después sería generar dos veces. El «estilo» es el texto y los
// planos de siempre en una gema vieja, o sus secciones y su filtro de color en
// una de plantilla (ADR-0048), que antes de existir pasa por «Pegá tu gema».
// Cerrar (Listo, la X o clic afuera) GUARDA el borrador como tarjeta: no hay
// «Cancelar». Regla de modales del origen: nunca dos Radix abiertos —
// mientras se elige el personaje predeterminado, este se ESCONDE en vez de
// apilarse (Radix apaga los clicks del body con el de arriba abierto).
export function CustomStyleModal({
  styleId,
  initial,
  isNew,
  samples: storedSamples,
  saving,
  generateOnOpen,
  script,
  promptModel,
  onSave,
  onClose,
}: CustomStyleModalProps) {
  const { t } = useTranslation()
  const samplesJob = useStyleSampleGeneration()
  // Saldo por proveedor (misma query que Crear y el editor): generar muestras
  // cobra, y el job difiere el refetch al terminar para que el gasto se vea acá.
  const credits = useImageCredits()
  const { configuredProviders } = useRequiredApiKeys()
  // Interruptor de la plantilla (ADR-0048): configuración global, se lee acá.
  const gemTemplateEnabled = useAccessFeature('gemTemplate')
  // Qué editor usa esta apertura, fijo hasta cerrar. Una gema con secciones se
  // edita por secciones aunque el interruptor se haya apagado después (volver
  // atrás no rompe lo guardado); una nueva, solo con el interruptor encendido.
  // Las viejas siguen con el editor de siempre.
  const [templateMode] = useState(
    () => initial.sections !== undefined || (isNew && gemTemplateEnabled),
  )
  const gemDraft = useGemTemplateDraft(initial)
  const gemRebuild = useGemRebuild()

  const [name, setName] = useState(initial.name)
  const [systemPrompt, setSystemPrompt] = useState(initial.systemPrompt)
  const [shots, setShots] = useState(initial.shots.join(', '))
  // Con qué proveedor salen las muestras: lo que la persona tocó, o, hasta
  // que toque, el proveedor con clave configurada (Evolink si están las dos).
  // Sin ninguna clave no hay elegido y el botón de generar espera.
  const [chosenProvider, setChosenProvider] = useState<ImageProviderId | null>(
    null,
  )
  const provider = chosenProvider ?? preferredImageProvider(configuredProviders)
  // Ausente en disco = genérico (gemas previas a ADR-0020). Viaja SIEMPRE en
  // el payload: el guard del sidecar conserva el bloque solo cuando falta.
  const [characterDraft, setCharacterDraft] = useState<CharacterDraft>({
    character: initial.character ?? { mode: 'generic' },
    lastDefaultCharacterId: initial.character?.defaultCharacterId,
  })
  // Selector de personaje abierto, con el ya elegido preseleccionado.
  const [picking, setPicking] = useState<SelectedCharacter[] | null>(null)
  const [saveErrorKey, setSaveErrorKey] = useState<string | null>(null)
  // La generación automática del menú corre UNA vez por apertura.
  const autoStarted = useRef(false)

  // Hay estilo que guardar: el texto de una gema vieja o el estilo visual de
  // una de plantilla (sin él, el sidecar no la acepta).
  const hasStyleText = templateMode
    ? hasGemText({ sections: gemDraft.sections })
    : systemPrompt.trim().length > 0
  // «Pegá tu gema»: un estilo nuevo por plantilla, o «Pegar gema nueva».
  const pasting = templateMode && gemDraft.pasting
  // Las muestras se cobran como N imágenes en calidad base (ADR-0029): con
  // saldo leído insuficiente el botón se frena y se ofrece recargar.
  const samplesEstimate = provider
    ? imageCostEstimate(
        provider,
        defaultQualityFor(provider),
        CUSTOM_STYLE_SAMPLE_COUNT,
      )
    : null
  const creditsCheck = compareCostLines(
    samplesEstimate ? [samplesEstimate] : [],
    { image: credits.credits, voice: null },
    providerLabel,
  )
  const canGenerate =
    hasStyleText &&
    provider !== null &&
    !samplesJob.running &&
    !saving &&
    !creditsCheck.blocking
  const character = characterDraft.character

  const changeCharacter = (next: StyleCharacter) => {
    setCharacterDraft((draft) => nextCharacterDraft(draft, next))
  }

  const payload = (characterToSave: StyleCharacter): StyleSavePayload => {
    // El sidecar exige nombre: sin uno, la tarjeta se llama como en el
    // origen («Estilo sin nombre») en vez de perder el texto.
    const styleName = name.trim() || t('create.customStyles.unnamed')
    if (templateMode)
      return templateStyleSavePayload({
        id: styleId,
        name: styleName,
        sections: gemDraft.sections,
        templateVersion: gemDraft.templateVersion,
        colorFilter: gemDraft.colorFilter,
        character: characterToSave,
        sourcePrompt: gemDraft.sourcePrompt,
      })

    return {
      id: styleId,
      name: styleName,
      systemPrompt: systemPrompt.trim(),
      shots: shots
        .split(',')
        .map((shot) => shot.trim())
        .filter(Boolean),
      character: characterToSave,
    }
  }

  // Guarda el borrador si tiene estilo escrito. Sin texto no hay nada que
  // guardar (el sidecar lo exige); un fallo se muestra y deja el modal
  // abierto para no perder lo tipeado. `characterToSave` permite guardar un
  // bloque recién elegido antes de que React lo pinte.
  const persist = async (
    characterToSave: StyleCharacter = character,
  ): Promise<boolean> => {
    if (!hasStyleText) return false
    setSaveErrorKey(null)
    const toSave = payload(characterToSave)
    try {
      await onSave(toSave)
      // Lo guardado es la referencia de «Pegar gema nueva».
      if (toSave.sections) gemDraft.markSaved(toSave.sections)
      return true
    } catch (error) {
      setSaveErrorKey(videosApi.errorMessageKey(error))
      return false
    }
  }

  // Con muestras generándose o la IA preparando la gema no se cierra: los dos
  // trabajos cuestan y se verían a medias; los botones lo dicen con su spinner.
  const close = async () => {
    if (samplesJob.running || gemRebuild.pending) return
    if (hasStyleText) {
      const saved = await persist()
      if (!saved) return
    }
    onClose()
  }

  // El estilo se guarda ANTES de generar (guard del origen: «muestras sin
  // estilo, no»): el sidecar genera para una tarjeta que ya existe.
  const generate = async (imageProvider: ImageProviderId) => {
    if (!hasStyleText) return
    const saved = await persist()
    if (!saved) return
    await samplesJob.generate(styleId, imageProvider)
  }

  const chooseProvider = (imageProvider: ImageProviderId) => {
    setChosenProvider(imageProvider)
    if (!generateOnOpen || autoStarted.current) return
    autoStarted.current = true
    void generate(imageProvider)
  }

  // «Preparar con IA»: la gema pegada va al agente y vuelve por secciones. Si
  // falla, el texto sigue en la caja y el botón pasa a «Reintentar».
  const prepare = async () => {
    const sourceText = gemDraft.pasteText.trim()
    const response = await gemRebuild.rebuild(styleId, sourceText, 'mi-estilo')
    if (!response) return
    gemDraft.applyRebuild(response, sourceText)
  }

  // «Pegar gema nueva» reemplaza todas las secciones: con algo sin guardar,
  // primero se confirma (nativo, como al borrar una tarjeta: nunca otro modal
  // encima de este).
  const replaceGem = () => {
    if (
      gemDraft.unsavedSections &&
      !window.confirm(t('create.gemTemplate.replaceConfirm'))
    )
      return
    gemRebuild.reset()
    gemDraft.startPasting()
  }

  const writing = samplesJob.phase !== 'images'
  const progressIds = PLACEHOLDER_SAMPLE_IDS
  const sampleImages = storedSamples.map((sample) =>
    videosApi.imageSource(sample.path, sample.mtimeMs),
  )
  // Muestras nuevas → carrusel nuevo, desde la primera.
  const carouselKey = storedSamples
    .map((sample) => `${sample.file}:${sample.mtimeMs}`)
    .join('|')

  return (
    <>
      <Dialog
        open={picking === null}
        onOpenChange={(open) => {
          if (!open) void close()
        }}
      >
        {/* Sin autofoco al abrir: Radix enfoca «lo primero enfocable», que acá
            es el signo de pregunta de la opción activa del personaje, y el
            tooltip se abre con el foco. Tab sigue entrando normalmente. */}
        <DialogContent
          className="max-h-[90vh] max-w-3xl overflow-y-auto"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="font-display">
              {t('create.customStyles.modalTitle')}
            </DialogTitle>
            <DialogDescription>
              {pasting
                ? t('create.gemTemplate.pasteHint')
                : t('create.customStyles.modalDescription')}
            </DialogDescription>
          </DialogHeader>

          {pasting ? (
            <GemPasteStep
              text={gemDraft.pasteText}
              pending={gemRebuild.pending}
              error={gemRebuild.error}
              onTextChange={gemDraft.setPasteText}
              onPrepare={() => void prepare()}
              // Volver solo tiene sentido si ya hay secciones (reemplazo).
              onBack={hasStyleText ? gemDraft.stopPasting : undefined}
            />
          ) : (
            <div className="space-y-4">
              {templateMode && (
                <GemAgentWarnings warnings={gemDraft.warnings} />
              )}

              <StyleCharacterBlock
                value={character}
                disabled={saving}
                styleId={styleId}
                onChange={changeCharacter}
                onPickCharacter={(current) =>
                  setPicking(current ? [current] : [])
                }
              />

              {samplesJob.running ? (
                // Mientras se generan, las 4 muestras se ven como tarjetas
                // cargando con su barra y su %: Evolink el real del poll, Fal
                // la estimación del sidecar.
                <div className="grid grid-cols-2 gap-3">
                  {progressIds.map((id) => {
                    const percent =
                      (writing
                        ? samplesJob.promptPercents[id]
                        : samplesJob.samplePercents[id]) ?? 0
                    const image = samplesJob.sampleImages[id]
                    return (
                      <div
                        key={id}
                        className="relative flex aspect-video flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-border bg-muted/60 px-5"
                      >
                        {image && (
                          <img
                            src={image}
                            alt={t('create.customStyles.sampleAlt', {
                              number: id,
                              name,
                            })}
                            className="absolute inset-0 h-full w-full object-contain"
                          />
                        )}
                        <span className="absolute left-2.5 top-2 font-display text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                          {t('create.customStyles.sampleLabel', { id })}
                        </span>
                        {!image && (
                          <p className="font-body text-xs text-muted-foreground">
                            <SampleProgressText
                              writing={writing}
                              percent={percent}
                            />
                          </p>
                        )}
                        {!image && (
                          <div className="h-1.5 w-full max-w-[180px] overflow-hidden rounded-full bg-border">
                            <div
                              className="h-full rounded-full bg-saffron transition-all duration-500"
                              style={{ width: `${Math.max(4, percent)}%` }}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : sampleImages.length > 0 ? (
                <StyleSamplesCarousel
                  key={carouselKey}
                  images={sampleImages}
                  name={name.trim() || t('create.customStyles.modalTitle')}
                />
              ) : (
                <div className="flex aspect-video items-center justify-center rounded-xl border-2 border-dashed border-border text-center">
                  <p className="px-6 font-body text-sm text-muted-foreground">
                    {t('create.customStyles.samplesEmpty')}
                    <br />
                    {t('create.customStyles.samplesEmptyHint')}
                  </p>
                </div>
              )}

              <div>
                <p className="mb-1.5 text-xs font-medium">
                  {t('create.customStyles.providerQuestion')}
                </p>
                {/* El mismo control segmentado que el formulario de Crear (el
                  elegido en saffron pleno), con el saldo de cada proveedor y
                  el botón de refrescar al lado. */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="inline-flex items-center rounded-full border border-border bg-muted p-0.5">
                    {IMAGE_PROVIDERS.map((imageProvider) => {
                      const chosen = provider === imageProvider.id
                      return (
                        <button
                          key={imageProvider.id}
                          type="button"
                          disabled={samplesJob.running}
                          onClick={() => chooseProvider(imageProvider.id)}
                          className={cn(
                            'cursor-pointer rounded-full px-4 py-1.5 font-display text-sm font-bold transition-colors disabled:cursor-default disabled:opacity-60',
                            chosen
                              ? 'bg-saffron text-charcoal shadow-sm'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {imageProvider.label}
                        </button>
                      )
                    })}
                  </div>
                  <ImageCreditsBadges
                    credits={credits.credits}
                    loading={credits.isLoading}
                    refreshing={credits.isRefreshing}
                    active={provider}
                    onRefresh={credits.refresh}
                  />
                </div>
                <p className="mt-1.5 font-body text-xs text-muted-foreground">
                  {t('create.customStyles.providerHint')}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canGenerate}
                  onClick={() => {
                    if (provider) void generate(provider)
                  }}
                >
                  {samplesJob.running ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('create.customStyles.generating')}
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      {sampleImages.length > 0
                        ? t('create.customStyles.regenerateSamples')
                        : t('create.customStyles.generateSamples')}
                    </>
                  )}
                </Button>
                {provider === null && (
                  <span className="font-body text-xs text-muted-foreground">
                    {t('create.customStyles.providerRequired')}
                  </span>
                )}
              </div>
              <p className="font-body text-xs text-muted-foreground">
                {t('create.customStyles.samplesNote')}
              </p>

              {creditsCheck.blocking && (
                <InsufficientCreditsAlert
                  lines={creditsCheck.lines}
                  blocking
                  onReload={(providerId) =>
                    void apiKeysApi.openBillingPage(providerId)
                  }
                  onRefresh={credits.refresh}
                  refreshing={credits.isLoading || credits.isRefreshing}
                />
              )}

              {saveErrorKey && <ErrorMessage>{t(saveErrorKey)}</ErrorMessage>}
              {samplesJob.errorKey && (
                <ErrorMessage>{t(samplesJob.errorKey)}</ErrorMessage>
              )}

              <div>
                <label
                  htmlFor="custom-style-name"
                  className="mb-1 block text-xs font-medium"
                >
                  {t('create.customStyles.nameLabel')}
                </label>
                <input
                  id="custom-style-name"
                  value={name}
                  maxLength={CUSTOM_STYLE_NAME_LIMIT}
                  disabled={saving}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t('create.customStyles.namePlaceholder')}
                  className={cn(CUSTOM_STYLE_FIELD_CLASS, 'text-sm')}
                />
              </div>

              {templateMode ? (
                <>
                  <GemSectionsEditor
                    sections={gemDraft.sections}
                    disabled={saving}
                    onChange={gemDraft.editSection}
                  />
                  {/* Al agente solo con el interruptor encendido: apagado, una
                    gema de plantilla se edita pero no se reemplaza. */}
                  {gemTemplateEnabled && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={saving || samplesJob.running}
                        onClick={replaceGem}
                      >
                        <ClipboardPaste className="mr-2 h-4 w-4" />
                        {t('create.gemTemplate.replaceGem')}
                      </Button>
                      <span className="font-body text-xs text-muted-foreground">
                        {t('create.gemTemplate.replaceHint')}
                      </span>
                    </div>
                  )}
                  <ColorFilterPicker
                    value={gemDraft.colorFilter}
                    disabled={saving}
                    onChange={gemDraft.setColorFilter}
                  />
                </>
              ) : (
                <>
                  <div>
                    <label
                      htmlFor="custom-style-prompt"
                      className="mb-1 block text-xs font-medium"
                    >
                      {t('create.customStyles.promptLabel')}
                    </label>
                    <textarea
                      id="custom-style-prompt"
                      value={systemPrompt}
                      maxLength={CUSTOM_STYLE_PROMPT_LIMIT}
                      disabled={saving}
                      onChange={(event) => setSystemPrompt(event.target.value)}
                      placeholder={t('create.customStyles.promptPlaceholder')}
                      rows={14}
                      spellCheck={false}
                      className={cn(
                        CUSTOM_STYLE_FIELD_CLASS,
                        'resize-y font-mono text-xs leading-relaxed placeholder:text-muted-foreground/70',
                      )}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="custom-style-shots"
                      className="mb-1 block text-xs font-medium"
                    >
                      {t('create.customStyles.shotsLabel')}{' '}
                      <span className="font-normal text-muted-foreground">
                        {t('create.customStyles.shotsOptional')}
                      </span>
                    </label>
                    <input
                      id="custom-style-shots"
                      value={shots}
                      disabled={saving}
                      onChange={(event) => setShots(event.target.value)}
                      placeholder={t('create.customStyles.shotsPlaceholder')}
                      spellCheck={false}
                      className={cn(
                        CUSTOM_STYLE_FIELD_CLASS,
                        'font-mono text-xs placeholder:text-muted-foreground/70',
                      )}
                    />
                    {/* Los pedidos de prompts van en paralelo, así que uno no sabe
                  con qué plano terminó el anterior: con la lista se reparten
                  de antemano. Sin ella funciona igual. */}
                    <p className="mt-1 font-body text-xs text-muted-foreground">
                      {t('create.customStyles.shotsHint')}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={saving}
                      className="mt-2"
                      onClick={() => setShots(RECOMMENDED_SHOTS.join(', '))}
                    >
                      <Clapperboard className="mr-2 h-4 w-4" />
                      {t('create.customStyles.recommendedShots')}
                    </Button>
                  </div>
                </>
              )}

              <div className="flex justify-end">
                <Button
                  type="button"
                  disabled={saving || samplesJob.running}
                  onClick={() => void close()}
                >
                  {t('create.customStyles.save')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {picking !== null && (
        <CharacterPickerModal
          previewStyleKey={styleId}
          selected={picking}
          max={1}
          styleContext={
            // Solo una gema vieja diseña el personaje nuevo: manda su texto.
            hasStyleText && !templateMode
              ? {
                  styleId,
                  gem: systemPrompt,
                  script,
                  ...(promptModel ? { promptModel } : {}),
                }
              : undefined
          }
          onConfirm={(characters) => {
            const chosen = characters.at(0)
            const draft = nextCharacterDraft(
              characterDraft,
              chosen
                ? { mode: 'own', defaultCharacterId: chosen.characterId }
                : { mode: 'own' },
            )
            setCharacterDraft(draft)
            setPicking(null)
            // v1.19.3 del origen: la elección del predeterminado se guarda al
            // toque, no solo al cerrar (se perdía si la persona salía sin
            // «Listo»). Sin texto todavía no hay tarjeta: la guarda el cierre.
            void persist(draft.character)
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </>
  )
}

interface SampleProgressTextProps {
  writing: boolean
  percent: number
}

// Qué dice cada tarjeta de muestra mientras se genera.
function SampleProgressText({ writing, percent }: SampleProgressTextProps) {
  const { t } = useTranslation()

  if (writing) return t('create.customStyles.writingPrompts')
  if (percent >= 100) return t('create.customStyles.sampleReady')
  return t('create.customStyles.sampleGenerating', { percent })
}
```

- [ ] **Paso 2: La galería**

Reemplazar entero `src/modules/videos/components/CustomStyleGallery.tsx` (reemplaza también los
parches de la Tarea 0):

<!-- prettier-ignore -->
```tsx
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Loader2, Plus } from 'lucide-react'
import { CustomStyleCard } from '@/modules/videos/components/CustomStyleCard'
import { CustomStyleModal } from '@/modules/videos/components/CustomStyleModal'
import {
  closeCustomStyleEditor,
  openCustomStyleEditor,
  useCustomStyleEditor,
} from '@/modules/videos/hooks/useCustomStyleEditor'
import { useCustomStyles } from '@/modules/videos/hooks/useCustomStyles'
import { newCustomStyleId } from '@/modules/videos/constants'
import {
  customStyleDraftFrom,
  selectedCustomStyleFrom,
} from '@/modules/videos/utilities/selectedCustomStyle'
import type {
  CustomStyleDraft,
  SelectedCustomStyle,
} from '@/modules/videos/types/styles'
import type {
  CustomStyleSummary,
  StyleSavePayload,
} from '@pipeline/types/styles.ts'

interface CustomStyleGalleryProps {
  selected: SelectedCustomStyle | null
  disabled: boolean
  // Guion y modelo del formulario: el selector de personaje del modal los usa
  // para diseñar un personaje nuevo coherente con esta gema (ADR-0020).
  script: string
  promptModel: string | null
  onSelect: (style: SelectedCustomStyle | null) => void
}

const EMPTY_DRAFT: CustomStyleDraft = { name: '', systemPrompt: '', shots: [] }

// Galería de estilos propios (port de GaleriaEstilosPropios del origen): una
// tarjeta por estilo guardado + «Crear estilo» SIEMPRE al final, con la misma
// silueta. Arranca VACÍA (v1.35.0 del origen: el estilo de la casa no existe
// acá) y el submit queda bloqueado hasta elegir una tarjeta (formBlockers).
// Qué gema está abierta en el editor vive en un store compartido: la sección
// de personaje abre desde sus chips el editor de la gema EN USO.
export function CustomStyleGallery({
  selected,
  disabled,
  script,
  promptModel,
  onSelect,
}: CustomStyleGalleryProps) {
  const { t } = useTranslation()
  const { styles, isLoading, saveStyle, deleteStyle, saving } =
    useCustomStyles()

  // Estilo abierto en el modal; null = cerrado. El borrador inicial sale de
  // la LISTA VIVA: el editor abre siempre con lo que hay en disco.
  const editing = useCustomStyleEditor()
  const editingStyle = editing
    ? styles.find((style) => style.id === editing.styleId)
    : undefined

  // Si la galería se desmonta con el editor abierto (cambio a Catálogo), el
  // pedido no queda colgado para la próxima vez.
  useEffect(() => closeCustomStyleEditor, [])

  const openCreate = () => {
    if (disabled) return
    openCustomStyleEditor({ styleId: newCustomStyleId(), isNew: true })
  }

  const openEdit = (style: CustomStyleSummary, generateOnOpen: boolean) => {
    openCustomStyleEditor({ styleId: style.id, generateOnOpen })
  }

  const removeStyle = async (style: CustomStyleSummary) => {
    if (
      !window.confirm(
        t('create.customStyles.deleteConfirm', { name: style.name }),
      )
    )
      return
    await deleteStyle(style.id)
    if (selected?.styleId === style.id) onSelect(null)
  }

  const save = async (payload: StyleSavePayload) => {
    const wasNew = !styles.some((style) => style.id === payload.id)
    const { entry } = await saveStyle(payload)
    // Una tarjeta recién creada queda EN USO: la persona la acaba de armar
    // para usarla. Una editada solo si ya lo estaba — editar un estilo no
    // cambia cuál se usa (origen). El snapshot sale de lo que quedó guardado
    // (con sus secciones, si es de plantilla), no del pedido.
    if (!wasNew && selected?.styleId !== payload.id) return
    onSelect(selectedCustomStyleFrom(entry))
  }

  return (
    <div className="space-y-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500">
          <Check className="h-4 w-4 text-white" strokeWidth={3} />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-lg font-extrabold leading-tight text-foreground">
            {t('create.style.label')}
          </h3>
          <p className="font-body text-sm leading-snug text-muted-foreground">
            {t('create.customStyles.galleryHint')}
          </p>
        </div>
      </div>

      {isLoading && (
        <p className="py-6 text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {styles.map((style) => (
          <CustomStyleCard
            key={style.id}
            style={style}
            selected={selected?.styleId === style.id}
            disabled={disabled}
            onSelect={() => onSelect(selectedCustomStyleFrom(style))}
            onEdit={() => openEdit(style, false)}
            onGenerateSamples={() => openEdit(style, true)}
            onDelete={() => void removeStyle(style)}
          />
        ))}

        {/* La tarjeta de CREAR es fija: solo crea, nunca se transforma en un
            estilo. MISMA silueta que una tarjeta de estilo (zona 4:3 arriba +
            pie de dos líneas): mide lo mismo esté donde esté, y la grilla
            crece hacia abajo. */}
        <div
          role="button"
          tabIndex={disabled ? undefined : 0}
          onClick={openCreate}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            openCreate()
          }}
          className="group flex cursor-pointer select-none flex-col overflow-hidden rounded-2xl border-2 border-dashed border-border bg-card text-muted-foreground outline-none transition-all hover:border-saffron/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-saffron/50"
        >
          <div className="flex aspect-[4/3] items-center justify-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-current transition-transform group-hover:scale-110">
              <Plus className="h-6 w-6" />
            </span>
          </div>
          <div className="px-3.5 py-2.5 text-left">
            <p className="truncate font-display text-base font-bold text-foreground">
              {t('create.customStyles.createCard')}
            </p>
            <p className="truncate font-body text-xs text-muted-foreground">
              {t('create.customStyles.createCardHint')}
            </p>
          </div>
        </div>
      </div>

      {/* Sin tarjeta elegida el video no sale: se dice acá, junto a la
          galería (origen), además de en la lista de bloqueos del envío. */}
      {!selected && !isLoading && (
        <p className="rounded-xl border-2 border-saffron/60 bg-saffron/10 px-4 py-3 font-body text-sm text-foreground">
          {t('create.customStyles.pickNotice')}
        </p>
      )}

      {editing && (editing.isNew || editingStyle) && (
        <CustomStyleModal
          // Una gema distinta = un borrador distinto: el modal siembra su
          // estado desde `initial` UNA sola vez, así que la clave es el id y
          // no el contenido (una invalidación de la lista con el modal
          // abierto no re-siembra lo tipeado).
          key={editing.styleId}
          styleId={editing.styleId}
          initial={
            editingStyle ? customStyleDraftFrom(editingStyle) : EMPTY_DRAFT
          }
          isNew={editing.isNew}
          // Derivadas de la query viva: al terminar de generar, la
          // invalidación refetchea y el modal muestra las muestras solo.
          samples={editingStyle?.samples ?? []}
          saving={saving}
          generateOnOpen={editing.generateOnOpen}
          script={script}
          promptModel={promptModel}
          onSave={save}
          onClose={closeCustomStyleEditor}
        />
      )}
    </div>
  )
}
```

- [ ] **Paso 3: Textos (es, en, pt)**

En cada catálogo, justo después de la línea `    "gemTemplate": {`, insertar:

`public/locales/es.json`:

<!-- prettier-ignore -->
```text
      "pasteHint": "Pegá el texto completo de tu gema. La IA de Vimo lo ordena en secciones (estilo visual, personaje, dinamismo, cámara y reglas) sin inventar nada: lo que no está en tu gema no aparece.",
      "replaceGem": "Pegar gema nueva",
      "replaceHint": "Reemplaza todas las secciones por las de otra gema.",
      "replaceConfirm": "La gema nueva reemplaza todas las secciones y se pierde lo que no guardaste. ¿Seguimos?",
```

`public/locales/en.json`:

<!-- prettier-ignore -->
```text
      "pasteHint": "Paste the full text of your gem. Vimo's AI sorts it into sections (visual style, character, dynamism, camera and rules) without inventing anything: what isn't in your gem won't show up.",
      "replaceGem": "Paste a new gem",
      "replaceHint": "Replaces every section with those of another gem.",
      "replaceConfirm": "The new gem replaces every section and anything you haven't saved is lost. Continue?",
```

`public/locales/pt.json`:

<!-- prettier-ignore -->
```text
      "pasteHint": "Cole o texto completo da sua gema. A IA do Vimo o organiza em seções (estilo visual, personagem, dinamismo, câmera e regras) sem inventar nada: o que não está na sua gema não aparece.",
      "replaceGem": "Colar gema nova",
      "replaceHint": "Substitui todas as seções pelas de outra gema.",
      "replaceConfirm": "A gema nova substitui todas as seções e o que você não salvou se perde. Continuar?",
```

- [ ] **Paso 4: Verificación**

Run:

<!-- prettier-ignore -->
```bash
pnpm exec prettier --write src/modules/videos/components/CustomStyleModal.tsx src/modules/videos/components/CustomStyleGallery.tsx public/locales/es.json public/locales/en.json public/locales/pt.json
pnpm exec eslint src/modules/videos/components/CustomStyleModal.tsx src/modules/videos/components/CustomStyleGallery.tsx
pnpm exec tsc -p tsconfig.app.json --noEmit
node --test scripts/test/check-app-gem-sections.mjs scripts/test/check-app-gem-rebuild.mjs
node scripts/test/check-locales.mjs
git diff -w --stat -- src/modules/videos/components/CustomStyleModal.tsx
```

Expected: todo en verde; `check-locales` con 4 claves más; el `diff -w` del modal chico (el
grueso del diff sin `-w` es indentación).

- [ ] **Paso 5: QA manual (en `pnpm tauri dev`, sin claves)**

Hacer los pasos A, B, C y F de «QA manual» (al final del plan). Los D y E necesitan el sidecar de
la Ola 1; si todavía no está integrado, quedan para la Tarea I4 del orquestador.

- [ ] **Paso 6: Commit (orquestador)**

<!-- prettier-ignore -->
```bash
git add src/modules/videos/components/CustomStyleModal.tsx src/modules/videos/components/CustomStyleGallery.tsx public/locales/es.json public/locales/en.json public/locales/pt.json
git commit -F - <<'EOF'
feat(videos): edit template gems by sections in the custom style modal

Qué: con el interruptor gemTemplate, «Crear estilo» abre el modal en «Pegá
tu gema» y, al volver del agente, muestra las secciones con los avisos, el
filtro de color y «Pegar gema nueva» (confirma si hay algo sin guardar). Una
gema de plantilla se edita por secciones y se guarda al cerrar con
style-save, sin agente; no tiene «Planos permitidos». El selector de
personaje del modal diseña con la gema solo si es vieja: una de plantilla
necesita que design-style-character acepte secciones. La galería pasa isNew al
modal, arma el borrador con customStyleDraftFrom y toma el snapshot en uso de
lo que quedó guardado.

Por qué: la UI de Mi estilo de la Entrega 1 (spec §4.3 y §7). Sin el
interruptor, las gemas de siempre y «Crear estilo» quedan exactamente como
hoy; una gema de plantilla sigue editable aunque el interruptor se apague
(sin agente).

Con qué interactúa: useAccessFeature (C1), useGemRebuild (C3) y los
componentes y el borrador de C4b. Un solo modal Radix a la vez (la
confirmación es nativa, como al borrar una tarjeta). Hasta C6 el envío de
Crear todavía no manda las secciones. Revisar con git diff -w: el bloque del
editor viejo solo cambió de indentación.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Tarea C5: gemas viejas a la plantilla

**Files:**

- Modify: `src/modules/videos/types/styles.ts` (`GemMigrationState` al final)
- Create: `src/modules/videos/utilities/gemMigrations.ts`
- Modify: `src/modules/videos/utilities/gemTemplate.ts` (import, `migrationRebuildText` y `migrationStyleSavePayload`)
- Modify: `src/modules/videos/utilities/selectedCustomStyle.ts` (`refreshedCustomStyle`)
- Create: `src/modules/videos/hooks/useGemMigrations.ts`
- Create: `src/modules/videos/components/GemMigrationNotice.tsx`
- Modify: `src/modules/videos/components/CustomStyleGallery.tsx` (entero)
- Modify: `src/modules/videos/components/CustomStyleModal.tsx` (props y bloqueo)
- Modify: `src/modules/videos/views/Create/Create.tsx` (derivación del snapshot)
- Modify: `public/locales/es.json`, `public/locales/en.json`, `public/locales/pt.json`
- Test: `scripts/test/check-app-gem-migration.mjs`

**Interfaces:**

- Consumes: `videosApi.rebuildGem`, `gemRebuildRequest` (C3); `cleanGemSections`,
  `selectedCustomStyleFrom`, `customStyleDraftFrom` (C4a); `useAccessFeature` (C1);
  `GemRebuildErrorText` (C3); el modal y la galería de C4c.
- Produces:
  - `interface GemMigrationState { status: 'pending' | 'failed'; name: string; error: unknown }`
    (`@/modules/videos/types/styles`).
  - `createGemMigrations(migrate: (style: CustomStyleSummary) => Promise<void>)` devuelve
    `{ migrateOnce(style): void; retry(style): void; subscribe(listener): () => void; getSnapshot(): ReadonlyMap<string, GemMigrationState> }`.
  - `migrationRebuildText(style: CustomStyleSummary): string`: el `systemPrompt` y, si la gema
    tiene `shots`, el bloque `# ALLOWED SHOTS` del sidecar; sin `shots`, el `systemPrompt` tal cual.
  - `migrationStyleSavePayload(style: CustomStyleSummary, response: GemRebuildResponse): StyleSavePayload`
    (el `sourcePrompt` es el texto que se mandó al agente).
  - `refreshedCustomStyle(selected: SelectedCustomStyle | null, styles: CustomStyleSummary[]): SelectedCustomStyle | null`.
  - `migrateGemOnce(style)`, `retryGemMigration(style)`, `useGemMigrations(): ReadonlyMap<string, GemMigrationState>`.
  - `GemMigrationNotice({ migration: GemMigrationState; named: boolean; onRetry: () => void })`.
  - `CustomStyleModal` suma las props `migration: GemMigrationState | null` y
    `onRetryMigration: () => void`.

Cómo funciona: la galería dispara la migración al abrir una gema vieja en el editor (un efecto,
porque el editor también se abre desde el chip de personaje de Crear) y al elegirla en Crear (un
manejador). Al agente va el `systemPrompt` de la gema y, si tiene planos, el bloque
`# ALLOWED SHOTS (use ONLY these framings)` con el formato con que el sidecar se los suma hoy
(`buildCustomStyleSystemPrompt`, copiado tal cual porque `src/` no importa valores de
`pipeline/`): el agente los pasa a la sección `camera`, porque una gema de plantilla no guarda
planos. Ese mismo texto queda como `sourcePrompt`. Si con los planos la gema pasara el tope de
30 000 caracteres, va sin ellos. El store deja una sola en vuelo por gema, una vez por sesión: después de un fallo no se
repite sola; queda «Reintentar». La migración espera la lista nueva antes de apagar el aviso, y la
clave del modal incluye el editor (`legacy` → `template`), así el modal se vuelve a sembrar por
secciones al terminar. Mientras migra, el editor viejo queda quieto y cerrar no guarda (una
escritura vieja pisaría las secciones). Crear refresca el snapshot elegido en el render
(`refreshedCustomStyle`): el envío no espera la migración y, si ya terminó, sale por el marco nuevo.

- [ ] **Paso 1: Escribir el guard que falla**

Crear `scripts/test/check-app-gem-migration.mjs`:

<!-- prettier-ignore -->
```js
// Gemas viejas a la plantilla (spec §4.4): una sola migración en vuelo por
// gema, una vez por sesión, sin repetirse sola después de un fallo; el texto
// que va al agente (con los planos de la gema); el guardado con ese texto de
// respaldo; y el snapshot de Crear que se refresca cuando la gema elegida ya se
// migró. Módulos puros de src/ corridos con Node
// (type stripping), con el agente y el guardado simulados.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createGemMigrations } from '../../src/modules/videos/utilities/gemMigrations.ts'
import {
  migrationRebuildText,
  migrationStyleSavePayload,
} from '../../src/modules/videos/utilities/gemTemplate.ts'
import {
  refreshedCustomStyle,
  selectedCustomStyleFrom,
} from '../../src/modules/videos/utilities/selectedCustomStyle.ts'

const OLD_GEM = {
  id: 'st-vieja',
  name: 'Vieja',
  systemPrompt: '  Acuarela editorial con tinta suelta. Escribí en español.  ',
  shots: ['Wide shot'],
  character: { mode: 'none' },
  createdAt: '2026-09-01T00:00:00.000Z',
  samples: [],
}

const MIGRATED_GEM = {
  ...OLD_GEM,
  systemPrompt: undefined,
  shots: [],
  sections: { visualStyle: 'Acuarela editorial con tinta suelta.' },
  templateVersion: 1,
  sourcePrompt: 'Acuarela editorial con tinta suelta. Escribí en español.',
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

// Un migrate simulado que se resuelve a mano, y cuántas veces se llamó.
function fakeMigrate() {
  const calls = []
  return {
    calls,
    migrate(style) {
      const call = deferred()
      calls.push({ style, ...call })
      return call.promise
    },
  }
}

const settle = () => new Promise((done) => setTimeout(done, 0))

test('una gema vieja se manda una sola vez aunque se pida dos veces', () => {
  const agent = fakeMigrate()
  const migrations = createGemMigrations(agent.migrate)
  migrations.migrateOnce(OLD_GEM)
  migrations.migrateOnce(OLD_GEM)
  migrations.retry(OLD_GEM)
  assert.equal(agent.calls.length, 1)
  assert.deepEqual(migrations.getSnapshot().get('st-vieja'), {
    status: 'pending',
    name: 'Vieja',
    error: null,
  })
})

test('al salir bien se apaga el aviso y no se repite aunque la lista siga vieja', async () => {
  const agent = fakeMigrate()
  const migrations = createGemMigrations(agent.migrate)
  migrations.migrateOnce(OLD_GEM)
  agent.calls[0].resolve()
  await settle()
  assert.equal(migrations.getSnapshot().has('st-vieja'), false)
  migrations.migrateOnce(OLD_GEM)
  migrations.retry(OLD_GEM)
  assert.equal(agent.calls.length, 1)
})

test('si falla queda el aviso con el error; no se repite solo, sí con Reintentar', async () => {
  const agent = fakeMigrate()
  const migrations = createGemMigrations(agent.migrate)
  migrations.migrateOnce(OLD_GEM)
  const failure = new Error('sin red')
  agent.calls[0].reject(failure)
  await settle()
  assert.deepEqual(migrations.getSnapshot().get('st-vieja'), {
    status: 'failed',
    name: 'Vieja',
    error: failure,
  })
  migrations.migrateOnce(OLD_GEM)
  assert.equal(agent.calls.length, 1)
  migrations.retry(OLD_GEM)
  migrations.retry(OLD_GEM)
  assert.equal(agent.calls.length, 2)
  assert.equal(migrations.getSnapshot().get('st-vieja')?.status, 'pending')
})

test('una gema de plantilla o sin texto no se migra', () => {
  const agent = fakeMigrate()
  const migrations = createGemMigrations(agent.migrate)
  migrations.migrateOnce(MIGRATED_GEM)
  migrations.migrateOnce({ ...OLD_GEM, id: 'st-vacia', systemPrompt: '   ' })
  migrations.retry(MIGRATED_GEM)
  assert.equal(agent.calls.length, 0)
  assert.equal(migrations.getSnapshot().size, 0)
})

test('quien escucha se entera de cada cambio', async () => {
  const agent = fakeMigrate()
  const migrations = createGemMigrations(agent.migrate)
  let notified = 0
  const unsubscribe = migrations.subscribe(() => {
    notified += 1
  })
  migrations.migrateOnce(OLD_GEM)
  agent.calls[0].resolve()
  await settle()
  assert.equal(notified, 2)
  unsubscribe()
  migrations.migrateOnce({ ...OLD_GEM, id: 'st-otra' })
  assert.equal(notified, 2)
})

test('sin planos, al agente va el systemPrompt tal cual', () => {
  for (const shots of [[], ['', '']])
    assert.equal(
      migrationRebuildText({ ...OLD_GEM, shots }),
      'Acuarela editorial con tinta suelta. Escribí en español.',
    )
})

test('con planos, se suma el bloque # ALLOWED SHOTS del sidecar', () => {
  assert.equal(
    migrationRebuildText({ ...OLD_GEM, shots: ['Wide shot', '', 'Close-up'] }),
    'Acuarela editorial con tinta suelta. Escribí en español.\n\n# ALLOWED SHOTS (use ONLY these framings)\n- Wide shot\n- Close-up',
  )
})

test('si con los planos pasara el tope de una gema, va sin ellos', () => {
  const tooLong = 'a'.repeat(29_990)
  assert.equal(
    migrationRebuildText({ ...OLD_GEM, systemPrompt: tooLong }),
    tooLong,
  )
  const fits = 'a'.repeat(29_900)
  assert.equal(
    migrationRebuildText({ ...OLD_GEM, systemPrompt: fits }),
    `${fits}\n\n# ALLOWED SHOTS (use ONLY these framings)\n- Wide shot`,
  )
})

test('guardar la migración: secciones, el templateVersion del agente y, de respaldo, el texto que se le mandó; nada más', () => {
  const response = {
    templateVersion: 1,
    sections: { visualStyle: ' Acuarela editorial. ', character: '' },
    suggestions: {},
    warnings: ['Se quitó el pedido de escribir en español.'],
  }
  const payload = migrationStyleSavePayload(OLD_GEM, response)
  assert.deepEqual(payload, {
    id: 'st-vieja',
    name: 'Vieja',
    sections: { visualStyle: 'Acuarela editorial.' },
    templateVersion: 1,
    sourcePrompt:
      'Acuarela editorial con tinta suelta. Escribí en español.\n\n# ALLOWED SHOTS (use ONLY these framings)\n- Wide shot',
  })
  assert.equal(payload.sourcePrompt, migrationRebuildText(OLD_GEM))
  for (const field of ['systemPrompt', 'shots', 'character', 'colorFilter'])
    assert.equal(field in payload, false, field)
})

test('Crear: el snapshot viejo se cambia por la gema migrada', () => {
  const chosen = selectedCustomStyleFrom(OLD_GEM)
  const refreshed = refreshedCustomStyle(chosen, [MIGRATED_GEM])
  assert.deepEqual(refreshed?.sections, MIGRATED_GEM.sections)
  assert.equal(refreshed?.templateVersion, 1)
})

test('Crear: sin migración, el mismo objeto (el formulario no cambia de identidad)', () => {
  const chosen = selectedCustomStyleFrom(OLD_GEM)
  assert.equal(refreshedCustomStyle(chosen, [OLD_GEM]), chosen)
  assert.equal(refreshedCustomStyle(chosen, []), chosen)
  assert.equal(refreshedCustomStyle(null, [MIGRATED_GEM]), null)
  const template = selectedCustomStyleFrom(MIGRATED_GEM)
  assert.equal(refreshedCustomStyle(template, [MIGRATED_GEM]), template)
})
```

- [ ] **Paso 2: Correrlo y verlo fallar**

Run: `node --test scripts/test/check-app-gem-migration.mjs`
Expected: FAIL con `ERR_MODULE_NOT_FOUND` (todavía no existe `gemMigrations.ts`).

- [ ] **Paso 3: Tipo del estado de una migración**

Al final de `src/modules/videos/types/styles.ts` agregar:

<!-- prettier-ignore -->
```ts

// Migración automática de una gema vieja a la plantilla (spec §4.4).
export interface GemMigrationState {
  status: 'pending' | 'failed'
  // El nombre al empezar: el aviso de la galería lo muestra.
  name: string
  // Por qué falló; null mientras está en vuelo.
  error: unknown
}
```

- [ ] **Paso 4: Store de migraciones (puro)**

Crear `src/modules/videos/utilities/gemMigrations.ts`:

<!-- prettier-ignore -->
```ts
import type { GemMigrationState } from '@/modules/videos/types/styles'
import type { CustomStyleSummary } from '@pipeline/types/styles.ts'

// Migración de gemas viejas a la plantilla (spec §4.4), como store fuera de
// React (patrón de useCustomStyleEditor): la dispara la galería (al abrir una
// gema en el modal o al elegirla en Crear) y la leen la galería y el modal.
// Puro: `migrate` llega inyectado (el agente más el guardado), así el guard
// scripts/test/check-app-gem-migration.mjs lo prueba sin red ni sidecar.
export function createGemMigrations(
  migrate: (style: CustomStyleSummary) => Promise<void>,
) {
  let states: ReadonlyMap<string, GemMigrationState> = new Map()
  const subscribers = new Set<() => void>()
  // Gemas ya migradas en esta sesión: la lista puede tardar en refrescarse y
  // mostrarlas todavía viejas; no se vuelven a mandar al agente.
  const migrated = new Set<string>()

  const publish = (next: Map<string, GemMigrationState>) => {
    states = next
    for (const subscriber of subscribers) subscriber()
  }

  const put = (styleId: string, state: GemMigrationState) => {
    const next = new Map(states)
    next.set(styleId, state)
    publish(next)
  }

  const remove = (styleId: string) => {
    const next = new Map(states)
    next.delete(styleId)
    publish(next)
  }

  const run = async (style: CustomStyleSummary) => {
    put(style.id, { status: 'pending', name: style.name, error: null })
    try {
      await migrate(style)
      migrated.add(style.id)
      remove(style.id)
    } catch (error) {
      put(style.id, { status: 'failed', name: style.name, error })
    }
  }

  // Solo una gema vieja con texto que no se migró todavía en esta sesión.
  const migratable = (style: CustomStyleSummary) =>
    !style.sections &&
    Boolean(style.systemPrompt?.trim()) &&
    !migrated.has(style.id)

  return {
    // Automático (abrir en el modal, elegir en Crear): una vez por gema y por
    // sesión. Después de un fallo no se repite solo: queda «Reintentar».
    migrateOnce(style: CustomStyleSummary): void {
      if (!migratable(style) || states.has(style.id)) return
      void run(style)
    },
    // «Reintentar»: otra vez, salvo que ya haya una en vuelo.
    retry(style: CustomStyleSummary): void {
      if (!migratable(style) || states.get(style.id)?.status === 'pending')
        return
      void run(style)
    },
    subscribe(listener: () => void): () => void {
      subscribers.add(listener)
      return () => {
        subscribers.delete(listener)
      }
    },
    getSnapshot(): ReadonlyMap<string, GemMigrationState> {
      return states
    },
  }
}
```

- [ ] **Paso 5: El texto de la migración, su guardado y el refresco del snapshot (puro)**

En `src/modules/videos/utilities/gemTemplate.ts`, en el import de `@pipeline/types/styles.ts`
agregar `  CustomStyleSummary,` debajo de `  COLOR_FILTER_IDS as PIPELINE_COLOR_FILTER_IDS,`, y
al final del archivo agregar:

<!-- prettier-ignore -->
```ts

// Los planos de una gema vieja en el formato con que el sidecar se los suma al
// componerla (buildCustomStyleSystemPrompt, pipeline/prompts/custom-style.ts):
// copia literal, porque `src/` no importa valores de `pipeline/`.
function allowedShotsBlock(shots: string[]): string {
  const allowed = shots.filter(Boolean)
  if (allowed.length === 0) return ''
  return `\n\n# ALLOWED SHOTS (use ONLY these framings)\n${allowed
    .map((shot) => `- ${shot}`)
    .join('\n')}`
}

/**
 * El texto que va al agente al migrar una gema vieja (spec §4.4): su
 * `systemPrompt` y, si tiene planos, el bloque «# ALLOWED SHOTS» del sidecar,
 * para que el agente los pase a la sección `camera` (una gema de plantilla no
 * guarda planos). Sin planos, el `systemPrompt` tal cual. Si con los planos
 * pasara el tope de una gema, va sin ellos: mejor perder los planos que no
 * poder migrarla nunca.
 */
export function migrationRebuildText(style: CustomStyleSummary): string {
  const systemPrompt = (style.systemPrompt ?? '').trim()
  const withShots = `${systemPrompt}${allowedShotsBlock(style.shots)}`.trim()
  if (withShots.length > GEM_TOTAL_CHAR_LIMIT) return systemPrompt
  return withShots
}

/**
 * style-save de una gema vieja reconstruida sola (spec §4.4): sus secciones,
 * el `templateVersion` que devolvió el agente y, de respaldo, el texto que se
 * le mandó (su `systemPrompt` y sus planos) como `sourcePrompt`. No manda
 * `systemPrompt` (una gema tiene secciones o texto, nunca los dos) ni
 * personaje ni filtro: ausentes, el sidecar conserva los guardados.
 */
export function migrationStyleSavePayload(
  style: CustomStyleSummary,
  response: GemRebuildResponse,
): StyleSavePayload {
  return {
    id: style.id,
    name: style.name,
    sections: cleanGemSections(response.sections),
    templateVersion: response.templateVersion,
    sourcePrompt: migrationRebuildText(style),
  }
}
```

Al final de `src/modules/videos/utilities/selectedCustomStyle.ts` agregar:

<!-- prettier-ignore -->
```ts

// La gema elegida en Crear es un snapshot. Si mientras tanto se migró a la
// plantilla (spec §4.4), el snapshot viejo se cambia por lo guardado: el envío
// sale por el marco nuevo sin volver a elegirla. En cualquier otro caso
// devuelve el MISMO objeto, así el formulario no cambia de identidad.
export function refreshedCustomStyle(
  selected: SelectedCustomStyle | null,
  styles: CustomStyleSummary[],
): SelectedCustomStyle | null {
  if (!selected || selected.sections) return selected
  const stored = styles.find((style) => style.id === selected.styleId)
  if (!stored?.sections) return selected
  return selectedCustomStyleFrom(stored)
}
```

- [ ] **Paso 6: Correr el guard**

Run: `node --test scripts/test/check-app-gem-migration.mjs`
Expected: PASS, 11 casos.

- [ ] **Paso 7: El store con el agente y el guardado reales**

Crear `src/modules/videos/hooks/useGemMigrations.ts`:

<!-- prettier-ignore -->
```ts
import { useSyncExternalStore } from 'react'
import i18next from 'i18next'
import { Brand } from '@/modules/common/brand/brand'
import { queryClient } from '@/modules/common/queryClient'
import { videosApi } from '@/modules/videos/api'
import { videosQueryKeys } from '@/modules/videos/constants'
import { createGemMigrations } from '@/modules/videos/utilities/gemMigrations'
import {
  gemRebuildRequest,
  migrationRebuildText,
  migrationStyleSavePayload,
} from '@/modules/videos/utilities/gemTemplate'
import type { GemMigrationState } from '@/modules/videos/types/styles'
import type { CustomStyleSummary } from '@pipeline/types/styles.ts'

// Manda la gema vieja al agente con `origin: 'migracion'` (su texto y sus
// planos), guarda sus secciones con ese texto de respaldo y espera la lista
// nueva: el aviso se apaga recién cuando la galería ya muestra la gema migrada.
async function migrateGem(style: CustomStyleSummary): Promise<void> {
  const response = await videosApi.rebuildGem(
    gemRebuildRequest(
      migrationRebuildText(style),
      'migracion',
      Brand.version,
      i18next.resolvedLanguage,
    ),
  )
  await videosApi.saveCustomStyle(migrationStyleSavePayload(style, response))
  await queryClient.invalidateQueries({
    queryKey: videosQueryKeys.customStyles,
  })
}

const gemMigrations = createGemMigrations(migrateGem)

// Automática: una vez por gema y por sesión (spec §4.4).
export const migrateGemOnce = gemMigrations.migrateOnce
// «Reintentar» del aviso.
export const retryGemMigration = gemMigrations.retry

// Las migraciones en vuelo o fallidas, por id de gema.
export function useGemMigrations(): ReadonlyMap<string, GemMigrationState> {
  return useSyncExternalStore(
    gemMigrations.subscribe,
    gemMigrations.getSnapshot,
  )
}
```

(`i18next` directo, fuera de React, como ya hace `useCreateTask.ts`.)

- [ ] **Paso 8: El aviso**

Crear `src/modules/videos/components/GemMigrationNotice.tsx`:

<!-- prettier-ignore -->
```tsx
import { useTranslation } from 'react-i18next'
import { Loader2, RefreshCw } from 'lucide-react'
import { Alert } from '@/modules/common/components/Alert'
import { Button } from '@/modules/common/ui/button'
import { GemRebuildErrorText } from '@/modules/videos/components/GemRebuildErrorText'
import type { GemMigrationState } from '@/modules/videos/types/styles'

interface GemMigrationNoticeProps {
  migration: GemMigrationState
  // En la galería se nombra la gema; en su propio modal no hace falta.
  named: boolean
  onRetry: () => void
}

// Aviso de la actualización automática de una gema vieja a la plantilla (spec
// §4.4): en curso, o fallida con «Reintentar». Mientras falla, la gema sigue
// funcionando por el camino viejo. Presentacional.
export function GemMigrationNotice({
  migration,
  named,
  onRetry,
}: GemMigrationNoticeProps) {
  const { t } = useTranslation()

  if (migration.status === 'pending')
    return (
      <p
        role="status"
        className="flex items-center gap-2 rounded-xl border-2 border-saffron/30 bg-saffron/5 px-4 py-3 font-body text-sm text-foreground"
      >
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-saffron" />
        {named
          ? t('create.gemTemplate.migrationPendingNamed', {
              name: migration.name,
            })
          : t('create.gemTemplate.migrationPending')}
      </p>
    )

  return (
    <Alert
      tone="warning"
      title={
        named
          ? t('create.gemTemplate.migrationFailedNamed', {
              name: migration.name,
            })
          : t('create.gemTemplate.migrationFailed')
      }
      actions={
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {t('create.gemTemplate.retry')}
        </Button>
      }
    >
      <GemRebuildErrorText error={migration.error} />
    </Alert>
  )
}
```

- [ ] **Paso 9: La galería dispara y muestra las migraciones**

Reemplazar entero `src/modules/videos/components/CustomStyleGallery.tsx`:

<!-- prettier-ignore -->
```tsx
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Loader2, Plus } from 'lucide-react'
import { useAccessFeature } from '@/modules/common/hooks/useAccessFeature'
import { CustomStyleCard } from '@/modules/videos/components/CustomStyleCard'
import { CustomStyleModal } from '@/modules/videos/components/CustomStyleModal'
import { GemMigrationNotice } from '@/modules/videos/components/GemMigrationNotice'
import {
  closeCustomStyleEditor,
  openCustomStyleEditor,
  useCustomStyleEditor,
} from '@/modules/videos/hooks/useCustomStyleEditor'
import { useCustomStyles } from '@/modules/videos/hooks/useCustomStyles'
import {
  migrateGemOnce,
  retryGemMigration,
  useGemMigrations,
} from '@/modules/videos/hooks/useGemMigrations'
import { newCustomStyleId } from '@/modules/videos/constants'
import {
  customStyleDraftFrom,
  selectedCustomStyleFrom,
} from '@/modules/videos/utilities/selectedCustomStyle'
import type { CustomStyleEditorRequest } from '@/modules/videos/hooks/useCustomStyleEditor'
import type {
  CustomStyleDraft,
  SelectedCustomStyle,
} from '@/modules/videos/types/styles'
import type {
  CustomStyleSummary,
  StyleSavePayload,
} from '@pipeline/types/styles.ts'

interface CustomStyleGalleryProps {
  selected: SelectedCustomStyle | null
  disabled: boolean
  // Guion y modelo del formulario: el selector de personaje del modal los usa
  // para diseñar un personaje nuevo coherente con esta gema (ADR-0020).
  script: string
  promptModel: string | null
  onSelect: (style: SelectedCustomStyle | null) => void
}

const EMPTY_DRAFT: CustomStyleDraft = { name: '', systemPrompt: '', shots: [] }

// Qué editor dibuja el modal. Una gema nueva conserva el suyo al guardarse;
// una vieja que termina de migrarse pasa a «template» y la clave nueva del
// modal lo vuelve a sembrar con sus secciones.
function editorLayoutOf(
  request: CustomStyleEditorRequest,
  style: CustomStyleSummary | undefined,
): string {
  if (request.isNew) return 'new'
  if (style?.sections) return 'template'
  return 'legacy'
}

// Galería de estilos propios (port de GaleriaEstilosPropios del origen): una
// tarjeta por estilo guardado + «Crear estilo» SIEMPRE al final, con la misma
// silueta. Arranca VACÍA (v1.35.0 del origen: el estilo de la casa no existe
// acá) y el submit queda bloqueado hasta elegir una tarjeta (formBlockers).
// Qué gema está abierta en el editor vive en un store compartido: la sección
// de personaje abre desde sus chips el editor de la gema EN USO. Con la
// plantilla encendida (ADR-0048), una gema vieja se actualiza sola la primera
// vez que se abre o se elige (spec §4.4), sin bloquear su uso.
export function CustomStyleGallery({
  selected,
  disabled,
  script,
  promptModel,
  onSelect,
}: CustomStyleGalleryProps) {
  const { t } = useTranslation()
  const { styles, isLoading, saveStyle, deleteStyle, saving } =
    useCustomStyles()
  const gemTemplateEnabled = useAccessFeature('gemTemplate')
  const migrations = useGemMigrations()

  // Estilo abierto en el modal; null = cerrado. El borrador inicial sale de
  // la LISTA VIVA: el editor abre siempre con lo que hay en disco.
  const editing = useCustomStyleEditor()
  const editingStyle = editing
    ? styles.find((style) => style.id === editing.styleId)
    : undefined

  // Si la galería se desmonta con el editor abierto (cambio a Catálogo), el
  // pedido no queda colgado para la próxima vez.
  useEffect(() => closeCustomStyleEditor, [])

  // Abrir una gema vieja en el editor la manda a migrar, una vez por sesión.
  // Efecto y no manejador: el editor también se abre desde el chip de
  // personaje de Crear, no solo desde esta galería.
  useEffect(() => {
    if (!gemTemplateEnabled || !editingStyle) return
    migrateGemOnce(editingStyle)
  }, [gemTemplateEnabled, editingStyle])

  const openCreate = () => {
    if (disabled) return
    openCustomStyleEditor({ styleId: newCustomStyleId(), isNew: true })
  }

  const openEdit = (style: CustomStyleSummary, generateOnOpen: boolean) => {
    openCustomStyleEditor({ styleId: style.id, generateOnOpen })
  }

  // Elegir una gema vieja también la manda a migrar; mientras tanto se usa
  // como está y el envío de Crear no espera.
  const selectStyle = (style: CustomStyleSummary) => {
    onSelect(selectedCustomStyleFrom(style))
    if (gemTemplateEnabled) migrateGemOnce(style)
  }

  const removeStyle = async (style: CustomStyleSummary) => {
    if (
      !window.confirm(
        t('create.customStyles.deleteConfirm', { name: style.name }),
      )
    )
      return
    await deleteStyle(style.id)
    if (selected?.styleId === style.id) onSelect(null)
  }

  const save = async (payload: StyleSavePayload) => {
    const wasNew = !styles.some((style) => style.id === payload.id)
    const { entry } = await saveStyle(payload)
    // Una tarjeta recién creada queda EN USO: la persona la acaba de armar
    // para usarla. Una editada solo si ya lo estaba — editar un estilo no
    // cambia cuál se usa (origen). El snapshot sale de lo que quedó guardado
    // (con sus secciones, si es de plantilla), no del pedido.
    if (!wasNew && selected?.styleId !== payload.id) return
    onSelect(selectedCustomStyleFrom(entry))
  }

  // Avisos de migración de las gemas de la lista, en su orden.
  const migrationNotices = gemTemplateEnabled
    ? styles.flatMap((style) => {
        const migration = migrations.get(style.id)
        return migration ? [{ style, migration }] : []
      })
    : []
  const editingMigration =
    gemTemplateEnabled && editingStyle
      ? (migrations.get(editingStyle.id) ?? null)
      : null

  return (
    <div className="space-y-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500">
          <Check className="h-4 w-4 text-white" strokeWidth={3} />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-lg font-extrabold leading-tight text-foreground">
            {t('create.style.label')}
          </h3>
          <p className="font-body text-sm leading-snug text-muted-foreground">
            {t('create.customStyles.galleryHint')}
          </p>
        </div>
      </div>

      {isLoading && (
        <p className="py-6 text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {styles.map((style) => (
          <CustomStyleCard
            key={style.id}
            style={style}
            selected={selected?.styleId === style.id}
            disabled={disabled}
            onSelect={() => selectStyle(style)}
            onEdit={() => openEdit(style, false)}
            onGenerateSamples={() => openEdit(style, true)}
            onDelete={() => void removeStyle(style)}
          />
        ))}

        {/* La tarjeta de CREAR es fija: solo crea, nunca se transforma en un
            estilo. MISMA silueta que una tarjeta de estilo (zona 4:3 arriba +
            pie de dos líneas): mide lo mismo esté donde esté, y la grilla
            crece hacia abajo. */}
        <div
          role="button"
          tabIndex={disabled ? undefined : 0}
          onClick={openCreate}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            openCreate()
          }}
          className="group flex cursor-pointer select-none flex-col overflow-hidden rounded-2xl border-2 border-dashed border-border bg-card text-muted-foreground outline-none transition-all hover:border-saffron/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-saffron/50"
        >
          <div className="flex aspect-[4/3] items-center justify-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-current transition-transform group-hover:scale-110">
              <Plus className="h-6 w-6" />
            </span>
          </div>
          <div className="px-3.5 py-2.5 text-left">
            <p className="truncate font-display text-base font-bold text-foreground">
              {t('create.customStyles.createCard')}
            </p>
            <p className="truncate font-body text-xs text-muted-foreground">
              {t('create.customStyles.createCardHint')}
            </p>
          </div>
        </div>
      </div>

      {migrationNotices.map(({ style, migration }) => (
        <GemMigrationNotice
          key={style.id}
          migration={migration}
          named
          onRetry={() => retryGemMigration(style)}
        />
      ))}

      {/* Sin tarjeta elegida el video no sale: se dice acá, junto a la
          galería (origen), además de en la lista de bloqueos del envío. */}
      {!selected && !isLoading && (
        <p className="rounded-xl border-2 border-saffron/60 bg-saffron/10 px-4 py-3 font-body text-sm text-foreground">
          {t('create.customStyles.pickNotice')}
        </p>
      )}

      {editing && (editing.isNew || editingStyle) && (
        <CustomStyleModal
          // Una gema distinta = un borrador distinto: el modal siembra su
          // estado desde `initial` UNA sola vez, así que la clave es el id (y
          // el editor, que cambia cuando una gema vieja termina de migrarse)
          // y no el contenido: una invalidación de la lista con el modal
          // abierto no re-siembra lo tipeado.
          key={`${editing.styleId}:${editorLayoutOf(editing, editingStyle)}`}
          styleId={editing.styleId}
          initial={
            editingStyle ? customStyleDraftFrom(editingStyle) : EMPTY_DRAFT
          }
          isNew={editing.isNew}
          migration={editingMigration}
          onRetryMigration={() => {
            if (editingStyle) retryGemMigration(editingStyle)
          }}
          // Derivadas de la query viva: al terminar de generar, la
          // invalidación refetchea y el modal muestra las muestras solo.
          samples={editingStyle?.samples ?? []}
          saving={saving}
          generateOnOpen={editing.generateOnOpen}
          script={script}
          promptModel={promptModel}
          onSave={save}
          onClose={closeCustomStyleEditor}
        />
      )}
    </div>
  )
}
```

- [ ] **Paso 10: El modal muestra la migración y la respeta**

En `src/modules/videos/components/CustomStyleModal.tsx` (versión de C4c), aplicar estos reemplazos
exactos:

1. Debajo de `import { GemAgentWarnings } from '@/modules/videos/components/GemAgentWarnings'`
   agregar `import { GemMigrationNotice } from '@/modules/videos/components/GemMigrationNotice'`.
2. Reemplazar `import type { CustomStyleDraft } from '@/modules/videos/types/styles'` por:

<!-- prettier-ignore -->
```ts
import type {
  CustomStyleDraft,
  GemMigrationState,
} from '@/modules/videos/types/styles'
```

3. En `CustomStyleModalProps`, antes de
   `  // Contexto para diseñar un personaje nuevo con esta gema desde el selector.` agregar:

<!-- prettier-ignore -->
```ts
  // Migración de ESTA gema vieja a la plantilla (spec §4.4); null = ninguna.
  migration: GemMigrationState | null
  onRetryMigration: () => void
```

4. En la desestructuración de props, reemplazar:

<!-- prettier-ignore -->
```ts
  generateOnOpen,
  script,
```

por:

<!-- prettier-ignore -->
```ts
  generateOnOpen,
  migration,
  onRetryMigration,
  script,
```

5. Debajo de `  const pasting = templateMode && gemDraft.pasting` agregar:

<!-- prettier-ignore -->
```ts
  // Mientras la gema vieja se migra, su editor queda quieto: lo que se
  // escribiera acá chocaría con las secciones que está por guardar la migración.
  const migrating = migration?.status === 'pending'
  const locked = saving || migrating
```

6. En `canGenerate`, reemplazar `    !saving &&` por `    !locked &&`.
7. En `close`, debajo de `    if (samplesJob.running || gemRebuild.pending) return` agregar:

<!-- prettier-ignore -->
```ts
    // Sin cambios posibles durante la migración: se cierra sin guardar.
    if (migrating) {
      onClose()
      return
    }
```

8. En `generate`, reemplazar:

<!-- prettier-ignore -->
```tsx
  const generate = async (imageProvider: ImageProviderId) => {
    if (!hasStyleText) return
```

por:

<!-- prettier-ignore -->
```tsx
  const generate = async (imageProvider: ImageProviderId) => {
    if (!hasStyleText || migrating) return
```

9. Reemplazar:

<!-- prettier-ignore -->
```tsx
            <div className="space-y-4">
              {templateMode && (
                <GemAgentWarnings warnings={gemDraft.warnings} />
              )}

              <StyleCharacterBlock
                value={character}
                disabled={saving}
```

por:

<!-- prettier-ignore -->
```tsx
            <div className="space-y-4">
              {migration && (
                <GemMigrationNotice
                  migration={migration}
                  named={false}
                  onRetry={onRetryMigration}
                />
              )}
              {templateMode && (
                <GemAgentWarnings warnings={gemDraft.warnings} />
              )}

              <StyleCharacterBlock
                value={character}
                disabled={locked}
```

10. En el input del nombre, reemplazar:

<!-- prettier-ignore -->
```tsx
                  maxLength={CUSTOM_STYLE_NAME_LIMIT}
                  disabled={saving}
```

por:

<!-- prettier-ignore -->
```tsx
                  maxLength={CUSTOM_STYLE_NAME_LIMIT}
                  disabled={locked}
```

11. En el textarea del estilo viejo, reemplazar:

<!-- prettier-ignore -->
```tsx
                      maxLength={CUSTOM_STYLE_PROMPT_LIMIT}
                      disabled={saving}
```

por:

<!-- prettier-ignore -->
```tsx
                      maxLength={CUSTOM_STYLE_PROMPT_LIMIT}
                      disabled={locked}
```

12. En el input de planos, reemplazar:

<!-- prettier-ignore -->
```tsx
                      value={shots}
                      disabled={saving}
```

por:

<!-- prettier-ignore -->
```tsx
                      value={shots}
                      disabled={locked}
```

13. En el botón de planos recomendados, reemplazar:

<!-- prettier-ignore -->
```tsx
                      disabled={saving}
                      className="mt-2"
```

por:

<!-- prettier-ignore -->
```tsx
                      disabled={locked}
                      className="mt-2"
```

- [ ] **Paso 11: Crear usa la gema migrada**

En `src/modules/videos/views/Create/Create.tsx`, reemplazar
`import { selectedCustomStyleFrom } from '@/modules/videos/utilities/selectedCustomStyle'` por:

<!-- prettier-ignore -->
```ts
import {
  refreshedCustomStyle,
  selectedCustomStyleFrom,
} from '@/modules/videos/utilities/selectedCustomStyle'
```

y reemplazar:

<!-- prettier-ignore -->
```ts
  const formValue = demoGem
    ? { ...form, customStyle: selectedCustomStyleFrom(demoGem) }
    : form
```

por:

<!-- prettier-ignore -->
```ts
  const chosenStyle = demoGem
    ? selectedCustomStyleFrom(demoGem)
    : form.customStyle
  // Si la gema elegida se migró a la plantilla mientras tanto (spec §4.4), el
  // envío ya sale con sus secciones: el snapshot se refresca desde la lista,
  // también en el render.
  const customStyle = refreshedCustomStyle(chosenStyle, customStyles)
  const formValue =
    customStyle === form.customStyle ? form : { ...form, customStyle }
```

- [ ] **Paso 12: Textos (es, en, pt)**

En cada catálogo, justo después de la línea `    "gemTemplate": {`, insertar:

`public/locales/es.json`:

<!-- prettier-ignore -->
```text
      "migrationPending": "Actualizando tu estilo a la plantilla de Vimo…",
      "migrationPendingNamed": "Actualizando «{{name}}» a la plantilla de Vimo…",
      "migrationFailed": "No pudimos actualizar tu estilo a la plantilla de Vimo. Mientras tanto sigue funcionando como antes.",
      "migrationFailedNamed": "No pudimos actualizar «{{name}}» a la plantilla de Vimo. Mientras tanto sigue funcionando como antes.",
```

`public/locales/en.json`:

<!-- prettier-ignore -->
```text
      "migrationPending": "Updating your style to Vimo's template…",
      "migrationPendingNamed": "Updating “{{name}}” to Vimo's template…",
      "migrationFailed": "We couldn't update your style to Vimo's template. Meanwhile it keeps working as before.",
      "migrationFailedNamed": "We couldn't update “{{name}}” to Vimo's template. Meanwhile it keeps working as before.",
```

`public/locales/pt.json`:

<!-- prettier-ignore -->
```text
      "migrationPending": "Atualizando seu estilo para o template do Vimo…",
      "migrationPendingNamed": "Atualizando «{{name}}» para o template do Vimo…",
      "migrationFailed": "Não conseguimos atualizar seu estilo para o template do Vimo. Enquanto isso, ele continua funcionando como antes.",
      "migrationFailedNamed": "Não conseguimos atualizar «{{name}}» para o template do Vimo. Enquanto isso, ele continua funcionando como antes.",
```

- [ ] **Paso 13: Verificación**

Run:

<!-- prettier-ignore -->
```bash
pnpm exec prettier --write src/modules/videos/types/styles.ts src/modules/videos/utilities/gemMigrations.ts src/modules/videos/utilities/gemTemplate.ts src/modules/videos/utilities/selectedCustomStyle.ts src/modules/videos/hooks/useGemMigrations.ts src/modules/videos/components/GemMigrationNotice.tsx src/modules/videos/components/CustomStyleGallery.tsx src/modules/videos/components/CustomStyleModal.tsx src/modules/videos/views/Create/Create.tsx scripts/test/check-app-gem-migration.mjs public/locales/es.json public/locales/en.json public/locales/pt.json
pnpm exec eslint src/modules/videos/types/styles.ts src/modules/videos/utilities/gemMigrations.ts src/modules/videos/utilities/gemTemplate.ts src/modules/videos/utilities/selectedCustomStyle.ts src/modules/videos/hooks/useGemMigrations.ts src/modules/videos/components/GemMigrationNotice.tsx src/modules/videos/components/CustomStyleGallery.tsx src/modules/videos/components/CustomStyleModal.tsx src/modules/videos/views/Create/Create.tsx
pnpm exec tsc -p tsconfig.app.json --noEmit
node --test scripts/test/check-app-gem-migration.mjs scripts/test/check-app-gem-sections.mjs scripts/test/check-app-gem-rebuild.mjs
node scripts/test/check-locales.mjs
```

Expected: todo en verde; `check-locales` con 4 claves más.

- [ ] **Paso 14: QA manual**

Hacer el paso C (gema vieja) de «QA manual». El éxito de la migración necesita el servidor y el
sidecar de la Ola 1 (Tarea I4 u Ola 3).

- [ ] **Paso 15: Commit (orquestador)**

<!-- prettier-ignore -->
```bash
git add src/modules/videos/types/styles.ts src/modules/videos/utilities/gemMigrations.ts src/modules/videos/utilities/gemTemplate.ts src/modules/videos/utilities/selectedCustomStyle.ts src/modules/videos/hooks/useGemMigrations.ts src/modules/videos/components/GemMigrationNotice.tsx src/modules/videos/components/CustomStyleGallery.tsx src/modules/videos/components/CustomStyleModal.tsx src/modules/videos/views/Create/Create.tsx scripts/test/check-app-gem-migration.mjs public/locales/es.json public/locales/en.json public/locales/pt.json
git commit -F - <<'EOF'
feat(videos): migrate old gems to the template on open or select

Qué: con el interruptor gemTemplate, abrir una gema vieja en el modal o
elegirla en Crear la manda al agente con origin «migracion», una sola vez en
vuelo por gema y una vez por sesión. El texto es su systemPrompt y, si tiene
planos, el bloque «# ALLOWED SHOTS» con el formato del sidecar, para que el
agente los pase a la sección camera; las secciones se guardan con ese texto
como sourcePrompt. Un store fuera de React (createGemMigrations y
useGemMigrations) lleva el estado; GemMigrationNotice muestra «Actualizando
tu estilo a la plantilla de Vimo…» o el fallo con «Reintentar», en la galería
y en el modal. Mientras migra, el editor viejo queda quieto y cerrar no
guarda; al terminar, el modal se vuelve a sembrar por secciones. Crear
refresca en el render el snapshot elegido si su gema ya se migró.

Por qué: spec §4.4. Si la migración falla (sin red, cupo, servidor caído),
la gema sigue funcionando por el camino viejo y el envío de Crear no espera.

Con qué interactúa: rebuildGem (C3), style-save del sidecar (frente A), la
lista de la galería y el formulario de Crear. Textos de la migración en es,
en y pt. Guard nuevo: scripts/test/check-app-gem-migration.mjs.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Tarea C6: payload, muestras y lo que mira el texto de la gema

**Files:**

- Modify: `src/modules/videos/types/styles.ts` (`SampleGenerationOptions` al final)
- Create: `src/modules/videos/utilities/projectCustomStyle.ts`
- Modify: `src/modules/videos/utilities/formPayload.ts`
- Modify: `src/modules/videos/components/CustomStyleCard.tsx`
- Modify: `src/modules/videos/hooks/useStyleSampleGeneration.ts` (entero)
- Modify: `src/modules/videos/components/CustomStyleModal.tsx` (una llamada)
- Modify: `src/modules/videos/components/PromptModelSection.tsx`
- Modify: `src/modules/videos/hooks/useStyleCharacter.ts`
- Test: `scripts/test/check-app-custom-style-payload.mjs`

**Interfaces:**

- Consumes: `selectedCustomStyleFrom`, `gemCharCount`, `hasGemText` (C4a);
  `usePromptModelPreference` (settings, ADR-0022), `usePromptModels`, `usePromptModelBlocks`,
  `resolvePromptModel` (common).
- Produces:
  - `projectCustomStyleFrom(style: SelectedCustomStyle): ProjectCustomStyle`
    (`@/modules/videos/utilities/projectCustomStyle`).
  - `interface SampleGenerationOptions { templateGem: boolean }` (`@/modules/videos/types/styles`).
  - `useStyleSampleGeneration().generate(styleId: string, imageProvider: ImageProviderId, options: SampleGenerationOptions): Promise<void>`.

Cómo lee Crear el modelo de Ajustes hoy (ADR-0022): `usePromptModelPreference()` da
`promptModelDefaults?.modelId`; al enviar, `resolvePromptModel(elegido, models, defaultId,
blockedIds)` lo resuelve contra el catálogo (`usePromptModels`) y los bloqueos (ADR-0028). Las
muestras de una gema de plantilla hacen lo mismo con la preferencia (spec §5.6 y F3); las de una
vieja mandan exactamente el payload de hoy.

- [ ] **Paso 1: Escribir el guard que falla**

Crear `scripts/test/check-app-custom-style-payload.mjs`:

<!-- prettier-ignore -->
```js
// El estilo propio en el proyecto (options.customStyle): una gema vieja viaja
// byte por byte como antes de ADR-0048 y una de plantilla viaja por secciones,
// sin `systemPrompt` ni `shots` (spec §4.2). Decide el dato, no el interruptor.
// Módulos puros de src/ corridos con Node (type stripping), sin bundler.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { projectCustomStyleFrom } from '../../src/modules/videos/utilities/projectCustomStyle.ts'
import { selectedCustomStyleFrom } from '../../src/modules/videos/utilities/selectedCustomStyle.ts'

const OLD_GEM = {
  id: 'st-vieja',
  name: 'Vieja',
  systemPrompt: 'Acuarela editorial con tinta suelta.',
  shots: ['Wide shot', 'Close-up'],
  character: { mode: 'own', defaultCharacterId: 'ana' },
  createdAt: '2026-09-01T00:00:00.000Z',
  samples: [],
}

const TEMPLATE_GEM = {
  id: 'st-plantilla',
  name: 'Plantilla',
  shots: [],
  character: { mode: 'generic' },
  createdAt: '2026-09-30T00:00:00.000Z',
  samples: [],
  sections: {
    visualStyle: 'Acuarela editorial con tinta suelta.',
    character: 'A tall woman with short gray hair. Outfit: a green raincoat.',
    promptEnd: 'soft paper texture',
  },
  templateVersion: 1,
  colorFilter: 'horror-bw',
  sourcePrompt: 'La gema original.',
}

// Cómo armaba el snapshot formPayload.ts antes de ADR-0048 (copia literal).
function legacySnapshot(customStyle) {
  return {
    styleId: customStyle.styleId,
    name: customStyle.name,
    systemPrompt: customStyle.systemPrompt,
    shots: customStyle.shots,
    ...(customStyle.character ? { character: customStyle.character } : {}),
  }
}

test('una gema vieja viaja byte por byte como antes', () => {
  const selected = selectedCustomStyleFrom(OLD_GEM)
  assert.equal(
    JSON.stringify(projectCustomStyleFrom(selected)),
    JSON.stringify(legacySnapshot(selected)),
  )
  const withoutCharacter = selectedCustomStyleFrom({
    ...OLD_GEM,
    character: undefined,
  })
  assert.equal(
    JSON.stringify(projectCustomStyleFrom(withoutCharacter)),
    JSON.stringify(legacySnapshot(withoutCharacter)),
  )
})

test('una gema de plantilla viaja por secciones, sin systemPrompt ni shots', () => {
  const snapshot = projectCustomStyleFrom(selectedCustomStyleFrom(TEMPLATE_GEM))
  assert.deepEqual(snapshot, {
    styleId: 'st-plantilla',
    name: 'Plantilla',
    sections: TEMPLATE_GEM.sections,
    templateVersion: 1,
    colorFilter: 'horror-bw',
    character: { mode: 'generic' },
  })
  for (const field of ['systemPrompt', 'shots', 'sourcePrompt'])
    assert.equal(field in snapshot, false, field)
})

test('sin filtro ni versión guardados no se inventan', () => {
  const snapshot = projectCustomStyleFrom(
    selectedCustomStyleFrom({
      ...TEMPLATE_GEM,
      colorFilter: undefined,
      templateVersion: undefined,
    }),
  )
  assert.equal('colorFilter' in snapshot, false)
  assert.equal('templateVersion' in snapshot, false)
  assert.deepEqual(snapshot.sections, TEMPLATE_GEM.sections)
})
```

- [ ] **Paso 2: Correrlo y verlo fallar**

Run: `node --test scripts/test/check-app-custom-style-payload.mjs`
Expected: FAIL con `ERR_MODULE_NOT_FOUND` (todavía no existe `projectCustomStyle.ts`).

- [ ] **Paso 3: El snapshot del proyecto (puro)**

Crear `src/modules/videos/utilities/projectCustomStyle.ts`:

<!-- prettier-ignore -->
```ts
import type { SelectedCustomStyle } from '@/modules/videos/types/styles'
import type { ProjectCustomStyle } from '@pipeline/types/video-project.ts'

// El estilo elegido como snapshot del proyecto (options.customStyle). Una gema
// de plantilla viaja con sus secciones, su versión y su filtro, sin
// `systemPrompt` ni `shots`: create-video-project exige uno de los dos
// caminos, nunca ambos (spec §4.2). Una vieja viaja EXACTAMENTE como antes de
// ADR-0048 (mismos campos, mismo orden), así el carril verbatim la recibe byte
// por byte. Decide el dato, no el interruptor: una gema de plantilla sigue
// viajando por secciones aunque el interruptor se apague. Puro: lo corre
// scripts/test/check-app-custom-style-payload.mjs.
export function projectCustomStyleFrom(
  style: SelectedCustomStyle,
): ProjectCustomStyle {
  const character = style.character ? { character: style.character } : {}
  if (style.sections)
    return {
      styleId: style.styleId,
      name: style.name,
      sections: style.sections,
      ...(style.templateVersion === undefined
        ? {}
        : { templateVersion: style.templateVersion }),
      ...(style.colorFilter ? { colorFilter: style.colorFilter } : {}),
      ...character,
    }

  return {
    styleId: style.styleId,
    name: style.name,
    systemPrompt: style.systemPrompt,
    shots: style.shots,
    ...character,
  }
}
```

- [ ] **Paso 4: Correr el guard**

Run: `node --test scripts/test/check-app-custom-style-payload.mjs`
Expected: PASS, 3 casos.

- [ ] **Paso 5: `formPayload.ts` usa el snapshot**

En `src/modules/videos/utilities/formPayload.ts`, debajo de
`import { settingsForProvider } from '@/modules/voices/utilities/settingsToWire'` agregar
`import { projectCustomStyleFrom } from '@/modules/videos/utilities/projectCustomStyle'`, y
reemplazar:

<!-- prettier-ignore -->
```ts
  if (usesCustomStyle && form.customStyle) {
    options.customStyle = {
      styleId: form.customStyle.styleId,
      name: form.customStyle.name,
      systemPrompt: form.customStyle.systemPrompt,
      shots: form.customStyle.shots,
      ...(form.customStyle.character
        ? { character: form.customStyle.character }
        : {}),
    }
```

por:

<!-- prettier-ignore -->
```ts
  if (usesCustomStyle && form.customStyle) {
    // Por secciones si la gema es de plantilla; si no, como siempre (ADR-0048).
    options.customStyle = projectCustomStyleFrom(form.customStyle)
```

- [ ] **Paso 6: Muestras con el modelo de Ajustes**

Al final de `src/modules/videos/types/styles.ts` agregar:

<!-- prettier-ignore -->
```ts

// Cómo se piden las muestras de un estilo.
export interface SampleGenerationOptions {
  // Gema de plantilla: sus muestras se escriben con el modelo de Ajustes (spec
  // §5.6). Una vieja sigue por el camino de siempre.
  templateGem: boolean
}
```

Reemplazar entero `src/modules/videos/hooks/useStyleSampleGeneration.ts`:

<!-- prettier-ignore -->
```ts
import { useState } from 'react'
import { usePromptModelBlocks } from '@/modules/common/hooks/usePromptModelBlocks'
import { usePromptModels } from '@/modules/common/hooks/usePromptModels'
import { queryClient } from '@/modules/common/queryClient'
import { scheduleCreditsRefresh } from '@/modules/common/utilities/creditsRefresh'
import { resolvePromptModel } from '@/modules/common/utilities/resolvePromptModel'
import { usePromptModelPreference } from '@/modules/settings/hooks/usePromptModelPreference'
import { videosApi } from '@/modules/videos/api'
import {
  CREATE_ERROR_MESSAGE_KEYS,
  UNKNOWN_CREATE_ERROR_KEY,
  videosQueryKeys,
} from '@/modules/videos/constants'
import type { SampleGenerationOptions } from '@/modules/videos/types/styles'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'
import type { GenerateStyleSamplesPayload } from '@pipeline/types/styles.ts'

export interface SampleGenerationState {
  running: boolean
  // Fase reportada por el sidecar; null = sin job.
  phase: 'prompts' | 'images' | null
  // Progreso por muestra (id → %) durante la fase de imágenes.
  samplePercents: Record<number, number>
  promptPercents: Record<number, number>
  sampleImages: Record<number, string>
  completed: boolean
  errorKey: string | null
}

const INITIAL_STATE: SampleGenerationState = {
  running: false,
  phase: null,
  samplePercents: {},
  promptPercents: {},
  sampleImages: {},
  completed: false,
  errorKey: null,
}

// Job de muestras de un estilo: progreso por muestra vía eventos del Channel
// (reemplazo del polling de 500 ms del origen). Al completar invalida la
// galería — las muestras nuevas ya están en disco — y difiere el refetch del
// saldo del proveedor (también si falló: pudo cobrar alguna muestra).
export function useStyleSampleGeneration() {
  const [state, setState] = useState(INITIAL_STATE)
  // Una gema de plantilla escribe sus muestras con el modelo de Ajustes, como
  // el video (spec §5.6, ADR-0022), resuelto igual que en Crear: uno retirado
  // o bloqueado (ADR-0028) cae a otro del catálogo.
  const { promptModelDefaults } = usePromptModelPreference()
  const { models, defaultId } = usePromptModels()
  const { blockedIds } = usePromptModelBlocks()
  const settingsPromptModel = resolvePromptModel(
    promptModelDefaults?.modelId ?? null,
    models,
    defaultId,
    blockedIds,
  )

  const generate = async (
    styleId: string,
    imageProvider: ImageProviderId,
    { templateGem }: SampleGenerationOptions,
  ) => {
    setState({ ...INITIAL_STATE, running: true })
    // Una gema vieja manda exactamente lo de siempre.
    const payload: GenerateStyleSamplesPayload = {
      styleId,
      imageProvider,
      ...(templateGem && settingsPromptModel
        ? { promptModel: settingsPromptModel }
        : {}),
    }
    try {
      await videosApi.generateStyleSamples(payload, (event) => {
        if (event.type === 'progress') {
          const detail = (event.detail ?? {}) as {
            phase?: 'prompts' | 'images'
            sampleId?: number
            status?: string
            path?: string
            mtimeMs?: number
          }
          setState((previous) => ({
            ...previous,
            phase: detail.phase ?? previous.phase,
            promptPercents:
              detail.phase === 'prompts' && detail.sampleId !== undefined
                ? {
                    ...previous.promptPercents,
                    [detail.sampleId]: event.percent ?? 0,
                  }
                : previous.promptPercents,
            sampleImages:
              detail.status === 'completed' &&
              detail.path &&
              detail.sampleId !== undefined
                ? {
                    ...previous.sampleImages,
                    [detail.sampleId]: videosApi.imageSource(
                      detail.path,
                      detail.mtimeMs,
                    ),
                  }
                : previous.sampleImages,
            samplePercents:
              detail.phase === 'images' && detail.sampleId !== undefined
                ? {
                    ...previous.samplePercents,
                    [detail.sampleId]: event.percent ?? 0,
                  }
                : previous.samplePercents,
          }))
          return
        }
        if (event.type === 'job-completed') {
          setState((previous) => ({
            ...previous,
            running: false,
            phase: null,
            completed: true,
          }))
          void queryClient.invalidateQueries({
            queryKey: videosQueryKeys.customStyles,
          })
          scheduleCreditsRefresh()
          return
        }
        if (event.type === 'job-failed') {
          void queryClient.invalidateQueries({
            queryKey: videosQueryKeys.customStyles,
          })
          setState((previous) => ({
            ...previous,
            running: false,
            phase: null,
            errorKey:
              CREATE_ERROR_MESSAGE_KEYS[event.code] ?? UNKNOWN_CREATE_ERROR_KEY,
          }))
          scheduleCreditsRefresh()
        }
      })
    } catch (error) {
      setState((previous) => ({
        ...previous,
        running: false,
        phase: null,
        errorKey: videosApi.errorMessageKey(error),
      }))
      scheduleCreditsRefresh()
    }
  }

  return { ...state, generate }
}
```

En `src/modules/videos/components/CustomStyleModal.tsx`, reemplazar
`    await samplesJob.generate(styleId, imageProvider)` por:

<!-- prettier-ignore -->
```ts
    await samplesJob.generate(styleId, imageProvider, {
      templateGem: templateMode,
    })
```

- [ ] **Paso 7: La tarjeta cuenta las secciones**

En `src/modules/videos/components/CustomStyleCard.tsx`, debajo de
`import { useSampleCarousel } from '@/modules/videos/hooks/useSampleCarousel'` agregar
`import { gemCharCount } from '@/modules/videos/utilities/gemTemplate'`, y reemplazar lo que dejó
la Tarea 0:

<!-- prettier-ignore -->
```tsx
          {t('create.customStyles.charsCount', {
            chars: (style.systemPrompt ?? '').length.toLocaleString(),
          })}
```

por:

<!-- prettier-ignore -->
```tsx
          {t('create.customStyles.charsCount', {
            chars: gemCharCount(style).toLocaleString(),
          })}
```

- [ ] **Paso 8: El costo y el chip miran la gema por secciones**

En `src/modules/videos/components/PromptModelSection.tsx`, debajo de
`import { styleCharacterModeOf } from '@/modules/videos/utilities/formPayload'` agregar
`import { gemCharCount } from '@/modules/videos/utilities/gemTemplate'`, y reemplazar:

<!-- prettier-ignore -->
```ts
  const gemChars = value.customStyle?.systemPrompt.trim().length ?? 0
  // La fase del personaje solo corre cuando la gema lo diseña (genérico); con
  // personaje propio o sin personaje no hay llamada que cobrar.
  const withCharacterPhase = styleCharacterModeOf(value) === 'generic'
```

por:

<!-- prettier-ignore -->
```ts
  const gemChars = value.customStyle ? gemCharCount(value.customStyle) : 0
  // La fase del personaje solo corre cuando la gema lo diseña (genérico) y no
  // trae su personaje escrito en la sección `character` (ADR-0048); con
  // personaje propio o sin personaje tampoco hay llamada que cobrar.
  const withCharacterPhase =
    styleCharacterModeOf(value) === 'generic' &&
    !value.customStyle?.sections?.character
```

En `src/modules/videos/hooks/useStyleCharacter.ts`, debajo de
`import { styleCharacterModeOf } from '@/modules/videos/utilities/formPayload'` agregar
`import { hasGemText } from '@/modules/videos/utilities/gemTemplate'`, y reemplazar:

<!-- prettier-ignore -->
```ts
    canEditStyle:
      mode !== null && Boolean(form.customStyle?.systemPrompt.trim()),
```

por:

<!-- prettier-ignore -->
```ts
    // Texto de la gema: el de una vieja o el estilo visual de una de plantilla.
    canEditStyle:
      mode !== null &&
      form.customStyle !== null &&
      hasGemText(form.customStyle),
```

- [ ] **Paso 9: Verificación**

Run:

<!-- prettier-ignore -->
```bash
pnpm exec prettier --write src/modules/videos/types/styles.ts src/modules/videos/utilities/projectCustomStyle.ts src/modules/videos/utilities/formPayload.ts src/modules/videos/components/CustomStyleCard.tsx src/modules/videos/hooks/useStyleSampleGeneration.ts src/modules/videos/components/CustomStyleModal.tsx src/modules/videos/components/PromptModelSection.tsx src/modules/videos/hooks/useStyleCharacter.ts scripts/test/check-app-custom-style-payload.mjs
pnpm exec eslint src/modules/videos/types/styles.ts src/modules/videos/utilities/projectCustomStyle.ts src/modules/videos/utilities/formPayload.ts src/modules/videos/components/CustomStyleCard.tsx src/modules/videos/hooks/useStyleSampleGeneration.ts src/modules/videos/components/CustomStyleModal.tsx src/modules/videos/components/PromptModelSection.tsx src/modules/videos/hooks/useStyleCharacter.ts
pnpm exec tsc -p tsconfig.app.json --noEmit
node --test scripts/test/check-app-access-flags.mjs scripts/test/check-app-vimo-server.mjs scripts/test/check-app-gem-rebuild.mjs scripts/test/check-app-gem-sections.mjs scripts/test/check-app-gem-migration.mjs scripts/test/check-app-custom-style-payload.mjs
node scripts/test/check-locales.mjs
grep -rn "systemPrompt" src/modules/videos --include="*.ts*"
```

Expected: todo en verde (61 casos en los 6 guards); `check-locales` sin claves nuevas. El grep
solo muestra usos de una gema vieja o de su borrador: `types/styles.ts`, `selectedCustomStyle.ts`,
`projectCustomStyle.ts`, `gemTemplate.ts`, `gemMigrations.ts`, `useGemMigrations.ts`, el borrador
vacío de `CustomStyleGallery.tsx`, el editor viejo de `CustomStyleModal.tsx` y el contexto de
estilo de `CharacterSection.tsx` (hasta C6b).

- [ ] **Paso 10: QA manual**

Hacer el paso D de «QA manual» (envío con una gema de plantilla y `promptModel` en las muestras);
necesita el sidecar de la Ola 1.

- [ ] **Paso 11: Commit (orquestador)**

<!-- prettier-ignore -->
```bash
git add src/modules/videos/types/styles.ts src/modules/videos/utilities/projectCustomStyle.ts src/modules/videos/utilities/formPayload.ts src/modules/videos/components/CustomStyleCard.tsx src/modules/videos/hooks/useStyleSampleGeneration.ts src/modules/videos/components/CustomStyleModal.tsx src/modules/videos/components/PromptModelSection.tsx src/modules/videos/hooks/useStyleCharacter.ts scripts/test/check-app-custom-style-payload.mjs
git commit -F - <<'EOF'
feat(videos): send template gems by sections in the project payload

Qué: projectCustomStyleFrom arma options.customStyle: una gema de plantilla
viaja con sections, templateVersion, colorFilter y character, sin
systemPrompt ni shots; una vieja, byte por byte como antes. La tarjeta
cuenta los caracteres de las secciones, las muestras de una gema de
plantilla se escriben con el modelo de Ajustes (promptModel), el simulador
de costo cuenta las secciones y no cobra la fase de personaje si la gema
trae su character, y el chip de personaje reconoce el estilo visual de una
gema de plantilla como texto de la gema.

Por qué: cierra la Entrega 1 en la app (spec §4.2, §5.6 y F3): sin esto una
gema de plantilla no viaja al proyecto ni a sus muestras.

Con qué interactúa: create-video-project y generate-style-samples del
sidecar (frente A), usePromptModelPreference de settings (ADR-0022) y los
bloqueos de modelos (ADR-0028). Guard nuevo:
scripts/test/check-app-custom-style-payload.mjs.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Tarea C6b: «Crear personaje con mi estilo» con una gema de plantilla

Depende de la sub-tarea A8c del plan del sidecar (`DesignStyleCharacterPayload` con `gem?` o
`sections?`, excluyentes): se ejecuta después de que el orquestador commitee A8c. Hasta entonces,
con una gema de plantilla el modal del estilo no ofrece diseñar el personaje con la gema, y Crear
lo ofrece pero el modal de personajes usa el experto de la casa (la gema no tiene texto que mandar).

**Files:**

- Modify: `src/modules/characters/types/characters.ts` (`CharacterStyleContext` y `StyleDesignGem`)
- Create: `src/modules/characters/utilities/styleDesignGem.ts`
- Modify: `src/modules/characters/components/CharacterModal.tsx`
- Modify: `src/modules/videos/types/styles.ts` (`StyleContextGem` al final)
- Modify: `src/modules/videos/utilities/gemTemplate.ts` (import y `styleContextGemOf` al final)
- Modify: `src/modules/videos/components/CharacterSection.tsx`
- Modify: `src/modules/videos/components/CustomStyleModal.tsx` (import y contexto del selector)
- Test: `scripts/test/check-app-style-character-gem.mjs`

**Interfaces:**

- Consumes: `DesignStyleCharacterPayload` con `gem?: string` y `sections?: GemSections` (A8c del
  sidecar); `cleanGemSections` y `GemTextSource` (C3 y C4a).
- Produces:
  - `interface CharacterStyleContext { styleId: string; gem?: string; sections?: GemSections; script: string; promptModel?: string }`
    y `type StyleDesignGem = Pick<DesignStyleCharacterPayload, 'gem' | 'sections'>`
    (`@/modules/characters/types/characters`).
  - `styleDesignGemOf(context: CharacterStyleContext | undefined): StyleDesignGem | null`
    (`@/modules/characters/utilities/styleDesignGem`).
  - `type StyleContextGem = { gem: string } | { sections: GemSections }`
    (`@/modules/videos/types/styles`) y `styleContextGemOf(gem: GemTextSource): StyleContextGem`
    (`@/modules/videos/utilities/gemTemplate`).

Crear y el modal del estilo pasan al selector de personajes el contexto de «Mi estilo» con la gema
de plantilla por secciones; el sidecar la pasa a texto sin su sección `character` (ahí se diseña
otro personaje, el de la persona). `videos` no importa nada nuevo de `characters`: arma el contexto
con su propio tipo, que TypeScript acepta por forma como `CharacterStyleContext` en
`CharacterPickerModal` (la excepción de ADR-0020 que ya existe).

- [ ] **Paso 0: Confirmar que A8c está commiteada**

Run: `grep -n -A6 "export interface DesignStyleCharacterPayload" pipeline/types/styles.ts`
Expected: aparecen `gem?: string` y `sections?: GemSections`. Si dice `gem: string`, A8c todavía no
está: frenar y avisar al orquestador.

- [ ] **Paso 1: Escribir el guard que falla**

Crear `scripts/test/check-app-style-character-gem.mjs`:

<!-- prettier-ignore -->
```js
// «Crear personaje con mi estilo» con una gema de plantilla (ADR-0048): la
// gema en uso viaja a design-style-character por secciones (el sidecar la pasa
// a texto sin su sección `character`) y una vieja como su texto, nunca las
// dos. Módulos puros de src/ corridos con Node (type stripping), sin bundler.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { styleDesignGemOf } from '../../src/modules/characters/utilities/styleDesignGem.ts'
import { styleContextGemOf } from '../../src/modules/videos/utilities/gemTemplate.ts'

const OLD_GEM = { systemPrompt: '  Acuarela editorial con tinta suelta.  ' }

const TEMPLATE_GEM = {
  systemPrompt: '',
  sections: {
    visualStyle: ' Acuarela editorial con tinta suelta. ',
    character: 'A tall woman with short gray hair. Outfit: a green raincoat.',
    camera: '   ',
  },
}

const CLEAN_SECTIONS = {
  visualStyle: 'Acuarela editorial con tinta suelta.',
  character: 'A tall woman with short gray hair. Outfit: a green raincoat.',
}

// El contexto que arma Crear o el modal del estilo para el selector.
function styleContext(gem) {
  return {
    styleId: 'st-1',
    script: 'Una historia corta para probar el diseño.',
    ...gem,
  }
}

test('una gema vieja viaja como su texto, sin secciones', () => {
  const gem = styleContextGemOf(OLD_GEM)
  assert.deepEqual(gem, { gem: OLD_GEM.systemPrompt })
  assert.equal('sections' in gem, false)
})

test('una gema de plantilla viaja por secciones limpias, sin texto', () => {
  const gem = styleContextGemOf(TEMPLATE_GEM)
  assert.deepEqual(gem, { sections: CLEAN_SECTIONS })
  assert.equal('gem' in gem, false)
})

test('el pedido lleva exactamente una de las dos', () => {
  assert.deepEqual(styleDesignGemOf(styleContext(styleContextGemOf(OLD_GEM))), {
    gem: 'Acuarela editorial con tinta suelta.',
  })
  assert.deepEqual(
    styleDesignGemOf(styleContext(styleContextGemOf(TEMPLATE_GEM))),
    { sections: CLEAN_SECTIONS },
  )
  // Un contexto con las dos no debería existir; si llega, van las secciones
  // (el sidecar rechaza las dos a la vez).
  const both = styleContext({
    gem: 'Acuarela.',
    sections: { visualStyle: 'Acuarela.' },
  })
  assert.deepEqual(styleDesignGemOf(both), {
    sections: { visualStyle: 'Acuarela.' },
  })
})

test('sin gema que diseñe, el modal usa el experto de la casa', () => {
  assert.equal(styleDesignGemOf(undefined), null)
  assert.equal(styleDesignGemOf(styleContext({})), null)
  assert.equal(styleDesignGemOf(styleContext({ gem: '   ' })), null)
  assert.equal(
    styleDesignGemOf(styleContext({ sections: { visualStyle: '  ' } })),
    null,
  )
})
```

- [ ] **Paso 2: Correrlo y verlo fallar**

Run: `node --test scripts/test/check-app-style-character-gem.mjs`
Expected: FAIL con `ERR_MODULE_NOT_FOUND` (todavía no existe `styleDesignGem.ts`).

- [ ] **Paso 3: El contexto de estilo acepta secciones**

En `src/modules/characters/types/characters.ts`, reemplazar:

<!-- prettier-ignore -->
```ts
import type { CharacterSummary } from '@pipeline/types/characters.ts'
```

por:

<!-- prettier-ignore -->
```ts
import type { CharacterSummary } from '@pipeline/types/characters.ts'
import type {
  DesignStyleCharacterPayload,
  GemSections,
} from '@pipeline/types/styles.ts'
```

y reemplazar:

<!-- prettier-ignore -->
```ts
// Contexto de «Mi estilo» cuando el modal se abre desde Create: con gema y
// guion, la ficha la diseña el estilo del usuario (design-style-character) y
// el preview arranca con ese estilo elegido (`styleId` es el id de galería).
export interface CharacterStyleContext {
  styleId: string
  gem: string
  script: string
  promptModel?: string
}
```

por:

<!-- prettier-ignore -->
```ts
// Contexto de «Mi estilo» cuando el modal se abre desde Create: con gema y
// guion, la ficha la diseña el estilo del usuario (design-style-character) y
// el preview arranca con ese estilo elegido (`styleId` es el id de galería).
// La gema viaja como texto (`gem`, una vieja) o por secciones (`sections`,
// una de plantilla, ADR-0048), nunca las dos.
export interface CharacterStyleContext {
  styleId: string
  gem?: string
  sections?: GemSections
  script: string
  promptModel?: string
}

// La gema como la pide design-style-character: exactamente una de las dos.
export type StyleDesignGem = Pick<
  DesignStyleCharacterPayload,
  'gem' | 'sections'
>
```

- [ ] **Paso 4: La gema del pedido (puro)**

Crear `src/modules/characters/utilities/styleDesignGem.ts`:

<!-- prettier-ignore -->
```ts
import type {
  CharacterStyleContext,
  StyleDesignGem,
} from '@/modules/characters/types/characters'

// La gema del contexto de «Mi estilo» tal como la pide design-style-character
// (ADR-0020, ADR-0048): una de plantilla por secciones (el sidecar las pasa a
// texto sin su sección `character`) o una vieja como texto, nunca las dos: si
// un contexto trajera las dos, van las secciones. null = no hay gema que
// diseñe y el modal usa el experto de la casa. Puro: lo corre
// scripts/test/check-app-style-character-gem.mjs con Node.
export function styleDesignGemOf(
  context: CharacterStyleContext | undefined,
): StyleDesignGem | null {
  if (!context) return null
  if (context.sections) {
    if (!context.sections.visualStyle.trim()) return null
    return { sections: context.sections }
  }

  const gem = context.gem?.trim()
  if (!gem) return null
  return { gem }
}
```

- [ ] **Paso 5: La gema en uso, del lado de `videos` (puro)**

Al final de `src/modules/videos/types/styles.ts` agregar:

<!-- prettier-ignore -->
```ts

// La gema en uso como contexto de «Crear personaje con mi estilo»: una vieja
// como texto, una de plantilla por secciones (ADR-0048). Nunca las dos.
export type StyleContextGem = { gem: string } | { sections: GemSections }
```

En `src/modules/videos/utilities/gemTemplate.ts`, reemplazar:

<!-- prettier-ignore -->
```ts
import type {
  GemTextSource,
  TemplateStyleDraft,
} from '@/modules/videos/types/styles'
```

por:

<!-- prettier-ignore -->
```ts
import type {
  GemTextSource,
  StyleContextGem,
  TemplateStyleDraft,
} from '@/modules/videos/types/styles'
```

y al final del archivo agregar:

<!-- prettier-ignore -->
```ts

/**
 * La gema en uso como contexto de «Crear personaje con mi estilo»
 * (design-style-character, ADR-0048): una de plantilla viaja por secciones,
 * limpias, y el sidecar la pasa a texto sin su sección `character` (ahí se
 * diseña OTRO personaje, el de la persona); una vieja viaja como su texto.
 * Nunca las dos.
 */
export function styleContextGemOf(gem: GemTextSource): StyleContextGem {
  if (gem.sections) return { sections: cleanGemSections(gem.sections) }
  return { gem: gem.systemPrompt ?? '' }
}
```

- [ ] **Paso 6: Correr el guard**

Run: `node --test scripts/test/check-app-style-character-gem.mjs`
Expected: PASS, 4 casos.

- [ ] **Paso 7: El modal de personajes manda texto o secciones**

En `src/modules/characters/components/CharacterModal.tsx`, debajo de
`import { previewShortfallLine } from '@/modules/characters/utilities/previewShortfallLine'` agregar
`import { styleDesignGemOf } from '@/modules/characters/utilities/styleDesignGem'`; reemplazar:

<!-- prettier-ignore -->
```ts
  const withStyle = Boolean(styleContext?.gem.trim()) && withScript
```

por:

<!-- prettier-ignore -->
```ts
  // La gema que diseña al protagonista: una vieja como texto o una de
  // plantilla por secciones (ADR-0048). null = el experto de la casa.
  const styleGem = styleDesignGemOf(styleContext)
  const withStyle = styleGem !== null && withScript
```

y reemplazar:

<!-- prettier-ignore -->
```ts
      ? await designWithStyle({
          gem: styleContext!.gem.trim(),
          script: styleContext!.script.trim(),
```

por:

<!-- prettier-ignore -->
```ts
      ? await designWithStyle({
          ...styleGem,
          script: styleContext!.script.trim(),
```

- [ ] **Paso 8: Crear y el modal del estilo pasan la gema por secciones**

En `src/modules/videos/components/CharacterSection.tsx`, debajo de
`} from '@/modules/videos/utilities/findStylePreview'` agregar
`import { styleContextGemOf } from '@/modules/videos/utilities/gemTemplate'`, y reemplazar:

<!-- prettier-ignore -->
```tsx
                  gem: value.customStyle.systemPrompt,
```

por:

<!-- prettier-ignore -->
```tsx
                  // Una gema de plantilla viaja por secciones: el sidecar la
                  // pasa a texto sin su sección de personaje (ADR-0048).
                  ...styleContextGemOf(value.customStyle),
```

En `src/modules/videos/components/CustomStyleModal.tsx`, reemplazar:

<!-- prettier-ignore -->
```tsx
import {
  hasGemText,
  templateStyleSavePayload,
} from '@/modules/videos/utilities/gemTemplate'
```

por:

<!-- prettier-ignore -->
```tsx
import {
  hasGemText,
  styleContextGemOf,
  templateStyleSavePayload,
} from '@/modules/videos/utilities/gemTemplate'
```

y reemplazar:

<!-- prettier-ignore -->
```tsx
          styleContext={
            // Solo una gema vieja diseña el personaje nuevo: manda su texto.
            hasStyleText && !templateMode
              ? {
                  styleId,
                  gem: systemPrompt,
                  script,
                  ...(promptModel ? { promptModel } : {}),
                }
              : undefined
          }
```

por:

<!-- prettier-ignore -->
```tsx
          styleContext={
            hasStyleText
              ? {
                  styleId,
                  // Una gema de plantilla viaja por secciones: el sidecar la
                  // pasa a texto sin su sección de personaje (ADR-0048).
                  ...styleContextGemOf(
                    templateMode
                      ? { sections: gemDraft.sections }
                      : { systemPrompt },
                  ),
                  script,
                  ...(promptModel ? { promptModel } : {}),
                }
              : undefined
          }
```

- [ ] **Paso 9: Verificación**

Run:

<!-- prettier-ignore -->
```bash
pnpm exec prettier --write src/modules/characters/types/characters.ts src/modules/characters/utilities/styleDesignGem.ts src/modules/characters/components/CharacterModal.tsx src/modules/videos/types/styles.ts src/modules/videos/utilities/gemTemplate.ts src/modules/videos/components/CharacterSection.tsx src/modules/videos/components/CustomStyleModal.tsx scripts/test/check-app-style-character-gem.mjs
pnpm exec eslint src/modules/characters/types/characters.ts src/modules/characters/utilities/styleDesignGem.ts src/modules/characters/components/CharacterModal.tsx src/modules/videos/types/styles.ts src/modules/videos/utilities/gemTemplate.ts src/modules/videos/components/CharacterSection.tsx src/modules/videos/components/CustomStyleModal.tsx
pnpm exec tsc -p tsconfig.app.json --noEmit
node --test scripts/test/check-app-access-flags.mjs scripts/test/check-app-vimo-server.mjs scripts/test/check-app-gem-rebuild.mjs scripts/test/check-app-gem-sections.mjs scripts/test/check-app-gem-migration.mjs scripts/test/check-app-custom-style-payload.mjs scripts/test/check-app-style-character-gem.mjs
node scripts/test/check-locales.mjs
grep -rn "styleContext?.gem\|gem: value.customStyle.systemPrompt\|gemContextText" src
```

Expected: todo en verde (65 casos en los 7 guards); `check-locales` sin claves nuevas; el grep sin
resultados.

- [ ] **Paso 10: QA manual**

Hacer los pasos D (el selector de personajes) y, con claves, E («Crear personaje con mi estilo») de
«QA manual»; necesitan el sidecar de la Ola 1 con A8c.

- [ ] **Paso 11: Commit (orquestador)**

<!-- prettier-ignore -->
```bash
git add src/modules/characters/types/characters.ts src/modules/characters/utilities/styleDesignGem.ts src/modules/characters/components/CharacterModal.tsx src/modules/videos/types/styles.ts src/modules/videos/utilities/gemTemplate.ts src/modules/videos/components/CharacterSection.tsx src/modules/videos/components/CustomStyleModal.tsx scripts/test/check-app-style-character-gem.mjs
git commit -F - <<'EOF'
feat(characters): design style characters from template gem sections

Qué: el contexto de «Mi estilo» del selector de personajes
(CharacterStyleContext) lleva la gema como texto (gem, una vieja) o por
secciones (sections, una de plantilla), nunca las dos. CharacterModal arma el
pedido a design-style-character con styleDesignGemOf, que manda exactamente
una de las dos o, sin gema, deja al experto de la casa. Crear
(CharacterSection) y el modal del estilo arman ese contexto con
styleContextGemOf: las secciones limpias de una gema de plantilla o el texto
de una vieja.

Por qué: una gema de plantilla no tiene systemPrompt y la app no arma su
texto (el marco es del sidecar): sin esto, «Crear personaje con mi estilo»
con una gema de plantilla caía al experto de la casa.

Con qué interactúa: design-style-character con sections (sub-tarea A8c del
plan del sidecar, que pasa las secciones a texto sin la sección character) y
el selector de personajes de videos (excepción de ADR-0020, sin imports
nuevos entre módulos). Guard nuevo:
scripts/test/check-app-style-character-gem.mjs.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

## QA manual

Para el orquestador (Tarea I4) y el dueño. Sin claves, en `pnpm tauri dev`.

**Encender el interruptor sin servidor.** Iniciar sesión con red. En el inspector del webview
(clic derecho → Inspeccionar → Consola) correr, con el correo de la sesión:

<!-- prettier-ignore -->
```js
localStorage.setItem('vimo:demo:access:v1', JSON.stringify({ email: '<correo de la sesión>', demo: false, admin: true, features: { gemTemplate: true, newCatalog: false } }))
```

Cortar la red y recargar (Cmd+R): el veredicto `offline` recupera `gemTemplate: true`. Con el
servidor desplegado en `admins` y un correo admin, no hace falta.

- **A. Sin interruptor (antes del truco):** «Crear estilo» y una gema vieja abren el modal de
  siempre (caja «El estilo», «Planos permitidos», «Listo»); editar y cerrar guarda como hoy.
- **B. Paso de pegado, sin red:** «Crear estilo» abre «Pegá tu gema»; sin texto el botón está
  deshabilitado; pegar y «Preparar con IA» → error de red traducido, el texto sigue en la caja y
  el botón dice «Reintentar»; un doble clic rápido deja un solo pedido en la pestaña Red; cerrar
  en este paso no crea ninguna tarjeta.
- **C. Gema vieja con el interruptor, sin red:** abrirla → «Actualizando tu estilo a la plantilla
  de Vimo…» y después el fallo con «Reintentar»; el editor viejo vuelve a ser usable; elegirla en
  Crear → el aviso con su nombre en la galería; cerrar y reabrir no manda otro pedido; generar un
  video con ella sale por el camino viejo.
- **D. Gema de plantilla (con el sidecar de la Ola 1):** crearla con el harness:

  <!-- prettier-ignore -->
  ```bash
  pnpm pipeline:harness style-save --root "<carpeta raíz de Ajustes>" --payload '{"id":"st-qa-plantilla","name":"QA plantilla","sections":{"visualStyle":"Ilustración editorial en acuarela, tinta suelta, papel texturado.","character":"Hombre de 40 años, pelo canoso. Outfit: saco azul.","promptStart":"Editorial watercolor illustration,"},"templateVersion":1,"colorFilter":"fantasy"}'
  ```

  La tarjeta cuenta los caracteres de las secciones. «Ver y editar»: `visualStyle` abierta, las
  vacías como «Agregar sección», contadores, aviso amarillo en «Personaje del estilo» (está en
  español), sin «Planos permitidos», filtro en «Fantasía». Editar una sección y cerrar → al
  reabrir quedó, sin pedidos al agente. «Pegar gema nueva» con algo sin guardar → confirmación
  nativa; «Volver a las secciones» no cambia nada. Elegirla en Crear y generar: `project.json`
  guarda `options.customStyle.sections` sin `systemPrompt`. «Generar 4 muestras»: el pedido a
  `generate-style-samples` lleva `promptModel`. Con A8c y C6b, el selector de personajes (desde
  Crear con esta gema, o desde «Mi personaje» en su modal) ofrece «Crear personaje con mi estilo».

- **E. Con el servidor y claves (Ola 3):** crear una gema real (secciones y avisos del agente),
  migrar una vieja (el modal pasa solo a las cajas), y el cupo agotado muestra la hora en que
  vuelve. Una gema vieja con «Planos permitidos» queda con esos planos en «Encuadres y cámara».
  «Crear personaje con mi estilo» con una gema de plantilla diseña la ficha con su estilo, sin
  copiar su sección «Personaje del estilo».
- **F. Vuelta atrás:** borrar la clave del truco y volver con red (o el servidor en `off`): la
  gema de plantilla sigue abriendo por secciones sin «Pegar gema nueva»; «Crear estilo» vuelve al
  modal de siempre; las gemas viejas no se migran.

## Problemas del contrato

1. **Valores de `pipeline/types/styles.ts` en `src/`.** `GEM_SECTION_KEYS`, `GEM_TEMPLATE_VERSION`
   y `COLOR_FILTER_IDS` son valores y `src/` solo importa tipos de `pipeline/` (ADR-0010; Vite no
   resuelve `@pipeline` en runtime). Se espejan en `videos/utilities/gemTemplate.ts` con una
   anotación `typeof` que no compila si divergen. Propuesta: dejar el contrato como está y
   nombrarlo en la ADR-0048.
2. **`AccessFeatures` vive en `auth`.** Ningún otro módulo puede importar ese tipo sin romper la
   regla de dependencias; por eso `common` declara solo los nombres (`AccessFeatureName`) y la
   lectura va por `useAccessFeature`. Los nombres quedan en dos lugares; si divergen, falla la
   compilación de quien pide uno nuevo o se lee apagado. Propuesta: aceptarlo; si el dueño
   prefiere una sola declaración, mover `AccessFeatures` a `common/types/accessFeatures.ts` (cambia
   el contrato congelado).
3. **Personajes con una gema de plantilla: resuelto con el sidecar, con una dependencia entre
   frentes.** El preview de un personaje con una gema de la galería lo arma el sidecar desde las
   secciones (A8b) y «Crear personaje con mi estilo» recibe `sections` (A8c); la app lo consume en
   C6b y nunca compone el texto de la gema. C6b es la única tarea de este frente que depende de
   otro frente después de la Ola 0: se ejecuta después del commit de A8c. Si A8c no se aprobara,
   C6b no se hace y, con una gema de plantilla, Crear ofrece «Crear personaje con mi estilo» pero
   el modal de personajes usa el experto de la casa, sin error.
4. **Planos de las gemas viejas al migrar (resuelto por el coordinador).** `style-save` con
   secciones guarda `shots: []` (P5 del plan del sidecar), así que los planos viajan en el texto
   que va al agente: el `systemPrompt` más el bloque `# ALLOWED SHOTS` del sidecar, copiado tal
   cual (C5, `migrationRebuildText`), y el agente los pasa a `camera`. El `sourcePrompt` guarda ese
   mismo texto: es «el texto que se mandó al agente» de la spec §4.2 y conserva la lista de planos
   de respaldo. Decisión de este plan, a confirmar: si con los planos la gema pasara los 30 000
   caracteres, va sin ellos, porque el agente respondería `texto-invalido` en cada intento.
5. **`suggestions` del agente sin uso en la E1.** El modal no aplica `suggestions.characterMode`:
   el bloque de personaje arranca en genérico, como hoy. Queda para el catálogo (E2 y E3).
6. **Ajustes del coordinador aplicados.** El mapa de C3 cubre `pedido-invalido`,
   `funcion-desactivada` y `error-interno`, y la sección `character` usa la oración «Outfit: …»
   (ayuda de la sección, heurística y guards). Si el servidor apaga el interruptor antes de que la
   app re-verifique (el veredicto se renueva cada 5 minutos al navegar), el agente responde
   `funcion-desactivada` y el modal lo dice. `style-save` con secciones lleva siempre
   `templateVersion` (P2 del plan del sidecar): el borrador del modal guarda el que devolvió el
   agente, o el guardado si no se reconstruyó (C4a y C4b), y la migración el de la respuesta (C5).
   «Crear personaje con mi estilo» manda `sections` con una gema de plantilla (C6b).

## Notas para el orquestador

- Guards nuevos para `scripts/test/README.md` y la Tarea I1: `check-app-access-flags.mjs`,
  `check-app-vimo-server.mjs` (empaqueta el cliente real con esbuild y levanta un servidor HTTP
  local), `check-app-gem-rebuild.mjs`, `check-app-gem-sections.mjs`, `check-app-gem-migration.mjs`,
  `check-app-custom-style-payload.mjs` y `check-app-style-character-gem.mjs`. Corren con
  `node --test` desde la raíz del repo: 65 casos.
- C6b va después del commit de A8c (plan del sidecar); el resto del frente no depende de otro
  frente.
- La ADR-0006 la tocan C1 y C2 (dos enmiendas en la sección nueva «Enmiendas» y los greps).
- El modal se revisa con `git diff -w` (C4c reindenta el editor viejo).
- Entre C4 y C6, una gema de plantilla todavía no viaja bien en Crear (el payload llega en C6): no
  se prueba el envío hasta C6. «Crear personaje con mi estilo» con una gema de plantilla llega en
  C6b.
- Cada bloque de código lleva `<!-- prettier-ignore -->`: `pnpm format:check` pasa sobre este plan
  y un `prettier --write` no reformatea los bloques de los reemplazos exactos.
- Claves nuevas en los catálogos: 56 (13 en C3, 17 en C4a, 18 en C4b, 4 en C4c y 4 en C5), todas
  en `create.gemTemplate`.
