# Fix: el error de guardado se ve también en «Pegar gema nueva»

- **Fecha:** 2026-09-30
- **Rama:** feat/catalogo-estilos

## Causa

En el modal de Mi estilo por secciones (`src/modules/videos/components/CustomStyleModal.tsx`), «Pegar
gema nueva» muestra el paso de pegado mientras las secciones de antes siguen en el borrador. Al
cerrar el modal desde ese paso, se guardan esas secciones con `style-save`. Si ese guardado fallaba
(sidecar caído o error de disco), el modal quedaba abierto, como corresponde, pero el mensaje de
error (`saveErrorKey`) solo se dibujaba en la vista de secciones. En el paso de pegado, la X y Escape
no hacían nada y no aparecía ninguna explicación.

## Corrección

En la rama del paso de pegado, `GemPasteStep` y el mismo `ErrorMessage` con `saveErrorKey` que usa
la vista de secciones van juntos dentro de un `div` con `space-y-3`. Si el guardado al cerrar falla,
el error aparece debajo del paso de pegado.

## Límites deliberados

- No se cambia qué se guarda al cerrar ni cuándo: solo se muestra el error que ya existía.
- No se agregan claves de texto: es la misma clave de error de guardado del modal.

## Validación reproducible

```bash
pnpm exec tsc -p tsconfig.app.json --noEmit
pnpm exec eslint src/modules/videos/components/CustomStyleModal.tsx
```

Las dos terminan sin errores. Lo encontró la revisión de la Tarea C4c y se aplicó en la Tarea C5,
que vuelve a tocar el modal.

## Pruebas manuales

Ninguna en la app todavía: hace falta forzar un fallo de `style-save` (por ejemplo, con el sidecar
detenido) con el interruptor `gemTemplate` encendido. Queda en la QA manual de la Entrega 1 (paso B
del plan de la app).
