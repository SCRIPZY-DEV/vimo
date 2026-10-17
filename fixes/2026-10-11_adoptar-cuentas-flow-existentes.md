# Fix: adoptar las cinco cuentas de Flow existentes

- **Fecha:** 2026-10-11
- **Rama:** `feat/flow-export-motion`

## Causa

El bundle habitual usa su identidad, almacén y puerto propios. Sus cuatro vínculos antiguos no son las cinco cuentas que ya están preparadas en la app QA. La extensión conserva historia con el coordinador QA y bloquea una revinculación insegura. Preparar de nuevo los perfiles no cambia el coordinador que lee Vimo.

## Corrección

El supervisor nativo acepta una selección local explícita de coordinador existente, antes de arrancar el SEA. La configuración `flow-coordinator.json` contiene versión1, ruta absoluta de datos y puerto. Es nativa, sin secretos ni acceso por API desde React. Si está ausente usa el default; si está dañada o su destino no existe, falla cerrado sin crear otro historial. El directorio y puerto existentes conservan todas las identidades, referencias, resultados y las credenciales ya guardadas en las extensiones.

El despliegue local requiere cerrar las dos apps Vimo, respaldar ambos almacenes, activar la selección atómica y abrir sólo la nueva app. Chrome Beta y Multimagen permanecen abiertos. Los cuatro vínculos históricos del almacén habitual quedan intactos; la app seleccionada muestra los cinco del coordinador adoptado. Arquitectura y fallo en ADR-0058.

## Límites deliberados

No copia ni fusiona ledgers, no cambia credenciales, no fuerza pausas, no resuelve inciertos históricos y no genera imágenes. Una sola app puede controlar ese coordinador por vez, garantizado por el lock existente. No se migra la biblioteca QA a la raíz de proyectos habitual; los proyectos nuevos usan los ajustes habituales. Conserva Nano Banana2Lite. El rótulo final es «Vimo (gratis)» y Multimagen es la única opción para solicitudes nuevas (f2ca1356).

## Validación reproducible

- `cargo test --manifest-path src-tauri/Cargo.toml --release --lib`: casos oficiales del resolvedor incluyen defaults, selección exacta sin escrituras, config corrupta/excesiva/directorio/symlink roto, versiones, puertos, rutas inválidas y destino perdido. Todos usan TempDir.
- `pnpm format`, `pnpm lint`, `pnpm build`, `node scripts/test/check-locales.mjs`.
- Compilar con Node oficial22.23.2 y `APPLE_SIGNING_IDENTITY=-`; `pnpm exec tauri build --bundles app`; verificar `codesign --verify --deep --strict` en la app entregada.
- Antes/después de activar, comparar IDs/hashes de trabajos, archivos y contadores sin exponer credenciales. Tras abrir, verificar que el lock y listener correspondan al nuevo ejecutable, cinco sesiones observadas/reconciliadas y cinco capacidades Multimagen listas. Confirmar en UI5cuentas disponibles. Esto acredita reconexión, no nueva generación del proveedor.

## Pruebas manuales realizadas

Validación técnica completada: 58/58 tests Rust, formato/lint/build/i18n correctos, bundle con identidad habitual y firma deep/strict válida. El SHA del SEA coincide exactamente con la entrega anterior: no cambian generación ni exportación. El 2026-10-11 se cerraron ambas apps (QA mediante ⌘Q), sin locks restantes. Se respaldaron y compararon por SHA-256 todos los archivos de ambos almacenes; 117 trabajos habituales y 459 de QA permanecen intactos. Se instaló f2ca1356, se verificó la firma en destino y se activó atómicamente la selección del almacén existente/43137 con permisos0600. La app anterior permanece respaldada. Evidencia privada: `Vimo-builds/Adopcion-cuentas-2026-10-11/activation-proof.json`. Pendiente: apertura por el usuario y reconexión real de cinco cuentas; activar configuración no demuestra todavía esa reconexión.
