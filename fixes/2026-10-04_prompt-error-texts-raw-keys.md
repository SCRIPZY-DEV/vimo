# Fix: los errores de los prompts se mostraban como la clave cruda

- **Fecha:** 2026-10-04
- **Rama:** feat/creador-estilo-ia-sobre-catalogo

## Causa

En la app de prueba, un video detenido en «Validando prompts» mostraba «Algo salió mal ·
create.errors.scenePromptAlignmentFailed» en vez del texto. Lo mismo habría pasado con
`catalog_prompts_incomplete` y `catalog_prompt_pending_image`.

El PR #91 (`c007e008`) agregó esas tres claves al grupo `music.errores` de los catálogos, y la app
las busca en `create.errors` (`src/modules/videos/constants.ts`). En `dev`, el PR #92 las sumó
después a `create.errors`. Esta rama parte de la rama del catálogo, que parte de `c007e008`, y no
tiene ese arreglo.

## Corrección

Las tres claves se copian a `create.errors` de `public/locales/{es,en,pt}.json` con el mismo texto
y en el mismo lugar que en `origin/dev` (después de `llmProviderError`). Así se ven bien en la app de
prueba y, al integrar `dev`, las dos versiones coinciden.

## Límites deliberados

- No se borran las copias viejas de `music.errores`: en `dev` también siguen ahí y nadie las usa.
- El texto de `scenePromptAlignmentFailed` es el de `dev` hoy. La rama `fix/remove-narrative-reviewer`
  lo cambia al retirar la revisión narrativa; se ajusta acá cuando se integre.
- La rama del catálogo (`feat/catalogo-estilos`) tiene el mismo defecto y no se toca acá.

## Validación reproducible

- `pnpm check:locales`: los tres catálogos con las mismas claves.
- Las tres claves que usa `constants.ts` existen ahora en `create.errors` de los tres idiomas:

```
node -e "for (const l of ['es','en','pt']) { const e = require('./public/locales/' + l + '.json').create.errors; console.log(l, ['catalogPromptsIncomplete','scenePromptAlignmentFailed','catalogPromptPendingImage'].every((k) => typeof e[k] === 'string')) }"
```

- `pnpm format`, `pnpm lint` y `pnpm build` pasan.

## Pruebas manuales

- Pendiente del dueño: con el build de prueba nuevo, un video que se detenga en los prompts muestra
  el texto y no la clave.
