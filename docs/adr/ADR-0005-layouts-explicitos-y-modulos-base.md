# ADR-0005 — Layouts explícitos (Authenticated/Guest) y módulos base maquetados

- **Estado:** Aceptada
- **Fecha:** 2026-08-12
- **Área:** app
- **Enmendada:** 2026-10-08, por la
  [ADR-0056](ADR-0056-layout-propio-del-editor-a-pantalla-completa.md) (todavía Propuesta): un tercer
  layout, `EditorLayout`, para el editor a pantalla completa. El resto sigue vigente.
- **Enmendada:** 2026-10-11, decisión del dueño: una segunda excepción acotada a la regla de
  dependencias para `videos` (ver «Enmienda del 2026-10-11» al final).

## Problema

En la app original el "layout de invitado" estaba implícito: `GateDeAcceso` (un guard
de router) devolvía pantallas full-screen distintas según el estado de acceso, y el
único layout real (`ContenedorPrincipal`) envolvía todo lo demás. Al migrar había que
decidir cómo estructurar los cascarones antes de traer la primera vista, con dos
restricciones:

- Paridad visual con la app original (gradient hero, sidebar colapsable, navbar).
- Primero **maquetar** — nada de lógica de fetch (Supabase, licencia, notificaciones,
  créditos llegan en fases posteriores).

## Decisión

Los cascarones viven en **`src/layouts/`** (nueva carpeta de infraestructura, junto a
`router/` e `i18n/`), separados de los módulos de dominio:

- **`AuthenticatedLayout/`** — shell de la app con sesión: `Sidebar` (colapsable, port
  del original), `Navbar` (toggle de tema + selector de idioma), `ErrorBoundary` (port
  de LimiteDeError: si una vista explota, el sidebar sigue vivo) y `FrozenOutlet`
  (port de OutletCongelado: evita el doble-mount con AnimatePresence). Cada layout
  lleva sus `components/` y `types/` propios.
- **`GuestLayout/`** — full-screen con el gradient hero y doodles flotantes; hospeda
  las vistas de `auth` (login, acceso denegado).
- **Módulos base:** `auth` (views `Login`, `AccessDenied`), `home` (view `Home`, panel
  principal que durante el maquetado indexa las demás maquetas), `setup` (view
  `Splash`, standalone sin layout — su trabajo real es el bootstrap del sidecar, por
  eso vive en setup), y `PageNotFound` en `modules/common/views/` como catch-all `*`.
- **Regla de dependencias afinada** (documentada en CLAUDE.md): las rutas de un módulo
  (`constants.ts`) son su contrato público e importables desde otros módulos y
  layouts; componentes/hooks/api siguen siendo privados del módulo. `router/` y
  `layouts/` son infraestructura.
- El gate de acceso real (login → verificación → denegado) se implementará como
  composición en el router cuando llegue la fase de auth; los layouts no deciden
  autorización.

### Forma

```
router
├── AuthenticatedLayout ── / (Home)            ← con sesión
├── GuestLayout ────────── /login, /acceso-denegado
├── (sin layout) ───────── /splash             ← arranque
└── * ─────────────────── PageNotFound
```

Quedaron **fuera a propósito** del maquetado (dependen del sidecar/Supabase): campana
de notificaciones, banner de trial/plan del sidebar, OAuth real, verificación de
acceso, progreso real del splash.

## Alternativas consideradas

- **Layouts dentro de `modules/common/layout/`** — descartada: los layouts componen
  vistas de varios módulos y navegan entre ellos; como parte de `common` invertirían
  la regla de dependencias (common no importa de módulos). Como infraestructura
  top-level esa dependencia es legítima y explícita.
- **Replicar el patrón del origen (guard que devuelve pantallas)** — descartada: mezcla
  autorización con presentación; con dos layouts explícitos, el guard de la fase auth
  solo decidirá QUÉ rama del router se renderiza.
- **Un único módulo `inicio` placeholder (estado anterior)** — reemplazado: `home`
  ocupa su lugar con el shell real alrededor.

## Consecuencias

- ✅ Migrar una vista = elegir layout + colgarla del router; el shell ya está.
- ✅ Las vistas de invitado comparten fondo/animaciones sin duplicar el gradient.
- ⚠️ Los items del sidebar de secciones no migradas son maquetas deshabilitadas
  (tooltip «próximamente»); hay que habilitarlos módulo a módulo al migrar.
- ⚠️ El e-mail mostrado en `AccessDenied` y el progreso del splash son estáticos hasta
  la fase de auth/setup.
- 🔒 `src/layouts/` no contiene lógica de dominio ni llamadas de datos: solo cascarón,
  tema, idioma y navegación.

## Verificación de cumplimiento

- **Build/lint (corren hoy):** `pnpm format && pnpm lint && pnpm build` en verde.
- **Greps ejecutables:**
  - `grep -rln "fetch(" src/layouts src/modules/auth src/modules/home src/modules/setup`
    → vacío (maquetado sin red).
  - `grep -rn "supabase" src/` → vacío hasta la fase de auth.
  - Paths literales en `<Link to>`/rutas → solo constantes de `constants.ts`.
- **Cómo se vería una regresión:** un layout importando componentes internos de un
  módulo (rompe la regla de dependencias), o una vista montada fuera de su layout
  (login con sidebar, p. ej.).

## Enmienda del 2026-10-11 — `videos` compone otros dominios

**Contexto.** La regla de arriba dice que componentes, hooks y `api/` son privados del módulo. En la
práctica, `videos` (Crear y el editor) importa desde hace tiempo lo que otros módulos exponen para
elegir algo: voces (`voices`), claves (`api-keys`), ajustes (`settings`) y personajes (`characters`).
La entrega 2 del avatar sumó `avatars` (la biblioteca, el saldo y la vista previa de un look) y la 2d
suma el reproductor de un look (`LookPlayerDialog`). La revisión de la entrega 2b lo marcó: o se
escribe la excepción, o cada pieza baja a `common`, que no es su lugar (son del dominio de avatares,
voces o claves).

**Decisión (del dueño, 2026-10-11, «implementa sus soluciones: la excepción en CLAUDE.md»).**
`videos` arma el video con piezas de otros dominios, así que puede importar lo que esos módulos
exponen para elegir o mostrar algo: su `api/`, sus hooks, sus tipos, sus constantes públicas (claves
de query, límites, tiempos), sus utilidades puras y sus componentes de selección o vista previa. Solo `videos` tiene esta excepción y solo en ese sentido:
lo que comparten dos módulos que no son `videos` sigue subiendo a `common`. El texto vive en
`CLAUDE.md`, «Regla de dependencias».

**Fuera de esta enmienda.** Medido el 2026-10-11 con un grep de las importaciones entre módulos:
`avatars`, `characters`, `music` y `voices` importan de `api-keys` (el aviso y el botón de la clave
de cada proveedor), `voices` lee un hook de `settings` y `common` importa una constante de `videos`.
Son prácticas anteriores que esta enmienda no legitima ni corrige; quedan para una decisión aparte
(por ejemplo, subir el aviso de clave a `common`).

**Cómo se vería una regresión:** un módulo que no es `videos` importando componentes o hooks de
otro, o un módulo importando de `videos` algo que no sean sus rutas.

## Referencias

- ADR-0003 (fundaciones), ADR-0004 (i18next).
- Origen de los ports: `02-vimo/cursor-video/app/src/compartido/layout/` y
  `caracteristicas/gestion-de-licencias/` del repo original.
