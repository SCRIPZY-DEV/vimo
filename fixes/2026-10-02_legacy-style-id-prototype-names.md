# Fix: nombres del prototipo aceptados como ids heredados del catálogo

- **Fecha:** 2026-10-02
- **Rama:** feat/catalogo-estilos

## Causa

`isCharacterStyleId` (`pipeline/prompts/visual-styles.ts`) decidía si un id era uno de los 5
estilos heredados con `value in VISUAL_STYLES`. El operador `in` también encuentra las propiedades
heredadas de `Object.prototype`, así que `constructor`, `toString` o `valueOf` pasaban por ids del
catálogo: `create-video-project` aceptaba `options.styleId: 'constructor'` y
`generate-character-preview` lo mandaba por la plantilla fija, donde `VISUAL_STYLES['constructor']`
es la función `Object` y no un estilo (y `assembleUserScenePrompt` fallaba al leer `template`). Lo
encontró el agente del frente A de la Entrega 2 del catálogo mientras escribía la coherencia del
proyecto (`isLegacyCatalogStyleId` ya usaba la propiedad propia; `isCatalogStyleId` también desde la
Entrega 1).

## Corrección

`isCharacterStyleId` busca la propiedad **propia** (`Object.hasOwn(VISUAL_STYLES, value)`). Para los 5
ids reales el resultado es el mismo; los nombres del prototipo dejan de ser ids. Con eso:

- `create-video-project` rechaza `options.styleId: 'constructor'` con `unknown styleId "constructor"`.
- `generate-character-preview` lo trata como un id de galería (cumple `STYLE_ID_PATTERN`), no lo
  encuentra ni en el catálogo ni en `_styles/` y responde `style_not_found`, sin llamar al LLM.

## Límites deliberados

- No se cambió `isPreviewStyleKey`: un nombre del prototipo sigue siendo una clave de preview con
  forma válida (patrón de la galería), lo que importa es que ya no resuelve a un estilo heredado.
- No se revisaron otros `in` del pipeline fuera de este camino.

## Validación reproducible

```bash
node --test scripts/test/check-gem-project-snapshot.mjs scripts/test/check-catalog-preview.mjs
```

Casos que lo fijan: «create-video-project rejects an inherited object property as options.styleId»
(`check-gem-project-snapshot.mjs`) y `constructor` → `style_not_found` sin LLM en «a gallery id still
reads \_styles, and an unknown id is style_not_found» (`check-catalog-preview.mjs`). Antes del cambio,
el primero aceptaba el proyecto y el segundo fallaba por `VISUAL_STYLES['constructor'].template`.

## Pruebas manuales

Ninguna: el id llega del webview y la app nunca manda esos nombres; el cambio solo cierra la puerta
a un payload mal formado. Los 5 estilos del catálogo viejo siguen resolviendo igual (los guards
`check-catalog-prompts.mjs` y `check-preview-regressions.mjs` siguen en verde).
