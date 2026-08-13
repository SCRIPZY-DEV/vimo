# ADR-0003 — Fundaciones de la interfaz: portar la capa común de la app original

- **Estado:** Aceptada — la decisión de i18n propio fue reemplazada por ADR-0004
- **Fecha:** 2026-08-12
- **Área:** app

## Problema

Arrancó la migración de la SPA original (repo `cursor-video`, React 18 + Vite,
~35.000 LOC en 188 archivos) hacia este repo (React 19 + Tauri 2). Antes de migrar la
primera pantalla había que decidir qué se **porta tal cual** y qué se **reescribe**,
porque las dos bases de código son incompatibles en organización:

- El origen agrupa lo transversal en `compartido/` (47 componentes shadcn/ui, un
  diccionario i18n central de 60 KB, clientes HTTP con URLs relativas `/api/...`);
  este repo exige módulos por dominio, i18n colocalizado por componente y un `fetcher`
  único ([CLAUDE.md](../../CLAUDE.md)).
- De los 47 componentes shadcn del origen, **solo 20 se usan** (verificado con grep
  sobre todas las features); el resto es código muerto que arrastra ~14 dependencias.

Restricciones que acotaron la decisión:

- El usuario final no debe notar diferencia visual: mismos colores de marca, mismas
  tipografías, mismo dark mode, mismos componentes.
- Las convenciones de este repo no se negocian: son el motivo de la reescritura
  (ADR-0001).
- React 19 y `erasableSyntaxOnly` rechazan patrones del origen (enums, parameter
  properties).

## Decisión

**El design system se porta verbatim; la infraestructura se reescribe según las
convenciones de este repo.** La línea divisoria: todo lo que el usuario ve (tokens,
componentes, doodles) se copia sin cambios visuales; todo lo que organiza el código
(i18n, tema, HTTP, rutas) se escribe de cero.

### Forma

| Pieza             | Ubicación                                       | Qué se hizo                                                                                                                                                                                                                                                |
| ----------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tokens y Tailwind | `src/assets/css/main.css`, `tailwind.config.ts` | Portados verbatim del origen. Tailwind **3.4** (misma major) para no arriesgar diferencias visuales.                                                                                                                                                       |
| Kit shadcn/ui     | `src/modules/common/ui/`                        | Vendorizados **solo los 20 componentes usados** (con sus 13 paquetes Radix exactos), imports reescritos a `@/modules/common/...`.                                                                                                                          |
| Doodles de marca  | `src/modules/common/doodles/`                   | Los 30 SVG animados, portados tal cual.                                                                                                                                                                                                                    |
| i18n              | `src/i18n/`                                     | **Propio, sin librería**: `defineMessages` + `useTranslations` tipados (es/en/pt). El diccionario central del origen se desintegra: cada vista lleva su bloque `messages`.                                                                                 |
| Tema              | `src/modules/common/theme/`                     | `ThemeProvider` que replica el comportamiento original (clase `dark`, `color-scheme`, transición `theme-changing` 250 ms). La clave de localStorage pasó a `vimo:theme`: se abandonó la paridad de claves con la app original al adoptar código en inglés. |
| HTTP              | `src/modules/common/fetcher.ts`                 | Único conocedor de la URL del sidecar; `configurarFetcher({ baseUrl })` se llamará al arrancar cuando Rust informe el puerto (ADR-0002). Reemplaza a los `canal*.ts` con `fetch("/api/...")` relativo del origen.                                          |
| Rutas             | `src/router/index.ts`                           | **Hash router** (`createHashRouter`); cada módulo declara sus paths en su `constants.ts`.                                                                                                                                                                  |
| Vista provisional | `src/modules/inicio/`                           | Ejercita tokens, ui, i18n, tema y enrutado. Se reemplaza cuando lleguen las vistas reales.                                                                                                                                                                 |
| TypeScript        | `tsconfig.app.json`                             | Se agregó `strict: true` (faltaba; el código del origen ya compilaba estricto).                                                                                                                                                                            |
| Identidad Tauri   | `src-tauri/tauri.conf.json`                     | `identifier: click.vimo.portable` (era el placeholder `com.tauri.dev`); ventana 1280×800, mínimo 1024×640.                                                                                                                                                 |
| Lint              | `eslint.config.js`                              | Excepción de `react-refresh/only-export-components` **solo** para `src/modules/common/ui/**` (el kit exporta variantes cva junto a componentes; es código vendorizado, no de producto).                                                                    |

## Alternativas consideradas

- **Regenerar shadcn/ui con el CLI actual (React 19, sin `forwardRef`)** — descartada
  _por ahora_: los componentes del origen traen ajustes de marca (bordes, saffron,
  radios) y regenerarlos cambiaría el aspecto. Puede volver componente a componente,
  comparando visualmente.
- **Copiar los 47 componentes del origen** — descartada: arrastra ~14 dependencias para
  código que ninguna feature importa (entre ellas `react-day-picker` v8, incompatible
  con React 19). Si una feature futura necesita uno, se vendoriza en ese momento.
- **Librería de i18n (i18next, react-intl)** — descartada en su momento por la
  validación tipada en build del sistema propio. **Nota 2026-08-12:** esta alternativa
  fue finalmente adoptada por experiencia de desarrollo — ver ADR-0004, que reemplaza
  la decisión de i18n de esta ADR.
- **`BrowserRouter` (como el origen)** — descartada: en producción Tauri sirve `dist/`
  por protocolo estático sin fallback SPA; una recarga en una ruta profunda rompe. El
  hash router lo evita y la URL no es visible en escritorio.
- **Tailwind 4** — descartada _por ahora_: migrar la config a CSS-first durante la
  migración duplica el riesgo visual. Reconsiderar cuando las pantallas estén migradas
  y haya comparación visual estable.

## Consecuencias

- ✅ Paridad visual con la app original desde el primer componente migrado.
- ✅ Migrar una pantalla ya no requiere decisiones de infraestructura: tema, i18n,
  HTTP y rutas tienen un único lugar y patrón.
- ✅ `pnpm build` valida las traducciones: clave faltante en un idioma = error de tipos.
- ⚠️ Deuda asumida: la ui vendorizada usa `forwardRef` (patrón React 18); se moderniza
  solo si se regenera un componente. Las fuentes se cargan de Google Fonts por
  `@import` (requiere red la primera vez) — para una app portable hay que
  self-hostearlas en `src/assets/` antes del primer release.
- 🔒 Nadie fuera de `src/modules/common/fetcher.ts` llama a `fetch` ni conoce el
  puerto del sidecar.
- 🔒 Ningún texto visible se escribe en JSX: todo pasa por `messages` +
  `useTranslations`.
- 🔒 `src/modules/common/ui/` es kit vendorizado: no se le agregan reglas de negocio
  ni textos; los componentes de producto viven en el `components/` de su módulo.

## Verificación de cumplimiento

- **Guards de build (corren hoy, local):** `pnpm build` ejecuta `tsc -b` con
  `strict` + `erasableSyntaxOnly`; un bloque `messages` con claves desparejas entre
  idiomas no compila (`defineMessages` en [src/i18n/index.tsx](../../src/i18n/index.tsx)).
- **Greps ejecutables** (local; candidatos al guard de CI que pide ADR-0001):
  - `grep -rn "@/compartido" src/` → debe estar vacío (no quedan rutas del origen).
  - `grep -rln "fetch(" src/ | grep -v modules/common/fetcher.ts` → debe estar vacío.
  - `grep -rln "BrowserRouter" src/` → debe estar vacío.
- **Cómo se vería una regresión:** una pantalla con los colores default de Tailwind
  (tokens rotos), un texto que no cambia al cambiar de idioma (hardcodeado en JSX), o
  un componente que funciona en `pnpm dev` pero no dentro de Tauri tras recargar
  (alguien volvió a un router de history).

## Fuera de alcance

- Empaquetar el sidecar y FFmpeg (lo gobierna ADR-0002; el `fetcher` deja el enchufe
  listo).
- El módulo `auth` (Supabase), el rediseño del OAuth y la migración de features
  (videos, personajes, voces, música, costos, ajustes): fases siguientes.
- El guard automatizado de la lista negra de dependencias (pendiente desde ADR-0001).

## Referencias

- ADR-0001 (separación interfaz/pipeline), ADR-0002 (sidecar).
- Repo de origen: `02-vimo/cursor-video/app` — su `ARQUITECTURA.md` documenta la capa
  que acá se reemplaza.
