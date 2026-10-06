# Fix: el modal de Mi estilo no atrapa con una sección fuera de límite, y el final fijo llega a 1 000

- **Fecha:** 2026-10-06
- **Rama:** feat/catalogo-remoto

## Causa

Dos causas que se juntaron en la QA del dueño del 2026-10-06 con dos estilos clonados con IA
(«Topi finally make sense» y otro): el editor de Mi estilo mostraba «Final fijo de cada imagen
687 / 600» (y 793 / 600) en rojo y no dejaba salir sin borrar caracteres.

1. **Dos límites distintos para la misma sección.** El creador de estilo con IA (`vimo-landing`,
   `creador-estilo/respuesta.ts`) escribe `promptEnd` con la ficha de estilo completa, hasta 900
   caracteres (`LIMITE_FRASE_CIERRE`), y su rama de VIMO-TAURI (`feat/creador-estilo-ia-sobre-catalogo`,
   ADR-0050) subió el tope del final fijo a 1 000 en el sidecar (`PROMPT_END_CHAR_LIMIT`) y en la app
   (`GEM_SECTION_LIMITS.promptEnd`). Esta rama todavía tenía 600 en los dos, y el servidor del
   reconstructor (que es también el esquema de secciones del catálogo) tiene 600 en producción.
2. **Cerrar siempre guardaba.** `CustomStyleModal.close()` llamaba a `persist()` aunque no hubiera
   cambios; el sidecar rechazaba la gema por el `promptEnd` fuera de límite (`assertGemSections`) y
   el modal se quedaba abierto con el error: no había forma de salir sin recortar.

## Corrección

- `pipeline/commands/styles/style-store.ts` y `src/modules/videos/utilities/gemTemplate.ts`: el
  final fijo acepta 1 000 (`PROMPT_END_CHAR_LIMIT`); el inicio sigue en 600. El texto es el mismo
  que el de la rama del creador, para que su merge posterior no choque.
- `src/modules/videos/components/CustomStyleModal.tsx`: cerrar guarda solo si algo cambió respecto
  de lo abierto (nombre, texto y planos o secciones, y personaje, comparados como texto); sin cambios
  cierra sin tocar el sidecar. Si el guardado falla, un `confirm` nativo ofrece salir sin guardar
  (`create.customStyles.discardChangesConfirm`, en es/en/pt); el porqué sigue a la vista.
- `vimo-landing` (PR #19, commit `1e657b5`, mergeado a `main` el 2026-10-06 como `cbc468f` y
  desplegado en vimo.click): `LIMITE_FRASE_FINAL = 1_000` para `promptEnd` en
  `reconstructor/esquema.ts` e instrucciones del modelo con los dos topes; el catálogo
  (`catalogo/contenido.ts`) lo hereda.
- Guards y docs: `check-gem-sections-store.mjs` (tope 1 000 y una gema con el cierre de 1 000 se
  guarda), `check-app-gem-sections.mjs`, `check-app-gem-rebuild.mjs`, `check-gem-project-snapshot.mjs`,
  `check-catalog-sync.mjs`; ADR-0049 (límites).

## Límites deliberados

- `promptStart` sigue en 600: el creador no lo alarga y el presupuesto del prompt final (2 106
  caracteres: escena, identidad hasta 700 y cierre hasta 1 000) no da para más.
- La ADR-0048 (tabla de límites) la actualiza la rama del creador en su propio commit; acá no se
  toca para no chocar en el merge.
- Un estilo con una sección fuera de límite por otro motivo se abre y se cierra sin quedar atrapado,
  pero para guardarle otros cambios hay que ponerla dentro del límite: el contador en rojo lo dice.

## Validación reproducible

```
pnpm format:check && pnpm lint && pnpm build && pnpm check:locales
node --experimental-strip-types scripts/test/check-gem-sections-store.mjs     # 31
node --experimental-strip-types scripts/test/check-app-gem-sections.mjs       # 12
node --experimental-strip-types scripts/test/check-app-gem-rebuild.mjs        # 9
node --experimental-strip-types scripts/test/check-gem-project-snapshot.mjs   # 29
node --experimental-strip-types scripts/test/check-catalog-sync.mjs           # 73
```

En `vimo-landing`: `pnpm test` (1335) y `wrangler pages functions build`.

## Pruebas manuales

- Pendientes del dueño con la app de prueba `0.9.3-catalogo.6`: abrir «Topi finally make sense»
  (793 caracteres en el final fijo) y cerrar con «Listo» sin tocar nada; editar el nombre y cerrar
  (guarda); el contador del final fijo muestra `793 / 1,000` en gris.
