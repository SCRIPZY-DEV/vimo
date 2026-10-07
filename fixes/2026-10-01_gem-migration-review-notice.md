# Fix: la migración automática de una gema vieja se puede revisar

- **Fecha:** 2026-10-01
- **Rama:** feat/catalogo-estilos

## Causa

Con el interruptor `gemTemplate` encendido, una gema vieja (sin secciones) se manda sola al agente
reconstructor la primera vez que se abre en el modal o se elige en Crear (spec §4.4). La migración
guardaba las secciones nuevas sin que la persona las viera:

- `migrationStyleSavePayload` (`src/modules/videos/utilities/gemTemplate.ts`) descartaba los
  `warnings` del agente, y el store de migraciones (`gemMigrations.ts`) borraba el estado al terminar
  bien, sin dejar rastro.
- El modal que se vuelve a sembrar por secciones arrancaba sin avisos.
- El texto original quedaba guardado como `sourcePrompt`, pero ninguna pantalla lo mostraba
  (`customStyleDraftFrom` no lo pasaba al borrador).
- Crear cambiaba el snapshot elegido por las secciones escritas por la IA: el próximo video podía ser
  el primer contacto de la persona con la gema reescrita. La ADR-0048 decía que el autor «ve las
  secciones y los avisos del agente antes de guardar», y eso no pasaba en este camino.

## Corrección

- **Store** (`gemMigrations.ts`, `types/styles.ts`): `migrateStoredGem` devuelve
  `{ status: 'migrated', warnings }` o `{ status: 'deleted' }`. Una migración que sale bien queda
  como estado `migrated`, con el nombre y los avisos del agente, en memoria de la sesión, hasta que
  se descarta con `dismiss(styleId)`. `dismiss` no toca una migración en vuelo ni una fallida. La
  gema sigue sin volver a migrarse en la sesión.
- **Galería** (`CustomStyleGallery.tsx`, `GemMigrationNotice.tsx`): donde ya estaban los avisos de
  migración, una gema migrada muestra «Actualizamos «X» a la plantilla de Vimo», el pedido de
  revisar las secciones (y, si el agente dejó avisos, que se ven al abrir el estilo), el botón
  «Revisar secciones» (abre el modal) y una X para descartar.
- **Modal** (`CustomStyleModal.tsx`, `GemAgentWarnings.tsx`): con la gema migrada, el
  `GemAgentWarnings` de siempre muestra los avisos de la migración con la línea de revisar las
  secciones (aunque el agente no haya avisado nada) y una X para descartar. Si la persona prepara
  otra gema con «Pegar gema nueva», el aviso de la migración se descarta solo y se ven los avisos
  nuevos.
- **Texto original** (`GemSourceText.tsx`, `useGemTemplateDraft.ts`, `selectedCustomStyle.ts`): el
  borrador trae el `sourcePrompt` guardado y el modal lo muestra, plegado y solo de lectura, en la
  caja «Texto original» debajo de las secciones. Si en esta apertura se preparó otra gema, muestra
  ese texto, que es el que se va a guardar como respaldo.
- Textos nuevos en `public/locales/{es,en,pt}.json` (`create.gemTemplate.*`).
- La ADR-0048 corrige la frase que daba la revisión por hecha y cuenta el aviso.

## Límites deliberados

- Los avisos de una migración viven en memoria de la sesión: no se guardan en `style.json`. Al
  reiniciar la app se pierden, pero el «Texto original» sigue disponible en el modal.
- Con el interruptor apagado no cambia nada: ni avisos de migración ni la caja «Texto original»
  (spec §7: «sin él, todo queda como hoy»). Una gema de plantilla con el interruptor apagado se
  sigue editando como antes, sin la caja.
- El texto original no se puede editar ni «restaurar» con un botón: se copia o se vuelve a pegar con
  «Pegar gema nueva». El payload de style-save no cambia (el `sourcePrompt` guardado nunca se
  reenvía).
- El aviso muestra el nombre de la gema al empezar la migración (como los avisos de en curso y
  fallida).

## Validación reproducible

```bash
node --test scripts/test/check-app-gem-migration.mjs
node scripts/test/check-locales.mjs
pnpm exec tsc -p tsconfig.app.json --noEmit
pnpm exec eslint src/modules/videos
```

El guard suma casos para el estado `migrated` con y sin avisos, `dismiss` (borra y avisa una vez;
no toca una migración en vuelo ni una fallida; la gema no vuelve a migrarse), el resultado de
`migrateStoredGem` con los avisos y el borrador del modal con el respaldo.

## Pruebas manuales

Ninguna en la app todavía: hace falta una cuenta con `gemTemplate` y una gema vieja. Queda en la QA
manual de la Entrega 1: elegir una gema vieja en Crear y ver el aviso de la galería; abrirla con
«Revisar secciones» y ver los avisos, la línea de revisar y «Texto original»; descartar el aviso en
el modal y comprobar que también desaparece de la galería.
