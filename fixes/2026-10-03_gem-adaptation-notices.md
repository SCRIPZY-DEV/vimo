# Fix: los avisos de una gema adaptada se van solos y la tarjeta lo dice

- **Fecha:** 2026-10-03
- **Rama:** feat/catalogo-estilos

## Causa

Cuando una gema termina de adaptarse a la ficha de Vimo, la app lo cuenta en dos lugares, y los dos
quedaban hasta que la persona tocaba la X:

- el aviso «Adaptamos «X» a la ficha de Vimo» de la pestaña Mi estilo. El estado `migrated` vive en
  un store de la sesión (`gemMigrations.ts`) y nada lo limpiaba al cambiar de pestaña, así que el
  aviso volvía a estar ahí en cada visita;
- el aviso «Lo que la IA ajustó de tu gema» dentro del modal de la gema.

Y descartados los dos, nada decía ya que esa gema estaba adaptada.

Pedidos del dueño en la QA del 2026-10-03: el aviso de la pestaña tiene que salir, pero quitarse al
pasar a otra pestaña; el del modal se cierra solo «en unos segundos o un minuto» si no se toca la X;
y la tarjeta de una gema adaptada lo dice con una etiqueta.

## Corrección

- **El aviso de la galería dura una visita a la pestaña.**
  - Store (`utilities/gemMigrations.ts`, `types/styles.ts`): `beginVisit()` numera las visitas,
    `markSeen(ids, visita)` anota en el estado `migrated` en qué visita se vio el aviso por primera
    vez (`seenInVisit`) y la función pura `showsGalleryNotice(migración, visita)` decide si se
    muestra: en la visita en que se vio y, si todavía nadie lo vio (terminó con la galería cerrada),
    en la siguiente. Una fallida se sigue avisando siempre; una en vuelo va en su tarjeta.
  - Galería (`CustomStyleGallery.tsx`, `hooks/useGemMigrations.ts`): pide una visita al montarse,
    filtra los avisos con `showsGalleryNotice` y le marca al store los que tiene a la vista.
  - Se hizo por visitas y no «descartar al desmontar» porque en desarrollo `StrictMode` desmonta y
    vuelve a montar los efectos de un componente recién montado: un descarte en la limpieza
    borraría el aviso antes de que se vea, y solo en `pnpm tauri dev`.
  - El estado no se borra al ocultar el aviso: el modal de la gema sigue mostrando lo que ajustó la
    IA.
- **El aviso del modal se cierra solo** (`GemAgentWarnings.tsx`): a los 60 s
  (`GEM_WARNINGS_AUTO_DISMISS_MS`, `constants.ts`) llama al mismo descarte que la X. El reloj corre
  desde que el aviso aparece y no se reinicia con los renders del modal (`useEffectEvent`).
- **Etiqueta en la tarjeta** (`CustomStyleCard.tsx`): «Gema adaptada», en la línea de los
  caracteres, para las gemas con secciones y con el respaldo del texto del que salieron
  (`isAdaptedGem`, `utilities/gemTemplate.ts`). Texto `create.customStyles.adaptedTag` en los tres
  idiomas.

## Límites deliberados

- Una visita es un montaje de la galería: también cuenta volver a Crear desde otra vista o después
  de generar un video.
- El aviso de una adaptación fallida no se oculta: la gema sigue como estaba y hay que reintentar.
- Los 60 s corren con el aviso a la vista. Si el modal se cierra antes, el aviso vuelve a salir la
  próxima vez que se abre, con el reloj desde cero. No se pausa al pasar el mouse.
- La etiqueta no la lleva una copia del catálogo (tiene secciones pero no salió de ningún texto; ya
  dice «Basado en …») ni una gema vieja, que se adapta la primera vez que se abre o se elige.
- Los avisos siguen sin guardarse en disco: al reiniciar la app se pierden, como antes. La etiqueta
  sale de la gema guardada y no depende de la sesión.

## Validación reproducible

```bash
node --test scripts/test/check-app-gem-migration.mjs scripts/test/check-app-gem-sections.mjs
node scripts/test/check-locales.mjs
pnpm format:check
pnpm lint
pnpm build
```

`check-app-gem-migration.mjs` suma cinco casos de las visitas (el aviso se ve en la visita en que
aparece y no en la siguiente, con los avisos del agente intactos; uno que terminó con la galería
cerrada espera a la próxima; la visita anotada no se pisa y marcar lo ya marcado no avisa a nadie;
en vuelo no hay aviso y una fallida se avisa siempre; una gema que se vuelve a adaptar estrena
aviso). `check-app-gem-sections.mjs` suma el de `isAdaptedGem`.

## Pruebas manuales

Con el formulario real de Crear montado en Chrome sin interfaz, dentro de `StrictMode` (como
`pnpm tauri dev`), con la API y el agente simulados:

- al terminar la adaptación sale el aviso en la galería y la tarjeta ya lleva la etiqueta;
- ir a Catálogo y volver: el aviso ya no está;
- el modal de esa gema sigue mostrando «Lo que la IA ajustó de tu gema», a mitad del plazo sigue
  ahí y al vencer se cierra solo (con las esperas largas acortadas veinte veces: 3 s en vez de 60);
- una adaptación que termina con la galería cerrada se avisa al volver, y la X la descarta;
- de tres tarjetas (una vieja, una adaptada y una copia del catálogo), solo la adaptada lleva la
  etiqueta.

Falta el recorrido del dueño en `pnpm tauri dev`, con el agente real y el minuto real.
