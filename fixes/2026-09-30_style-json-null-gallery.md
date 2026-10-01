# Fix: un `style.json` con `null` tumbaba la galería de «Mi estilo»

- **Fecha:** 2026-09-30
- **Rama:** feat/catalogo-estilos

## Causa

`readStyleEntry` (`pipeline/commands/styles/style-store.ts`) envolvía en `try/catch` solo el
`JSON.parse` del archivo y después leía sus campos (`stored.name`). `JSON.parse('null')` no lanza:
devuelve `null`, que pasaba el `catch` y hacía fallar el acceso al campo con un `TypeError`. Como
`styles-list` no atrapa errores por gema, un solo `style.json` con el contenido `null` (editado a
mano o escrito a medias) dejaba a toda la galería sin cargar. El hueco ya estaba en `dev`.

## Corrección

`readStyleEntry` descarta cualquier raíz JSON que no sea un objeto y devuelve `null` para esa gema,
igual que con un JSON roto: la galería sigue mostrando las demás. Va dentro de la Tarea A1 del plan
del sidecar (almacén de estilos con secciones), que reescribe ese lector.

## Límites deliberados

- No se cambia `styles-list`: el contrato sigue siendo que `readStyleEntry` nunca lanza por el
  contenido de un archivo.
- No se repara el archivo en disco: la gema ilegible queda fuera de la lista hasta que se vuelva a
  guardar.

## Validación reproducible

```bash
node --test scripts/test/check-gem-sections-store.mjs
```

El caso «a style.json that is valid JSON but not an object is skipped without breaking the list»
escribe tres gemas con raíz `null`, `[]` y `42` junto a una válida, y verifica que la lista trae
solo la válida y que `readStyleEntry` devuelve `null` para la rota. Resultado al commitear: 30 de 30
en verde.

## Pruebas manuales

Ninguna en la app: el cambio es del lector del sidecar y lo cubre el guard con disco temporal.
