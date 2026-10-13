# ADR-0056 — Layout propio del editor a pantalla completa

- **Estado:** Aceptada (2026-10-08): el dueño probó el editor en la app compilada `0.9.3-editor.1` y
  lo dio por bueno («todo funciona a la perfección»). Propuesta el 2026-10-07.
- **Fecha:** 2026-10-08
- **Área:** app
- **Relacionada con:** [ADR-0005](ADR-0005-layouts-explicitos-y-modulos-base.md) (layouts explícitos y
  regla de dependencias), [ADR-0014](ADR-0014-modulo-library-edicion-sobre-stages.md) (el editor de la
  biblioteca).
- **Diseño:** [docs/handoff/2026-10-07-ai-editor/design.md](../handoff/2026-10-07-ai-editor/design.md).

## Problema

El editor de un proyecto (`/library/:projectId/edit`) vive dentro del `AuthenticatedLayout`: sidebar
de 256 px (64 colapsado) a la izquierda y navbar arriba. El visor, el panel de escena y el timeline
compiten por el ancho que queda, y la cabecera del editor repite dentro del contenido lo que un editor
profesional pone en una barra (volver, título, acciones). El dueño quiere el editor a pantalla completa,
como el de VidRush, y es también el marco que van a necesitar la pista del avatar y el agente de IA.

Cambiar eso toca el árbol de rutas y la estructura de layouts, que el `CLAUDE.md` pide acordar antes y
registrar en una ADR.

## Decisión

1. **Un tercer layout, `src/layouts/EditorLayout/`**, junto a `AuthenticatedLayout` y `GuestLayout`.
   Sigue la ADR-0005: infraestructura, importa de `common` y las constantes de los módulos, nunca sus
   componentes ni hooks. Pone el tema (`data-theme`), una barra superior de una línea y un `<main>` con
   `ErrorBoundary` y `<Outlet/>`.
2. **La ruta del editor cuelga de ese layout**, en una rama hermana del router con el mismo
   `requireAuthLoader`. El path no cambia (`VideosRoutes.libraryEditor`): el módulo `videos` exporta la
   ruta aparte (`libraryEditorRoute`, como `createDemoRoute`) y el router la compone.
3. **La barra la pinta el layout; su contenido variable lo pinta la vista por portal.** Las migas
   («Biblioteca / Proyecto») y las acciones (Música, Audio, Exportar clips, Renderizar) dependen del
   estado del editor, y un layout no puede importar componentes del módulo. El layout deja dos huecos
   con id (constantes en `common`) y la vista `LibraryEditor` los llena con `SlotPortal` (`common`).
   Datos, mutaciones y diálogos siguen en la vista.
4. **Lo que dos layouts comparten sube a `common`:** `ErrorBoundary` (con una prop `action` opcional
   para el fallback), `ThemeToggle` y `LanguageMenu` (extraídos de `Navbar`). `FrozenOutlet` queda en
   `AuthenticatedLayout`.
5. **El estado de interfaz del timeline (orden de pistas, silencio en el visor, candado) es del
   equipo, no del proyecto:** se guarda en `localStorage` por `projectId`, como la pestaña de la
   biblioteca. No toca el archivo del proyecto ni el render. Cuando exista la pista del avatar y el
   orden decida qué queda encima en el video, esa parte pasa al proyecto con su propia ADR.

### Forma

```
router
├── AuthenticatedLayout ── /create, /library, /library/:id, /library/:id/progress, …   ← sidebar
├── EditorLayout ───────── /library/:id/edit                                             ← pantalla completa
├── GuestLayout ────────── /login, /acceso-denegado
├── (sin layout) ───────── /splash
└── * ─────────────────── PageNotFound
```

## Alternativas consideradas

- **Esconder el sidebar con una marca en la ruta del editor, dentro del `AuthenticatedLayout`.** Menos
  código y permitiría animar el sidebar cerrándose. Descartada: mezcla dos cascarones en uno (el layout
  pasa a decidir por ruta qué partes de sí mismo muestra), y cada pantalla completa futura (estudio de
  avatar, agente) sumaría otra marca. Un layout propio es la forma que la ADR-0005 ya eligió para
  separar cascarones.
- **El editor sin layout, como el splash.** Descartada: repetiría tema, red de seguridad y barra en cada
  pantalla completa.
- **Pasar las migas y las acciones por `useOutletContext`** en vez de un portal. Descartada: obliga al
  layout a conocer la forma de los datos del editor (o a recibir nodos React por contexto, que es un
  portal con más pasos). El portal mantiene al layout ciego al dominio.
- **Guardar el orden de las pistas en el archivo del proyecto.** Descartada por ahora: hoy el orden es
  solo visual y meterlo en el proyecto obliga a tocar el contrato del sidecar «de paso». Vuelve con la
  pista del avatar, cuando el orden signifique algo para el render.

## Consecuencias

- ✅ El editor ocupa toda la ventana; el marco queda listo para la pista del avatar y el panel del
  agente.
- ✅ Todo lo que navega al editor sigue funcionando: el path no cambia.
- ✅ `ErrorBoundary`, `ThemeToggle` y `LanguageMenu` quedan reutilizables desde `common`.
- ⚠️ Entre la Biblioteca y el editor cambia el layout entero: no hay animación de transición entre
  ambos (igual que entre login y app).
- ⚠️ La barra depende de que la vista pinte sus huecos: una vista nueva bajo `EditorLayout` tiene que
  usar `SlotPortal` o la barra queda solo con la casita y los globales (que es un estado válido).
- ⚠️ Un orden de pistas guardado en `localStorage` se pierde al cambiar de equipo o limpiar el perfil;
  es aceptable para estado visual.
- ⚠️ Con render vigente, silenciar una pista pasa el visor a simulación: el mp4 trae la mezcla hecha y
  no se puede silenciar una sola de sus pistas (la insignia lo dice). Al cambiar de modo, si estaba
  reproduciendo, sigue reproduciendo desde el cursor con la pista muda; si estaba en pausa, queda en
  pausa en el cursor (como en VidRush, pedido del dueño del 2026-10-08). Ver
  [el documento del arreglo](../fixes/2026-10-08-fix-editor-preview-mode-switch/editor-preview-mode-switch.md)
  y la §5.2 del diseño.
- 🔒 `src/layouts/EditorLayout/` no contiene lógica de dominio ni llamadas de datos: solo cascarón,
  tema, idioma y navegación.

## Verificación de cumplimiento

- **Build/lint:** `pnpm format && pnpm lint && pnpm build` en verde.
- **Greps ejecutables:**
  - `grep -rn "@/modules/videos/components\|@/modules/videos/hooks\|@/modules/videos/api" src/layouts`
    → vacío (el layout no importa internals del módulo).
  - `grep -rn "'/library" src --include='*.tsx'` → vacío (ninguna ruta literal).
  - `grep -rn "layouts/AuthenticatedLayout/components/ErrorBoundary" src` → vacío.
  - `grep -rn "libraryEditor" src/modules/videos/routes.ts` → solo en `libraryEditorRoute`, fuera de
    `videosRoutes`.
- **Manual:** la lista de 12 puntos de la §8 del diseño, en tema claro y oscuro y en los tres idiomas,
  incluido Windows para rueda y arrastre.
- **Cómo se vería una regresión:** el editor abriendo con sidebar; una vista de la app autenticada
  colgada del `EditorLayout`; un componente del módulo `videos` importado desde `src/layouts/`; una
  ruta literal `'/library/...'` en un `<Link>`.

## Fuera de alcance

- Reorganizar las secciones del editor (herramientas en la barra con paneles flotantes, como VidRush):
  después del avatar, por decisión del dueño.
- La pista del avatar, mover clips, el ojo por pista, deshacer y el agente: sub-proyectos siguientes.

## Referencias

- ADR-0005 (layouts explícitos), ADR-0014 (módulo library).
- [docs/handoff/2026-10-07-ai-editor/design.md](../handoff/2026-10-07-ai-editor/design.md) y
  [library-research.md](../handoff/2026-10-07-ai-editor/library-research.md).

## Enmienda 2026-10-13 — «Exportar para editar» se puede cancelar

Pedido del dueño: «exportar para editar tiene que salir la opción de cancelar». En la barra, mientras
exporta, «Exportar para editar» es una píldora con el progreso y una X («Cancelar exportación»), igual
que la del render. La X usa el `cancelActiveJob` del store (`useLibraryEditorTask`). Como con el avatar,
la cancelación se pide una sola vez: un segundo clic no vuelve a llamar al sidecar. Si el clic llega
antes que el id del job, el job se corta apenas el id llega. Cancelar no es un error: el cierre con
`cancelled` devuelve el botón sin aviso. El aviso del render, «Generación cancelada. Podés reanudarla…»,
habla de reanudar, y una exportación siempre empieza de cero. Tampoco se abre la carpeta si el job
terminó antes de cortarse. En el sidecar, `export-clips` borra `clips/` cuando se corta o falla a mitad,
para que nadie tome una parte de los clips por una exportación entera; ya la vaciaba al empezar. Guards:
`check-export-header-ui.mjs` (12 casos), `check-editor-export-cancel.mjs` (nuevo, store real, 7 casos)
y `check-avatar-blocks.mjs` (la exportación cortada a mitad).
