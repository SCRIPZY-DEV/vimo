# Fix: Multimagen como único modo y estado de cuentas desplegable

- **Fecha:** 2026-10-11
- **Rama:** feat/flow-export-motion

## Causa

El formulario ofrecía Flow directo y Multimagen y empezaba sin plan (RPC), aunque
el usuario sólo quiere utilizar Multimagen. La información de disponibilidad y
cada bloqueo ocupaba toda la pantalla. El rótulo de Vimo estaba en minúscula.

## Corrección

- «Vimo (gratis)» en español, con mayúscula equivalente en inglés y portugués.
- Multimagen como modo único en Crear, retratos, estilos y regeneración del editor.
  Las nuevas solicitudes y consultas de capacidad llevan Tools v1 explícito.
- Cambio de proveedor: volver a Vimo vuelve a Tools. Elegir el proveedor nunca
  inicia por sí solo una generación de Multimagen.
- «Ver estado de las cuentas» reúne la información anterior en un `<details>` sin
  `open`. Se abre con clic o teclado. Contraerlo no desmonta los controles activos.

## Límites deliberados

No transforma recibos ni proyectos existentes. RPC se conserva para su recuperación,
con la misma identidad/hash/plan. Demo y otros proveedores conservan sus contratos.
Este cambio visual no acredita por sí solo la conexión de las cinco cuentas;
la adopción del coordinador se documenta en su propio fix.

## Validación reproducible

1. `pnpm format`, `pnpm lint`, `pnpm build`, `pnpm check:locales`.
2. Abrir Crear y elegir Vimo: sólo debe mostrarse Multimagen; alternar a otro
   proveedor y volver conserva Multimagen.
3. Abrir «Ver estado de las cuentas»: muestra los conteos, controles y motivos;
   volver a cerrarlo y verificar que las generaciones no se pausan.
4. Repetir con estilo, retrato y regeneración del editor. Una recuperación previa
   mantiene su plan. Enviar un nuevo trabajo requiere cuentas disponibles para Tools.
5. Compilar el bundle normal con `APPLE_SIGNING_IDENTITY=- pnpm exec tauri build
--bundles app` y verificar `codesign --verify --deep --strict` sobre Vimo.app.

## Pruebas manuales realizadas

Pendiente de apertura por el usuario: el acceso automatizado a Vimo no está habilitado.
No se declara aceptación visual ni se enviaron generaciones nuevas para este ajuste.
Verificaciones técnicas realizadas: formato, lint y build completados, catálogos
alineados con 2136 claves. Comprobación local aislada de 20 condiciones: render
estático del modo y desplegable en estados listo/bloqueado/error, selección de
proveedor con payload real, vuelta a Vimo, demo y normalización histórica RPC.
No sustituye una revisión visual dentro de la app compilada.
