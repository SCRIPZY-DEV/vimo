# Convenciones de Vimo

Reglas que Claude Code y cualquier persona deben seguir al escribir código en este
repositorio. Son las convenciones con las que se revisa el trabajo: un PR que las
incumple se devuelve.

- **Arquitectura:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — se lee primero.
- **Proceso (ramas, PRs, commits):** [docs/CONTRIBUTING.es.md](docs/CONTRIBUTING.es.md).
- **Decisiones de arquitectura:** [docs/adr/](docs/adr/) — antes de cambiar un patrón,
  revisá si hay una ADR que lo gobierne.

**Stack:** React 19 + TypeScript + Vite, empaquetado con Tauri 2. Enrutado con React
Router v7 y estado de servidor con TanStack Query. Gestor de paquetes: **pnpm**.
Las versiones exactas viven en `package.json` y `src-tauri/Cargo.toml` — no las
repitas en la documentación, se desactualizan.

---

## Estructura modular

El código de producto se organiza **por módulo de dominio**, no por tipo de archivo.
No existen carpetas globales `src/components/`, `src/hooks/` ni `src/types/`.

```
src/
  main.tsx                 punto de entrada
  App.tsx                  shell de la app
  router/index.ts          árbol de rutas: compone las vistas de los módulos bajo su layout
  i18n/index.ts            configuración de i18next (idiomas, detección, backend HTTP)
  layouts/                 cascarones de la app (no son módulos de dominio)
    AuthenticatedLayout/   shell con sidebar + navbar; components/ y types/ propios
    GuestLayout/           full-screen para login / acceso denegado
  assets/                  imágenes, fuentes y CSS global (css/main.css: tokens y Tailwind)
  modules/
    common/                lo transversal: fetcher, UI reutilizable, brand, utilidades
    <modulo>/              un dominio del producto (auth, videos, ajustes, ...)
      api/index.ts         única capa que habla con el exterior; exporta <modulo>Api
      components/          componentes del módulo (incluidos los subcomponentes)
      hooks/               hooks del módulo (use*)
      types/               un archivo por dominio: login.ts, video.ts, ...
      views/<Vista>/       una carpeta por vista: index.ts + <Vista>.tsx
      constants.ts         constantes del módulo (rutas, claves de query, límites)
public/locales/            catálogos de traducción es/en/pt (ver sección i18n)
```

- **`src/layouts/`** contiene los cascarones que envuelven a las vistas (sidebar,
  navbar, fondos full-screen). Cada layout lleva sus `components/` y `types/`
  propios. Un layout puede importar de `common` y las **constantes** de los módulos
  (rutas); nunca componentes o hooks internos de un módulo.

- **Un módulo = un dominio del producto**, no una capa técnica. Si no sabés nombrarlo
  sin decir «utils» o «helpers», todavía no es un módulo.
- **Regla de dependencias:** un módulo importa de `common` y de sí mismo. **Nunca** de
  las entrañas de otro módulo. Si dos módulos necesitan lo mismo, sube a `common`; si
  uno necesita el dominio de otro, es señal de que el límite está mal trazado.
  Excepción acotada: las **rutas** de un módulo (`constants.ts`) son su contrato
  público — cualquier módulo o layout puede importarlas para navegar hacia él.
  `src/router/` compone vistas y constantes de todos los módulos: es infraestructura,
  no un módulo.
- **Imports siempre con el alias `@/`** (`@/modules/videos/api`), configurado en
  [tsconfig.app.json](tsconfig.app.json) y [vite.config.ts](vite.config.ts). Nada de
  `../../..`.
- **Sin barriles `index.ts`** (rompen el tree-shaking de Vite). Las únicas excepciones:
  `src/router/index.ts`, `src/i18n/index.ts`, `src/modules/*/api/index.ts`, y cada
  `src/modules/*/views/*/index.ts` (que solo reexporta su componente de vista).
- **`types/`**: interfaces con nombre por endpoint (`LoginRequest`, `LoginResponse`),
  divididas por dominio. Nada de tipos anónimos en línea en api/hooks/componentes.
- **`api/`**: métodos con sintaxis abreviada y `return` explícito (no arrow functions),
  sin líneas en blanco entre ellos. Se importa por la carpeta: `@/modules/x/api`.
- **Ningún texto visible se escribe en el código**: todo sale de los catálogos de
  `public/locales/` vía i18next (ver la sección [i18n](#i18n)). En `src/i18n/` solo
  vive la configuración.
- **`constants.ts`**: ahí van las constantes con nombre del módulo (regex, límites,
  claves, números mágicos). No las declares sueltas en un hook, componente o vista.
  Un valor trivial local a una función sí puede quedar en línea.
- **Subcomponentes** viven en el `components/` del módulo, no al lado del padre.

---

## Legibilidad

- Preferí **guard clauses** (early returns) sobre `if` anidados o ternarios encadenados:
  atendé el caso especial y `return`, dejando el camino principal sin indentar. Cada
  caso significativo lleva su return explícito — **incluido el caso vacío o por
  defecto** — en vez de caer en una línea que solo funciona porque un valor resultó
  ser `undefined`.
- Un guard clause de una sola sentencia va en una línea sin llaves
  (`if (author) return [ROOT, author]`); usá llaves solo si el cuerpo ocupa varias
  líneas.
- No agregues anotación de tipo ni `as` que el compilador ya infiere. Si dudás de si
  un cast sostiene algo, borralo y corré `pnpm build`: conservalo solo si falla.
- No escribas una arrow function con retorno implícito cuando su cuerpo ocupa más de
  una línea (por ejemplo un ternario multilínea que devuelve objetos): dale cuerpo con
  llaves y `return` explícito. El retorno implícito es para one-liners de verdad.
- Separá bloques lógicos con una línea en blanco para poder escanear el archivo — entre
  guard clauses consecutivos, y entre el bloque de hooks y el `return` del componente.
  No empaques todo en un muro de líneas.
- **El código se escribe en inglés**: variables, funciones, tipos, constantes y
  nombres de archivo (`ThemeProvider`, `useTheme`, `THEME_STORAGE_KEY`). Los
  comentarios, docstrings y la documentación del repo siguen en español.
- **Nombrá las cosas completas** — nada de abreviaturas crípticas (`RE`, `cfg`, `tmp`,
  `val`, `usr`). Escribí la palabra: `USERNAME_REGEX`, `config`, `user`. Un nombre debe
  leerse sin que nadie adivine qué significa.
- **Nombrá un hook por lo que provee, no por la librería que hay detrás**: `useVideos`,
  no `useVideosInfiniteQuery` (el sufijo filtra internals de TanStack y sugiere
  variantes que no existen). Cuando un hook recibe varias entradas opcionales, pasá un
  objeto de opciones (`useVideos({ categoria })`) en vez de argumentos posicionales con
  `undefined` de relleno.
- **No uses `enum` de TypeScript.** `erasableSyntaxOnly` está activo en
  [tsconfig.app.json](tsconfig.app.json) y los rechaza. Usá un objeto `as const` con su
  tipo derivado.
- El codigo SIEMPRE debe estar escrito en ingles, nombres de variables, funciones, nombres de archivos, etc. Todo en inglés menos los comentarios.

---

## Diseño de componentes (React 19)

- **Un componente es dueño de su asunto**: encapsulá el fetching, el estado y el markup
  de una funcionalidad dentro de un componente autocontenido y montalo en el padre.
  Nunca subas la lógica o las queries de una funcionalidad a un padre que no tiene nada
  que ver (layout o página): lo infla y le filtra responsabilidades.
- **Separá inteligentes de tontos**: los componentes presentacionales reciben solo
  props y callbacks (`onGuardar`, `onSeleccionar`); las queries, mutaciones y efectos
  viven en un contenedor. Así lo presentacional queda reutilizable.
- La división inteligente/tonto gobierna **datos, mutaciones y estado por instancia**.
  **No** aplica a configuración global con un único valor correcto en toda la app
  (ajustes, tema, i18n): eso se lee directo desde el componente presentacional, vía su
  contexto. Preferí leer el global antes que pasarlo por props: una prop implica que el
  valor varía según quien la llame, y habilita que un sitio de reuso pase el valor
  equivocado o caiga en un default viejo.
- **Derivá durante el render, no con `useEffect` + estado.** Si un valor se puede
  calcular de props y estado, calculalo en el cuerpo del componente. `useEffect` es
  solo para sincronizar con sistemas externos (timers, listeners del DOM, APIs de
  Tauri), no para reaccionar a cambios de props. Si el `useEffect` tiene mucha más
  lógica considera hacer un custom hook.
- **No memoices por reflejo.** El React Compiler no está habilitado, pero `useMemo`,
  `useCallback` y `memo` se agregan cuando hay un costo medible o una identidad
  referencial que un efecto necesita — no de entrada.
- **`key` estable y propia del dato** (el id), nunca el índice del array.
- **`ref` es una prop normal en React 19**: no uses `forwardRef` en componentes nuevos.
- Aprovechá las APIs de React 19 donde encajan: `use()` para consumir contexto o
  promesas, y `useActionState` / `useFormStatus` / `useOptimistic` para formularios y
  actualizaciones optimistas, en vez de reimplementar ese estado a mano.

---

## Estado y datos

- **Todo estado de servidor pasa por TanStack Query.** Nunca `useState` + `useEffect`
  para traer datos: eso duplica caché, pierde el manejo de errores y provoca condiciones
  de carrera.
- La cadena es **componente → hook → `api/` → `fetcher`**, y no se saltea ningún
  eslabón. Un componente jamás llama al `fetcher` ni a `fetch` directamente.
- Las **claves de query** se definen en el `constants.ts` del módulo, nunca como arrays
  literales sueltos en cada hook: es lo que permite invalidar sin cazar strings.
- El estado local de UI (un modal abierto, un input) va con `useState` en el componente
  más cercano. No promuevas estado a global sin una necesidad real.
- Los comandos de Tauri (`invoke`) se envuelven en el `api/` del módulo igual que una
  llamada HTTP; los componentes no los invocan directo.

---

## HTTP

- **Nunca llames a `fetch` directamente.** Usá el `fetcher` compartido de
  `@/modules/common/fetcher`, que centraliza la URL base y el manejo de errores.
- El `api/` de cada módulo es la **única** capa que usa el `fetcher`.
- El `fetcher` es también el **único** archivo que conoce la URL del sidecar: el puerto
  llega desde la configuración al arrancar y no se escribe a mano en ningún otro lado.
- **Excepción:** las llamadas a servicios externos (SDK de Supabase, edge functions de
  vimo.click) viven igualmente solo en el `api/` del módulo — nunca en hooks o vistas —
  con la URL en su `constants.ts` (ADR-0006).

---

## Rutas y vistas (React Router v7)

- Las rutas de cada módulo se declaran en su `constants.ts` como objeto `as const`
  (no `enum`, ver arriba):

  ```ts
  export const VideosRoutes = {
    lista: '/videos',
    detalle: '/videos/:id',
  } as const
  ```

- **Nunca escribas un path literal** en `<Link to>`, `navigate()`, `redirect` ni en la
  definición de rutas: siempre la constante del módulo.
- Cada vista vive en `views/<Vista>/`, con un `index.ts` que reexporta su componente.
- **Toda vista de usuario debe ser alcanzable desde un `<Link>` o botón visible** —
  nunca escribiendo la URL a mano. Excepción: vistas a las que se entra desde un enlace
  externo enviado por la app (verificación de correo, restablecer contraseña).
- Cada vista fija el título de la pestaña con `usePageTitle(t('<vista>.pageTitle'))`;
  la clave `pageTitle` vive en el grupo de la vista dentro de los catálogos. Nunca
  hardcodeado.

---

## i18n

La app usa **i18next** (`react-i18next` + `i18next-http-backend` +
`i18next-browser-languagedetector`), configurado en [src/i18n/index.ts](src/i18n/index.ts).
Ver la ADR-0004.

- **Ningún texto visible por el usuario se escribe directo en el JSX.** Todo pasa por
  una clave de traducción, incluidos los mensajes de error, los `placeholder`, los
  `aria-label` y los títulos de pestaña.
- **Los textos viven en los catálogos** `public/locales/{es,en,pt}.json`, que i18next
  carga por HTTP al arrancar. Las claves se **agrupan por prefijo de vista o área**
  (`login.*`, `home.*`, `layout.sidebar.*`, `notFound.*`): dentro de su grupo la clave
  es plana y local (`login.boton`, no `login.form.submit.boton`).
- **Los tres catálogos declaran siempre las mismas claves.** Agregar una clave en
  `es.json` implica agregarla en `en.json` y `pt.json` en el mismo cambio. ⚠️ A
  diferencia del sistema tipado anterior, i18next NO valida esto en build (una clave
  faltante se renderiza como la clave cruda o cae al `fallbackLng`); hasta que exista
  un guard que compare los tres JSON, la revisión es manual — repasá los tres archivos
  en cada cambio de textos.
- En el grupo `common.*` van **solo** los textos que se repiten en toda la app
  («Guardar», «Cancelar», errores genéricos). Ante la duda, el texto va en el grupo de
  su pantalla: subirlo a `common` cuando de verdad se repita es fácil; bajarlo después,
  no.
- Se consume con `useTranslation()` de `react-i18next`:

  ```tsx
  const { t, i18n } = useTranslation()
  t('login.bienvenida', { nombre: Brand.name }) // interpolación con {{nombre}}
  i18n.changeLanguage('en') // cambiar idioma (se persiste en localStorage)
  i18n.resolvedLanguage // idioma activo ('es' | 'en' | 'pt')
  ```

- Las claves se nombran por su significado, no por el texto en español
  (`credencialesInvalidas`, no `usuarioOContrasenaIncorrecta`): el texto cambia, el
  significado no.
- Los textos con datos usan interpolación `{{asi}}`, nunca concatenación de strings:
  el orden de las palabras cambia entre idiomas.
- El idioma activo se lee **directo desde el componente presentacional** (es
  configuración global, no un dato por instancia); no se pasa por props.

---

## Al terminar un cambio

Corré, en este orden, y todo debe pasar antes de dar el trabajo por terminado:

```
pnpm format
pnpm lint
pnpm build
```

`pnpm build` ejecuta `tsc -b` además del bundling, así que cubre el chequeo de tipos.

> **Testing:** todavía no hay framework de tests en el repo. Cuando se decida (Vitest,
> Playwright), se agrega acá la regla y el comando correspondiente. Hasta entonces, no
> declares «tests verdes»: no los hay.

---

## Git

- **Claude nunca ejecuta comandos de git.** El staging, los commits, las ramas y los
  pushes los hace la persona. Ver [docs/CONTRIBUTING.es.md](docs/CONTRIBUTING.es.md)
  para el formato de ramas y Pull Requests.

## Brainstorming

- Nunca ofrezcas mockups de navegador, wireframes ni diagramas visuales: se trabaja
  solo con texto.
