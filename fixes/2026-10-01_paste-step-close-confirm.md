# Fix: cerrar «Pegá tu gema» con texto pegado pregunta antes de tirarlo

- **Fecha:** 2026-10-01
- **Rama:** feat/catalogo-estilos

## Causa

En el modal de Mi estilo (`src/modules/videos/components/CustomStyleModal.tsx`), una gema nueva por
plantilla arranca en «Pegá tu gema» y no tiene secciones que guardar hasta que pasa por «Preparar
con IA». Cerrar el modal (la X, Escape o un clic afuera) llamaba a `onClose` sin más, así que un
clic perdido fuera del diálogo tiraba una gema larga pegada sin avisar.

## Corrección

`close` pregunta con `window.confirm` (el mismo patrón nativo de «Pegar gema nueva», nunca otro
modal Radix encima) cuando el modal está en «Pegá tu gema», la caja tiene texto y no hay estilo que
guardar (`dropsPastedText`). Cancelar deja el modal abierto con lo pegado; aceptar lo cierra como
antes. Texto nuevo `create.gemTemplate.discardPasteConfirm` en los tres catálogos.

## Límites deliberados

- Solo para la gema sin secciones (una nueva): al reemplazar una gema que ya tiene secciones, cerrar
  desde el paso de pegado sigue guardando las secciones de antes, como hoy.
- Con la IA preparando la gema el modal sigue sin cerrarse, y durante una migración se cierra sin
  preguntar, como antes.

## Validación reproducible

```bash
node scripts/test/check-locales.mjs
pnpm exec tsc -p tsconfig.app.json --noEmit
pnpm exec eslint src/modules/videos/components/CustomStyleModal.tsx
```

Es lógica del componente (con `window.confirm`), sin módulo puro que probar con Node.

## Pruebas manuales

Ninguna en la app todavía. Queda en la QA manual de la Entrega 1: con `gemTemplate`, «Crear
estilo», pegar texto y cerrar con la X, con Escape y con un clic afuera; cancelar mantiene el modal
con el texto y aceptar lo cierra. Con la caja vacía se cierra sin preguntar.
