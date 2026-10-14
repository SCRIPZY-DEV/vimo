# Estilos y personajes que «desaparecen»

- **Fecha:** 2026-10-13
- **Área:** pipeline (estilos, personajes) / app (Mi estilo, diagnóstico)
- **ADR relacionadas:** [ADR-0038](../../adr/ADR-0038-logs-de-diagnostico-por-ejecucion-en-supabase.md) (enmienda 2026-10-13), [ADR-0037](../../adr/ADR-0037-permiso-en-runtime-sobre-la-carpeta-de-proyectos.md)

## Síntoma

Usuarios reportan que los estilos de «Mi estilo» o los personajes de la biblioteca se les
pierden después de crearlos.

## Causa

Ningún código borra un estilo ni un personaje fuera de «Eliminar». Lo que pasa es que la
app **deja de mostrarlos sin avisar**, aunque sigan en disco:

1. **Carpeta de proyectos ilegible = lista vacía.** `styles-list` y `characters-list`
   devolvían `[]` ante cualquier error de `readdir`: un disco desconectado, una carpeta
   movida o un permiso perdido se veían igual que «todavía no creaste nada».
2. **Metadata del personaje no atómica.** `metadata.json` se escribía con `writeFile`
   directo (el `style.json` ya usaba `writeFileAtomic`). Si la app se cerraba a mitad de
   escritura, el JSON quedaba truncado y el personaje se dejaba de listar.
3. **Sin rastro.** Toda entrada ilegible se salteaba en silencio, y como los listados son
   subcomandos silenciosos (ADR-0038), una corrida que termina bien no dejaba fila en
   `diagnostic_logs`.
4. **«Mi estilo» tapaba el error.** `useCustomStyles` no leía el error de la query: un
   listado fallido se veía como galería vacía.

## Corrección

- `pipeline/utils/library-directory.ts`: `readLibraryDirectory` falla con
  `projects_root_unavailable` si la carpeta de proyectos no existe, no es carpeta o no se
  deja leer, o si la subcarpeta existe pero no se puede leer. Si solo falta `_styles/` o
  `characters/`, es el primer uso y la lista sale vacía. Los mensajes llevan el código del
  sistema, nunca la ruta.
- `styles-list` y `listCharacterEntries` emiten `skipped <style|character> "<id>": <motivo>`
  por cada entrada salteada (`jsonFileProblem`: código del sistema, `invalid_json`,
  `invalid_content`; o `photo_missing`).
- `writeCharacterMetadata` usa `writeFileAtomic` (cubre crear, editar y el personaje de un
  estilo clonado).
- Rust: `is_worth_recording` también registra un subcomando silencioso con un `log`
  warn/error (`has_warning`). `ensure_default_projects_root` crea `~/Documents/Vimo` al
  arrancar cuando es la carpeta en uso: si no, un primer uso con la carpeta por defecto
  todavía sin crear mostraría el aviso. La carpeta elegida en Ajustes no se recrea.
- UI: `projects_root_unavailable` → `create.errors.projectsRootUnavailable` y
  `characters.errors.projectsRootUnavailable` (es/en/pt). «Mi estilo» muestra el error del
  listado con un `Alert`; Personajes ya mostraba su `errorKey`.

## Archivos tocados

- `pipeline/utils/library-directory.ts` (nuevo)
- `pipeline/commands/styles/styles-list.ts`
- `pipeline/commands/characters/character-library.ts`, `characters-list.ts`
- `src-tauri/src/diagnostics/report.rs` y `tests/report.rs`
- `src-tauri/src/settings/projects_root.rs` y `tests/projects_root.rs` (nuevo), `src-tauri/src/lib.rs`
- `src/modules/videos/hooks/useCustomStyles.ts`, `components/CustomStyleGallery.tsx`, `constants.ts`
- `src/modules/characters/constants.ts`
- `public/locales/{es,en,pt}.json`
- `scripts/test/check-library-listing.mjs` (nuevo), `scripts/test/README.md`

## QA

- `node --test scripts/test/check-library-listing.mjs`: 10/10.
- Guards vecinos verdes: `check-gem-sections-store` (35), `check-catalog-copy` (49),
  `check-style-clone-save` (34), `check-character-profile` (24).
- `pnpm test:tauri`: 59/59. `pnpm format`, `pnpm lint`, `pnpm check:locales` y `pnpm build`
  en verde.
- **Manual (pendiente):** en Ajustes, elegir una carpeta, crear un estilo y un personaje,
  cerrar la app y renombrar la carpeta. Al volver a abrir, «Mi estilo» y Personajes tienen
  que mostrar el aviso en vez de una lista vacía. Truncar a mano un `metadata.json` y
  confirmar que el personaje falta y que aparece una fila `characters-list` con
  `skipped character "<id>": invalid_json` en el panel de diagnósticos.

## Fuera de alcance

La biblioteca de videos (`list-video-projects`) todavía lista vacío si la carpeta no se
puede leer.
