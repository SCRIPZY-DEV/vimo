# Fix: el guard de Claves API vuelve a pasar (respuestas simuladas sin `credits`)

- 📅 **Fecha:** 2026-10-09
- 🌿 **Rama:** `feat/edicion-avatar-ia`
- **Área:** módulo `api-keys` (`ApiKeyCard`) y el guard `scripts/test/check-api-key-ui.mjs`.
- **Relacionado:** el guard nació con el
  [fix de probar antes de guardar](../2026-09-12-fix-api-key-validation-before-save/api-key-validation-before-save.md);
  el campo `credits` entró con el PR #91 (`c007e008`, animación con Kie.ai).

## Causa

`node scripts/test/check-api-key-ui.mjs` fallaba en `dev` (y en esta rama) con
`Cannot read properties of undefined (reading 'disabled')`. El mensaje no dice nada de la
tarjeta; la causa real se verificó instrumentando una copia del guard (fuera del repo) con tres
datos extra: el último `check` superado, el proveedor en curso y el error no capturado del root de
React (`createRoot(..., { onUncaughtError })`).

Resultado de la instrumentación:

- Cae en el **primer** proveedor (`deepinfra`), justo después de superar
  `valor normalizado y proveedor correcto`: es el `waitFor(() => !save().disabled, …)` que sigue a
  `attempt.resolve({ ok: true, code: null })`.
- En ese instante el árbol de React estaba **vacío** (cero botones): `save()` devolvía `undefined`
  y de ahí el `TypeError` sobre `.disabled`.
- El error de render capturado fue `Cannot read properties of undefined (reading 'toFixed')`, en
  `formatCompact`, llamado desde `validationMessage` de `ApiKeyCard`.

Mecanismo: el PR #91 sumó `credits: number | null` al contrato `ValidationResult` y, en la tarjeta,
`if (validation.ok && validation.credits !== null)` para mostrar el saldo de Kie.ai y PoYo. El
guard, que no se tocó desde el PR #68, seguía resolviendo `{ ok: true, code: null }` sin `credits`.
Con `credits === undefined`, `undefined !== null` es `true`, se llama a `formatCompact(undefined)`
y `undefined.toFixed(1)` revienta durante el render de la tarjeta. La hipótesis de la revisión de
la entrega 1 se confirmó tal cual.

Qué produce ese error de render según dónde se monte la tarjeta:

- **En el guard**, la raíz es un `createRoot(...)` desnudo, sin error boundary: React desmonta el
  árbol entero y los botones desaparecen. Por eso el guard caía sobre `.disabled` y no decía la
  causa.
- **En la app**, la vista de Claves API cuelga de `AuthenticatedLayout`, que envuelve su contenido
  en un `ErrorBoundary` (`AuthenticatedLayout.tsx:48`, «red de seguridad por pantalla»). El mismo
  error habría dejado el sidebar vivo y la pantalla con el fallback `layout.error.*` («Esta sección
  no se pudo abrir», con «Probar de nuevo»), más el marcador `[[VIMO_ERR]]` en la consola; no una
  pantalla en blanco.

Para el usuario real esto nunca pasó: Rust serializa `credits: Option<f64>` y manda `null` cuando
no hay saldo, así que el contrato se cumple. Fallaban dos cosas a la vez: el guard violaba el
contrato y la tarjeta no toleraba esa violación.

## Corrección

- `src/modules/api-keys/components/ApiKeyCard.tsx`: `validationMessage` muestra el saldo solo si
  `typeof validation.credits === 'number'` (antes `!== null`). Un `credits` ausente cae al
  «Conectado correctamente.» sin saldo en vez de tumbar la tarjeta.
- `scripts/test/check-api-key-ui.mjs`:
  - Dos helpers, `accepted(credits = null)` y `rejected(code)`, arman las respuestas simuladas con
    la forma exacta de `ValidationResult` (`credits` siempre presente). Todos los `resolve(...)`
    del guard los usan, salvo el del caso que viola el contrato a propósito (el siguiente), así que
    una respuesta nueva no puede olvidarse del campo.
  - Un caso nuevo que resuelve `{ ok: true, code: null }` sin `credits` y comprueba que la tarjeta
    sigue viva, habilita Guardar y muestra «Conectado correctamente.». Es la cobertura del
    `typeof`: con los mocks que respetan el contrato ese camino ya no se ejercita. Espera un editor
    recién montado (`input.value === ''`) y lo cierra al terminar (hoy lo hace el helper
    `probeWith`): los casos del guard comparten el DOM, y un editor abierto de más hacía que el
    caso siguiente (`A no valida B`) arrancara sobre el input viejo y pasara sin probar nada
    (comprobado con una mutación del hook).
  - El root de React guarda el error no capturado (`onUncaughtError`) y el `FAIL` lo agrega al
    mensaje: `FAIL: … (render error: Cannot read properties of undefined (reading 'toFixed'))`.
    Un render roto ya no se disfraza de «botón no encontrado».
- Conteo de casos: este fix llevó el guard de 16 a 17. Después se sumaron los del saldo de HeyGen
  en dólares y los del saldo cero, así que el número vigente es el que imprime el guard
  (`PASS: API key validation UI (N cases)`).

## Límites deliberados

- No se tocó Rust ni el tipo `ValidationResult`: `credits: number | null` sigue siendo el contrato.
- No se tocó ningún error boundary: la vista de Claves API ya está cubierta por el de
  `AuthenticatedLayout`. El guard sigue montando la tarjeta sin boundary a propósito: un error de
  render tiene que tumbar el guard (y `onUncaughtError` dice cuál fue), no quedar tapado por un
  fallback.
- El guard sigue siendo un script de Chrome headless a mano; migra a Vitest o Playwright cuando se
  decida el framework (ver `scripts/test/README.md`).

## Validación reproducible

1. `node scripts/test/check-api-key-ui.mjs` (necesita Chrome en la ruta de macOS por defecto, o la
   ruta como primer argumento). Salida esperada: `PASS: API key validation UI (N cases)`, con N el
   número vigente (17 cuando se hizo este fix).
2. Para comprobar que el guard detecta la regresión de la causa: en `ApiKeyCard.tsx`, volver a
   `validation.credits !== null` y correr de nuevo el guard. Debe fallar así (restaurar el `typeof`
   después):

   ```text
   FAIL: una respuesta sin credits no rompe la tarjeta (render error: Cannot read properties of undefined (reading 'toFixed'))
   ```

3. Para comprobar que el caso `A no valida B` sigue mordiendo: en `useApiKeyActions.ts`, quitar de
   `onSuccess` la línea `if (attempt.revision !== validationRevision.current) return`. El guard debe
   fallar con `FAIL: A no valida B ni muestra éxito obsoleto` (restaurar la línea después).
4. `pnpm exec eslint src/modules/api-keys/components/ApiKeyCard.tsx` y `pnpm build`.

Verificado el 2026-10-09: el paso 1 pasa; los pasos 2 y 3 fallan con los mensajes indicados.

## Pruebas manuales

No aplica: es un guard automático. Para el usuario no cambia nada, porque Rust siempre manda
`credits` (`null` cuando el proveedor no da saldo).
