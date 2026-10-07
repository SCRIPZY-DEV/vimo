# Fix: el modal de Mi estilo ya no ofrece «Pegar gema nueva»

- **Fecha:** 2026-10-03
- **Rama:** feat/catalogo-estilos

## Causa

Una gema de plantilla mostraba, debajo de sus secciones, el botón «Pegar gema nueva — Reemplaza todas
las secciones por las de otra gema» (decisión B2 de la ADR-0048). Duplicaba a «Crear estilo» y iba
contra la idea de la ficha: una gema ya adaptada se ajusta sección por sección.

Pedido del dueño en la QA del 2026-10-03: «no debería estar, porque para eso está Crear estilo… si
el usuario quiere modificar algo, debe modificar las secciones en específico».

## Corrección

- `CustomStyleModal.tsx`: se quitan el botón, su texto de ayuda, la confirmación y `replaceGem`. El
  paso «Pegá tu gema» queda solo para un estilo nuevo.
- `useGemTemplateDraft.ts`: sin `startPasting`, `stopPasting`, `markSaved` ni `unsavedSections`
  (solo servían al reemplazo).
- `GemPasteStep.tsx`: sin «Volver a las secciones».
- `utilities/gemTemplate.ts`: se elimina `sameGemSections` (medía si el reemplazo perdía algo sin
  guardar) y `pastedGemSavePayload` deja de mandar `sourcePrompt: ''`, que solo borraba el respaldo
  de la gema reemplazada.
- Textos `create.gemTemplate.replaceGem`, `replaceHint`, `replaceConfirm` y `backToSections`
  eliminados de los tres idiomas.
- Guards: `check-app-gem-sections.mjs` pierde el caso de `sameGemSections` y
  `check-app-gem-migration.mjs` ajusta el payload de la gema pegada.
- La ADR-0048 anota el cambio de la decisión B2; el diseño y el traspaso de la Entrega 1 lo
  señalan donde describían el botón.

## Límites deliberados

- El sidecar no cambia: `style-save` sigue aceptando una gema de texto sobre una de secciones. La
  app ya no lo pide.
- El store de adaptaciones conserva `adapt` como estaba: si una gema vuelve a estar guardada como
  texto, se adapta otra vez.
- Para rehacer una gema desde otro texto se crea un estilo nuevo y se borra el anterior. El «Texto
  original» sigue visible, de solo lectura, en el modal de la gema adaptada.

## Validación reproducible

```bash
node --test scripts/test/check-app-gem-sections.mjs scripts/test/check-app-gem-migration.mjs
node scripts/test/check-locales.mjs
grep -rn "Pegar gema nueva" src public   # no tiene que encontrar nada
pnpm format:check
pnpm lint
pnpm build
```

## Pruebas manuales

Con el formulario real de Crear montado en Chrome sin interfaz (dentro de `StrictMode`, API
simulada):

- el modal de una gema de plantilla no muestra el botón;
- «Crear estilo» sigue arrancando en «Pegá tu gema», sin «Volver a las secciones»;
- «Preparar con IA» guarda la gema pegada como texto (sin `sourcePrompt` en el pedido) y, adaptada,
  el modal pasa a sus secciones.

Falta el recorrido del dueño en `pnpm tauri dev`, con el agente real.
