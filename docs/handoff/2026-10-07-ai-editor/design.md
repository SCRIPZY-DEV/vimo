# Editor a pantalla completa y pistas del timeline (sub-proyecto 1 del editor con IA)

- **Fecha:** 2026-10-07
- **Rama:** `feat/edicion-avatar-ia` (sale de `dev` @ `2950ebb3`)
- **Estado:** diseño acordado con el dueño el 2026-10-07 y aprobado por él ese mismo día; implementado
  en la rama el 2026-10-08 (plan en `plan.md` (interno), seis tareas con revisión por tarea y revisión
  final de la rama), con las decisiones tomadas en ejecución incorporadas en §2, §5.1 y §5.2. Pendiente
  la QA manual del dueño en la app (lista en el log de sesiones del vault y en
  [docs/fixes/2026-10-08-fix-editor-preview-mode-switch](../../fixes/2026-10-08-fix-editor-preview-mode-switch/editor-preview-mode-switch.md));
  la ADR-0056 pasa a Aceptada con esa QA.
- **ADR:** [ADR-0056](../../adr/ADR-0056-layout-propio-del-editor-a-pantalla-completa.md).
- **Relacionadas:** ADR-0005 (layouts explícitos), ADR-0014 (módulo library, edición sobre stages),
  ADR-0041 y ADR-0047 (clips animados en el timeline), ADR-0029 (modo demo).
- **Investigación previa:** [library-research.md](library-research.md) (librerías, HeyGen, VidRush).

Este documento es el contrato del plan de implementación. Si el plan necesita algo que lo contradice,
se cambia primero este documento, con el dueño.

---

## 1. Qué se quiere lograr

El editor de un proyecto (`/library/:projectId/edit`) deja de vivir dentro del cascarón con sidebar y
pasa a ocupar toda la ventana, como el editor de VidRush: una barra superior de una sola línea y, debajo,
el editor con todo el ancho. Arriba a la izquierda está el cohete de Vimo; al pasar el mouse se
convierte en una casita doodle que se dibuja sola y, al hacer clic, vuelve a la Biblioteca.

El timeline gana dos cosas que hoy no tiene: la rueda vertical del mouse lo desplaza en horizontal, y
cada pista tiene una cabecera con asa para reordenarla, un botón para silenciarla en el visor y un
candado.

Es el primero de los sub-proyectos del editor con IA. Los siguientes (generación del avatar con HeyGen,
la pista del avatar con sus clips, el agente) tienen su propio diseño.

## 2. Qué no cambia

- Solo el editor va a pantalla completa. Crear, la lista de la Biblioteca, el reproductor y la pantalla
  de progreso siguen dentro del `AuthenticatedLayout`, con sidebar.
- El editor conserva todas sus funciones: visor, panel de escena, galería de imágenes, animación,
  transiciones, música, audio, exportar clips y renderizar. Se reorganiza el marco, no el contenido.
  Reorganizar las secciones del editor queda para después del avatar (decisión del dueño).
- La ruta del editor sigue siendo `VideosRoutes.libraryEditor`: todo lo que hoy navega al editor
  (`libraryEditorPath`) sigue funcionando sin tocarse.
- El contrato con el sidecar, el archivo del proyecto y el render no se tocan. Nada de lo que hace el
  timeline nuevo (orden de pistas, silencio, candado) llega al video final.
- Los atajos de teclado del editor (`useEditorShortcuts`) siguen iguales, salvo que ignoran una tecla
  que otro control ya atendió (`event.defaultPrevented`): por ejemplo, el espacio, las flechas y Esc
  sobre el asa de una pista, que consume dnd-kit (ver §5.4).

## 3. El marco: `EditorLayout`

Un tercer cascarón en `src/layouts/EditorLayout/`, junto a `AuthenticatedLayout` y `GuestLayout`,
siguiendo la ADR-0005 (los layouts son infraestructura; importan de `common` y las constantes de los
módulos, nunca sus componentes ni hooks).

```
src/layouts/EditorLayout/
  EditorLayout.tsx            raíz: tema, barra, <main> con ErrorBoundary + <Outlet/>
  components/EditorBar.tsx    la barra superior (§4)
  components/HomeButton.tsx   cohete → casita, enlaza a la Biblioteca
```

- **Router.** En `src/modules/videos/routes.ts`, la ruta del editor sale de `videosRoutes` y se exporta
  aparte como `libraryEditorRoute` (mismo patrón que `createDemoRoute`). En `src/router/index.ts` se
  agrega una rama hermana:

  ```ts
  {
    Component: EditorLayout,
    loader: requireAuthLoader,
    children: [libraryEditorRoute],
  }
  ```

  El guard de acceso es el mismo que hoy. Al pasar de la Biblioteca al editor cambia el layout entero,
  así que no hay animación de transición entre ambos (igual que entre login y app).

- **Tema.** La raíz del layout lleva `data-theme={theme}` y `bg-background`, como el
  `AuthenticatedLayout`. Estructura: `flex h-screen flex-col overflow-hidden`; la barra es `shrink-0` y
  el `<main>` es `flex-1 min-h-0 overflow-y-auto overscroll-none`, como el del layout autenticado:
  así el editor ocupa la altura real con su `lg:h-full` y, por debajo de `lg`, cuando apila el visor y
  el panel, sigue pudiendo scrollear.

- **Red de seguridad.** `ErrorBoundary` se mueve de `src/layouts/AuthenticatedLayout/components/` a
  `src/modules/common/components/ErrorBoundary.tsx` (con sus tipos en `common/types/`), porque ahora lo
  usan dos layouts. Gana una prop opcional `action?: ReactNode` que el fallback muestra junto a «Probar
  de nuevo»; el `EditorLayout` pasa un botón «Volver a la biblioteca». `AuthenticatedLayout` lo importa
  desde `common` sin cambiar su comportamiento. `FrozenOutlet` se queda donde está: el editor no anima
  cambios de ruta.

- **Tema e idioma.** El botón de tema y el menú de idioma salen de `Navbar.tsx` a dos componentes de
  `common` (`src/modules/common/components/ThemeToggle.tsx` y `LanguageMenu.tsx`; la lista `LOCALES` a
  `common/constants.ts` y `LocaleOption` a `common/types/`). `Navbar` los usa tal cual; la barra del
  editor también. Mismo aspecto y mismas claves de i18n.

## 4. La barra superior

Una sola línea de 48 px (como la `Navbar`), borde inferior, `bg-background/80 backdrop-blur`, `z-30`.
Tres zonas:

1. **Izquierda: `HomeButton`.** Un botón de 40×40 con esquinas redondeadas (`rounded-xl`) que es un
   `<Link to={VideosRoutes.library}>` con `aria-label` «Volver a la biblioteca» y tooltip con el mismo
   texto.
   - En reposo muestra `DoodleRocket` (tamaño 22), ya dibujado.
   - Con el mouse encima o el foco del teclado: aparece un fondo suave (`bg-muted`), el cohete se
     desvanece y se monta `DoodleHome`, que se dibuja solo en unos 0,5 s. Al salir, vuelve el cohete.
   - **`DoodleHome`** es un doodle nuevo en `src/modules/common/doodles/DoodleHome.tsx`, con el patrón
     de `DoodleRocket` (`useDoodleDraw`, trazo `--doodle-ink` de 3 px, `strokeDasharray` +
     `strokeDashoffset` con transición escalonada): paredes y puerta en trazo, techo relleno con
     `--saffron`, puerta o ventana con un detalle `--coral`. `viewBox` cuadrado. Duración total del
     trazo alrededor de 0,5 s, para que responda al hover; se monta con `delay` 0.
2. **Centro-izquierda: migas.** «Biblioteca / Nombre del proyecto». «Biblioteca» es un `<Link>` a la
   Biblioteca con el texto `layout.nav.biblioteca`; el nombre va truncado con elipsis. Reemplazan a la
   flecha de volver y al título que hoy pone `LibraryViewHeader` dentro del editor (ese componente
   sigue en uso en el reproductor y en el progreso).
3. **Derecha: acciones y globales.** Primero las acciones del editor que hoy están en su cabecera, con
   los mismos componentes: Música, Audio, `ExportClipsButton` y `RenderVideoButton`. Después un
   separador vertical y, al final, `ThemeToggle` y `LanguageMenu`.

**Quién pinta qué.** El layout es dueño de la barra, pero las migas y las acciones dependen del estado
del editor (nombre del proyecto, `busy`, el job de render). Un layout no importa componentes de un
módulo, así que la barra deja dos huecos (`<div id>`) y la vista `LibraryEditor` pinta dentro de ellos
con un portal:

- `src/modules/common/components/SlotPortal.tsx`: `createPortal(children, target)`, donde `target` se
  busca con `document.getElementById(id)` en un efecto y se guarda en estado; si el hueco todavía no
  existe no pinta nada. Los ids viven en `src/modules/common/constants.ts`
  (`EDITOR_BAR_SLOT_IDS = { title, actions }`).
- `LibraryEditor` renderiza `<SlotPortal id={EDITOR_BAR_SLOT_IDS.title}>` con las migas y
  `<SlotPortal id={EDITOR_BAR_SLOT_IDS.actions}>` con los cuatro botones. Los datos, mutaciones y
  diálogos siguen en la vista: el portal mueve solo el markup.

**La barra está siempre, con salida siempre:**

| Estado del editor             | Qué se ve bajo la barra                                                                    | Migas                 |
| ----------------------------- | ------------------------------------------------------------------------------------------ | --------------------- |
| Cargando                      | `ViewSpinner`                                                                              | «Biblioteca» sola     |
| Sin detalle (error al cargar) | `ErrorMessage` con el error (sin el botón de volver de hoy: ya está la casita y las migas) | «Biblioteca» sola     |
| Borrador sin escenas          | La tarjeta «Generar video» de hoy, centrada                                                | «Biblioteca / Nombre» |
| Editor normal                 | Fila de herramientas, visor + panel, timeline                                              | «Biblioteca / Nombre» |
| La vista explota              | Fallback del `ErrorBoundary` con «Probar de nuevo» y «Volver a la biblioteca»              | lo que hubiera        |

## 5. El timeline

### 5.1 Rueda vertical → desplazamiento horizontal

Medido en VidRush: 1 px de rueda = 1 px de scroll horizontal, y el gesto que en una página baja, en el
timeline adelanta (respeta la dirección de scroll configurada en el sistema).

En el listener nativo de `wheel` que ya existe en `EditorTimeline.tsx` (hoy solo atiende Cmd/Ctrl +
rueda para el zoom):

- Sin modificador y con `|deltaY| > |deltaX|`: `preventDefault()` y `element.scrollLeft += deltaY`.
  Si el carril no tiene desborde horizontal (todo el video entra), la rueda no se consume y sigue
  siendo de la página.
- El gesto horizontal del trackpad (`deltaX` dominante) sigue siendo nativo; Shift + rueda ya lo
  convierte el navegador.
- Cmd/Ctrl + rueda sigue siendo zoom.
- Como ya pasa hoy, cualquier rueda marca interacción manual y pausa el seguimiento del cursor
  (`AUTOSCROLL_MANUAL_PAUSE_MS`).

### 5.2 Pistas con cabecera, orden, silencio y candado

**Modelo** (en `src/modules/videos/types/library.ts` y `constants.ts`):

```ts
type TimelineTrackId = 'scenes' | 'narration' | 'music'
interface TimelineLayout {
  order: TimelineTrackId[]
  muted: Record<TimelineTrackId, boolean> // solo tiene efecto en pistas de audio
  locked: Record<TimelineTrackId, boolean>
}
```

Hoy el timeline tiene tres filas fijas (`V1` escenas, `A1` narración, `A2` música, en
`EditorTimeline.tsx`). Pasan a renderizarse según `layout.order`: la posición vertical de cada pista
(`trackTop`) sale de su índice en el orden, tanto en la columna de cabeceras como en el carril. Los
marcadores de fundido siguen a la pista de escenas. La pista del avatar, cuando llegue, es un id más.

**Persistencia.** Hook `useTimelineLayout(projectId)` en `hooks/`: lee y escribe
`localStorage['vimo:editor:timeline:v1:<projectId>']`, con `try/catch`, validando que los ids sean
conocidos (lo desconocido se ignora y se completa con el default). Es estado de interfaz por proyecto
en este equipo, como la pestaña de la biblioteca o el sidebar colapsado: **no** va al archivo del
proyecto, porque hoy el orden es solo visual. Cuando exista la pista del avatar, el orden entre pistas
visuales pasa a decidir qué queda encima en el video, y ahí se mueve al proyecto (con su propia ADR).

**Cabecera de cada pista** (la columna fija de la izquierda, que no se desplaza con el scroll):

- **Asa ⋮⋮** (`GripVertical` de lucide), `cursor-grab`, con `aria-label` «Arrastrá para reordenar la
  pista Música» (con el nombre de cada pista). Es el único punto de agarre: el resto de la cabecera no
  arrastra.
- Icono y nombre de la pista, como hoy.
- **Silenciar** (`Volume2` / `VolumeX`): solo en narración y música. Afecta **solo al visor**: el
  editor pasa al `EditorPreviewPlayer` una mezcla efectiva con volumen 0 en la pista silenciada, sin
  tocar la mezcla guardada ni el diálogo de Audio. El video final no cambia. Con un render vigente el
  visor no puede silenciar una sola pista del mp4 (trae la mezcla hecha), así que, mientras haya una
  pista con fuente silenciada, el visor simula y su insignia dice «Simulación: hay una pista
  silenciada»; silenciar una pista sin fuente (un proyecto sin música) no cambia el modo. Silenciar no
  corta la reproducción, como en VidRush (pedido del dueño del 2026-10-08): si estaba reproduciendo,
  sigue reproduciendo desde el cursor con la pista muda; si estaba en pausa, queda en pausa en el
  cursor. Lo mismo en cualquier otro cambio de modo (quitar el silencio, terminar un render, quedar
  desactualizado): sigue reproduciendo o queda en pausa, siempre desde el cursor. Como el silencio se
  guarda por proyecto (ver «Persistencia»), al volver a abrir el proyecto el visor sigue simulando
  hasta quitarlo.
- **Candado** (`Lock` / `LockOpen`): en la pista de escenas desactiva el arrastre de los límites entre
  escenas (la selección sigue funcionando); en narración y música desactiva abrir los diálogos de Audio
  y Música desde la pista (los botones de la barra siguen). Hoy es poca cosa; con la pista del avatar
  pasa a impedir mover sus clips.
- Cada botón con `aria-label` y tooltip fijos, con el nombre de la pista («Bloquear la pista Música»);
  el estado lo anuncia `aria-pressed` y se ve por color (silenciado y bloqueado en `text-coral`, activo
  normal en `text-muted-foreground`).

**Reordenar.** Con `@dnd-kit/core` + `@dnd-kit/sortable` (`SortableContext` con
`verticalListSortingStrategy`; `useSortable` por cabecera con `setActivatorNodeRef` en el asa) y
`@dnd-kit/modifiers` (`restrictToVerticalAxis`). Sensores de puntero y de teclado (la pista se mueve
con espacio + flechas, de regalo). Mientras se arrastra, la fila sube de capa con sombra y las otras se
corren; el carril acompaña el orden al soltar. Las cabeceras están fuera del contenedor con scroll, así
que el arrastre no pelea con el desplazamiento horizontal.

### 5.3 Fuera a propósito

- **Ojo** por pista: hoy la única pista visual es la de escenas y ocultarla dejaría el visor negro.
  Llega con la pista del avatar.
- **Volumen por pista**: ya existe en el diálogo de Audio.
- **Mover clips**: en Vimo las escenas van pegadas a la narración (lo que se mueve es el límite entre
  dos escenas, y un clip animado pagado mantiene su tiempo), la narración es el reloj y la música se
  ajusta por su desfase. El único clip que podrá moverse es el del avatar: llega con su sub-proyecto,
  sobre esta misma base de dnd-kit.
- **Selección múltiple** y **deshacer**: deshacer entra con el agente, cuyas ediciones tienen que
  poder revertirse.

### 5.4 Correcciones de raíz que salieron de la ejecución

Al probar las pistas aparecieron tres defectos que se arreglaron donde nacen y no en el timeline. Las
causas, las mediciones y la QA están en
[el documento del arreglo](../../fixes/2026-10-08-fix-editor-preview-mode-switch/editor-preview-mode-switch.md).

- **Atajos y asa de las pistas.** `useEditorShortcuts` ignora las teclas que otro control ya atendió
  (`event.defaultPrevented`). Sin eso, levantar y soltar una pista con el espacio también ponía play y
  pausa, y Esc además deseleccionaba la escena: el sensor de teclado de dnd-kit hace `preventDefault`
  pero no `stopPropagation`.
- **Cambio de modo del visor.** `useEditorPlayback` trata el paso entre el mp4 y la simulación
  (silenciar una pista, terminar un render, quedar desactualizado): pausa los medios que se van, deja
  el maestro nuevo en el cursor y, si estaba reproduciendo, sigue reproduciendo desde ahí apenas el
  maestro nuevo quedó en su lugar (nunca arranca en 0 para saltar); si estaba en pausa, queda en pausa
  en el cursor. Si la política de autoplay rechaza ese play (un cambio sin gesto de la persona), el
  visor también queda en pausa en el cursor. Antes quedaba «reproduciendo» sin sonido y el próximo
  play arrancaba en 0 (ya pasaba en `dev`); el primer arreglo frenaba la reproducción en cada
  cambio, y desde el 2026-10-08, a pedido del dueño, la continúa, como en VidRush.
- **Grafo de ganancia.** `useAudioGain` conecta al mismo gain cada `<audio>` nuevo que monta el visor.
  Antes solo pasaba por él el primero: tras ir y volver entre modos, la mezcla y el silencio por pista
  dejaban de aplicarse. También pasaba en `dev`.

## 6. Textos nuevos (es / en / pt, en el mismo cambio)

| Clave                                      | es                                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `layout.editorBar.volverBiblioteca`        | Volver a la biblioteca                                                                                       |
| `layout.editorBar.rutaProyecto`            | Ubicación del proyecto (aria del `nav`)                                                                      |
| `library.editor.timeline.dragTrack`        | Arrastrá para reordenar la pista {{track}}                                                                   |
| `library.editor.timeline.mute`             | Silenciar {{track}} en el visor                                                                              |
| `library.editor.timeline.lock`             | Bloquear la pista {{track}}                                                                                  |
| `library.editor.timeline.sortableRole`     | pista ordenable                                                                                              |
| `library.editor.timeline.dragInstructions` | Para reordenar, presioná espacio sobre el asa, movela con las flechas y soltala con espacio. Escape cancela. |
| `library.editor.timeline.dragStart`        | Tomaste la pista {{track}}.                                                                                  |
| `library.editor.timeline.dragOver`         | La pista {{track}} está sobre la posición de {{over}}.                                                       |
| `library.editor.timeline.dragOverNone`     | La pista {{track}} está fuera de las posiciones.                                                             |
| `library.editor.timeline.dragEnd`          | Soltaste la pista {{track}} en la posición de {{over}}.                                                      |
| `library.editor.timeline.dragEndNone`      | Soltaste la pista {{track}} donde estaba.                                                                    |
| `library.editor.timeline.dragCancel`       | Cancelaste el reordenamiento de la pista {{track}}.                                                          |
| `library.editor.previewBadgeMuted`         | Simulación: hay una pista silenciada                                                                         |

Las migas reutilizan `layout.nav.biblioteca`; el fallback de error reutiliza
`layout.editorBar.volverBiblioteca`. Ninguna clave existente cambia de significado.
`previewBadgeMuted` reemplaza a `library.editor.previewBadge` en la insignia del visor solo cuando un
silencio fuerza la simulación (§5.2).

`{{track}}` y `{{over}}` son los nombres traducidos de las pistas (`library.editor.timeline.scenes`,
`narration`, `music`). Las etiquetas del asa, de silenciar y del candado son fijas y llevan el nombre de
la pista: el estado (silenciada, bloqueada) lo anuncia `aria-pressed`. `sortableRole`,
`dragInstructions` y los anuncios `drag*` son lo que dnd-kit le dice al lector de pantalla (prop
`accessibility` del `DndContext` y `attributes.roleDescription` de `useSortable`). Apenas se toma una
pista, dnd-kit la informa sobre su propia posición: eso no se anuncia, para que se oiga `dragStart`
(volver al lugar de partida tampoco; lo cubre el aviso al soltar). `dragEndNone` se usa al soltar la
pista donde estaba (dnd-kit siempre encuentra una pista debajo) o sin pista debajo; `dragOverNone`,
solo en ese último caso.

## 7. Dependencias nuevas

`@dnd-kit/core`, `@dnd-kit/sortable` y `@dnd-kit/modifiers` (las tres MIT, del mismo repositorio;
licencia verificada en [library-research.md](library-research.md) §5). Se instalan con `pnpm add` en el
commit del timeline y su aviso de licencia entra en la pantalla de licencias de terceros cuando exista.
Nada más.

## 8. Verificación

- `pnpm format`, `pnpm lint` y `pnpm build` en verde en cada commit.
- Greps:
  - `grep -rn "'/library" src --include='*.tsx'` → vacío (ninguna ruta literal nueva).
  - `grep -rn "@/modules/videos/components\|@/modules/videos/hooks" src/layouts` → vacío (el layout no
    importa internals del módulo).
  - `grep -rn "layouts/AuthenticatedLayout/components/ErrorBoundary" src` → vacío (vive en common).
  - Las catorce claves nuevas presentes en `es.json`, `en.json` y `pt.json` (`pnpm check:locales`).
- Manual, en la app (`pnpm tauri dev`), en tema claro y oscuro y en los tres idiomas:
  1. Biblioteca → tarjeta de un proyecto → el editor abre sin sidebar; la barra muestra las migas y los
     cuatro botones; el visor y el timeline usan todo el ancho.
  2. Hover y foco sobre el cohete: aparece el fondo, se dibuja la casita, el tooltip dice «Volver a la
     biblioteca»; clic → Biblioteca.
  3. Las migas: «Biblioteca» navega; el nombre largo se trunca.
  4. Música, Audio, Exportar clips y Renderizar funcionan igual que antes desde la barra; con un job
     en curso, `busy` deshabilita lo que corresponde.
  5. Tema e idioma cambian desde la barra y se mantienen al volver a la Biblioteca.
  6. Borrador sin escenas: barra + tarjeta «Generar video». Proyecto generándose: redirige al progreso
     como hoy.
  7. Rueda vertical sobre el timeline: se desplaza en horizontal, en la dirección del sistema;
     Cmd/Ctrl + rueda sigue haciendo zoom; el trackpad horizontal sigue igual.
  8. Arrastrar la música arriba de la narración desde el asa; recargar el proyecto: el orden se
     conserva; otro proyecto no se ve afectado.
  9. Silenciar la música: el visor deja de reproducirla (con render vigente, simula con la insignia
     «Simulación: hay una pista silenciada»); renderizar: el video final la trae con su volumen. Lo
     mismo con la narración.
  10. Bloquear escenas: los límites no se arrastran; desbloquear: vuelven.
  11. Forzar un error de render en la vista (en desarrollo): el fallback muestra «Volver a la
      biblioteca» y funciona.
  12. Windows (WebView2): puntos 1, 7 y 8, porque el arrastre y la rueda son lo más sensible al
      webview.

## 9. Riesgos y cómo se cubren

- **El hueco del portal no existe en el primer render** de la vista: `SlotPortal` lo busca en un efecto
  y pinta recién cuando lo encuentra; la barra se monta antes que el `<Outlet/>`, así que en la práctica
  está en el primer efecto.
- **`wheel` pasivo:** React registra `wheel` como pasivo y `preventDefault` no funcionaría; se usa el
  listener nativo con `{ passive: false }` que ya existe.
- **`localStorage` puede fallar o estar vacío** (perfil limpio, modo privado): lectura y escritura con
  `try/catch` y default completo.
- **Dos layouts con `data-theme`:** cada layout lo pone en su raíz; el `ThemeProvider` sigue siendo
  uno solo, así que no hay dos fuentes de verdad.
- **Mover `ErrorBoundary` a `common`** toca el `AuthenticatedLayout`: cambio de import, sin cambio de
  comportamiento, cubierto por el build y por el punto 11 de la verificación.
- **Arrastre en WebView2:** dnd-kit usa eventos de puntero, no el drag and drop de HTML5, así que no
  depende de `dragDropEnabled` (ver la investigación §5).

## 10. Commits previstos

Cada uno deja el repo verde:

La ADR-0056 y este documento ya están commiteados aparte (`56ac8f92`); el plan de implementación
(`plan.md` (interno)) detalla cada uno.

1. `refactor: share the theme toggle, language menu and error boundary across layouts` — extracciones a
   `common`, sin cambio visible.
2. `feat: open the project editor full screen in its own layout` — `EditorLayout`, barra con la casita
   (`DoodleHome`, `HomeButton`) y sus dos huecos vacíos, rutas, clave de i18n del botón, árbol de
   layouts en `ARCHITECTURE.md`.
3. `feat: move the editor title and actions into the full-screen bar` — `SlotPortal`,
   `EditorBarTitle`, la vista pinta migas y acciones en la barra en todos sus estados.
4. `feat: scroll the timeline horizontally with the mouse wheel`.
5. `feat: remember the timeline track layout per project` — tipos, constantes, utilidad con su guard
   en `scripts/test/`, hook.
6. `feat: add timeline track headers with reorder, mute and lock` — dependencias dnd-kit, cabeceras,
   silencio solo en el visor, candado, claves de i18n.
