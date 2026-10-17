# Fix: nombre de la pestaña vimo (gratis)

- **Fecha:** 2026-10-11
- **Rama:** `feat/flow-export-motion`

## Causa

El selector de generación mostraba «Flow (Gratis)» y el usuario pidió que se identifique como «vimo (gratis)».

## Corrección

Se actualiza `extension.engineFlow` en los catálogos español, inglés y portugués. La clave compartida actualiza los selectores de Crear, estilos y personajes de manera consistente.

## Límites deliberados

Es un cambio del nombre visible. Se conservan los identificadores internos, el modelo Nano Banana 2 Lite, los proyectos y las conexiones existentes. El traslado de cuentas QA sigue siendo un trabajo separado.

## Validación reproducible

Ejecutar `pnpm format`, `pnpm lint`, `pnpm build` y `node scripts/test/check-locales.mjs`. Compilar la app local con Node oficial22.23.2 y `APPLE_SIGNING_IDENTITY=-`: `pnpm exec tauri build --bundles app`. Verificar firma mediante `codesign --verify --deep --strict` sobre la app entregada.

## Pruebas manuales realizadas

La apertura y la comprobación visual quedan a cargo del usuario: tras rechazarse el permiso de control de Vimo, respondió «La abriré yo desde la carpeta». No se intentan vías alternativas ni se afirma aceptación visual. Formato, lint, build web y alineación de2135claves pasan; no se añadieron tests para este cambio de texto.

La compilación nativa termina con exit0, mantiene identidad `click.vimo.portable` y versión0.10.0, y pasa `codesign --verify --deep --strict`. Los tres catálogos de `dist/locales` contienen el nuevo nombre.
