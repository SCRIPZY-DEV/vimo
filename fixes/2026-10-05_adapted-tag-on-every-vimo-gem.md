# Fix: la etiqueta «Gema adaptada» sale en toda gema que ya está en la ficha de Vimo

- **Fecha:** 2026-10-05
- **Rama:** feat/creador-estilo-ia-sobre-catalogo

## Causa

La tarjeta de un estilo en Mi estilo mostraba «Gema adaptada» solo si la gema tenía secciones **y**
el texto del que se adaptó (`sourcePrompt`). Un estilo clonado con IA y una copia del catálogo
tienen secciones, pero no salieron de un texto pegado, así que quedaban sin la etiqueta. En la QA
del 2026-10-05, el dueño vio que al lado de las adaptadas una gema clonada con IA parecía tener
algo mal.

## Corrección

- `src/modules/videos/utilities/gemTemplate.ts`: `isAdaptedGem` es verdadero para toda gema con
  secciones, venga de donde venga.
- `CustomStyleCard.tsx` no cambia: la tarjeta sigue preguntándole a `isAdaptedGem`.
- Docs: la frase de la etiqueta en la ADR-0048 e índice de guards.

## Límites deliberados

- Una gema vieja (texto sin secciones) sigue sin etiqueta hasta que se adapte, la primera vez que
  se abre o se elige.
- La etiqueta no dice de dónde vino la gema: eso lo dice la línea de origen de la tarjeta
  («Basado en …», «Clonado con IA de …»).
- El aviso «Adaptamos …» de la galería no cambia: sale solo cuando Vimo adapta una gema vieja.

## Validación reproducible

- `node --test scripts/test/check-app-gem-sections.mjs`: el caso de la etiqueta exige que una
  gema clonada con IA y una copia del catálogo cuenten como adaptadas, y que una gema vieja no.
  Falló con la regla anterior (la clonada daba «no adaptada») y pasa: 12 de 12.
- `pnpm format`, `pnpm lint` y `pnpm build` pasan.

## Pruebas manuales

Pendiente del dueño en la próxima app de prueba: en Mi estilo, un estilo clonado con IA y una copia
del catálogo muestran «Gema adaptada» en su tarjeta, igual que una gema adaptada.
