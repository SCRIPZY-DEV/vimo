# Fix: controles de conexión Flow y orden del sidebar

- **Fecha:** 2026-09-18 (inicio de revisión: 2026-09-17).
- **Rama:** `feat/extension-vimo-automater`.

## Causa

- «Vinculado · falta preparar cuentas» era un enlace a Extensión. En esa misma vista no producía un cambio visible; en formularios o diálogos tampoco explicaba qué faltaba preparar.
- «Actualizar conexión» consultaba snapshots sin indicador de carga ni confirmación visible. `refetch()` de TanStack Query devuelve resultados con error sin lanzar por defecto; no es suficiente para afirmar que una comprobación terminó correctamente.
- El control de pausa solo miraba `manualPaused` global. La consulta local de solo lectura encontró tres cuentas vinculadas con identidad verificada, proyecto preparado y presupuesto local 400, pero todas pausadas individualmente y con pausa global desactivada. Por eso faltaba una acción directa para reanudarlas.
- Extensión se había colocado al inicio del sidebar, en lugar de debajo de Personajes.

## Corrección

- `FlowConnectionBadge` pasa a ser un botón expandible accesible, sin navegación, con resumen y guía por cuenta. Funciona en la propia vista, formularios y diálogos Radix sin abrir otra capa modal ni perder el borrador.
- `FlowRefreshButton` usa una mutación compartida por clave para impedir comprobaciones manuales superpuestas. Consulta estado, descubrimiento y las capacidades activas; en ausencia de estas comprueba una imagen. Espera todas las respuestas y muestra carga, resultado con hora, ausencia de cambios o error. El polling automático se conserva.
- La comparación usa datos de conexión y capacidad, excluyendo trabajos y vencimientos de anuncios. No guarda credenciales ni escribe snapshots en almacenamiento del navegador.
- `useFlowStatus` expone perfiles conectados y vigentes con pausa individual. Extensión y `FlowRunControls` ofrecen «Reanudar cuentas» cuando corresponde. «Pausar imágenes de Flow» sigue disponible cuando no hay pausa global, incluso si otro perfil está en cooldown.
- Reanudar envía explícitamente el comando existente `pause(false)`. La interfaz confirma la solicitud y espera el estado del worker; no marca cuentas listas de manera optimista. La extensión conserva sus comprobaciones de identidad, proyecto, presupuesto y esperas del proveedor.
- Actualizar nunca reanuda perfiles, genera imágenes, modifica cuentas ni utiliza `connection.test`.
- Extensión queda inmediatamente debajo de Personajes. Textos equivalentes en español, inglés y portugués.

## Límites deliberados

- Actualizar consulta el estado comunicado por la extensión. No existe actualmente un comando remoto de revalidación de Chrome sin generación; «Revisar proyecto» y «Reconectar» se ejecutan desde el panel de la extensión cuando hacen falta.
- Reanudar puede continuar trabajos ya autorizados. No crea trabajos nuevos ni reintenta resultados inciertos. El ACK del puente no implica que todos los perfiles hayan podido salir de pausa.
- No se modificaron cuentas reales, tokens, archivos de pairing, políticas de capacidad, backend ni código externo de la extensión.
- La fuente externa tenía un cambio de presupuesto 400→500 en desarrollo, mientras paquete/documentación y las cuentas observadas seguían en 400. Se conserva el contrato vigente; ese cambio debe coordinarse por separado, con compatibilidad para instalaciones anteriores.
- Las pruebas visuales usan componentes reales y APIs simuladas. No se hizo una generación en Google ni una prueba interactiva contra cuentas reales.

## Validación reproducible

```sh
pnpm format
pnpm lint
pnpm build
pnpm check:locales
APPLE_SIGNING_IDENTITY="-" PATH="/Users/sebas/node-v22.23.2-darwin-arm64/bin:$PATH" pnpm exec tauri build --bundles app
codesign --verify --deep --strict src-tauri/target/release/bundle/macos/Vimo.app
```

La compilación local usa firma ad-hoc y un entorno sin las demás variables `APPLE_*`, para no usar certificados ni solicitar notarización. Se verificó la firma del bundle completo y los entitlements JIT del sidecar. El primer empaquetado sin identidad tenía solo la firma del linker; se reemplazó por el bundle firmado indicado arriba.

Comprobaciones temporales fuera del repositorio: hook real con QueryClient y respuestas simuladas, diez casos para cambios/sin cambios, fallo individual de cada endpoint, capacidades activas, concurrencia, ejecución web y detección de perfiles pausados. No se incorporan como framework de tests oficial.

Para repetir la revisión visual: abrir Extensión, desplegar el estado, actualizar dos veces y comprobar el indicador y la hora del resultado. Con tres perfiles pausados y pausa global desactivada, actualizar debe conservar las pausas y ofrecer Reanudar. Pulsar Reanudar debe enviar `paused: false`, sin marcar listo antes de la respuesta. Con tres perfiles listos y otro en cooldown, Pausar y Reanudar deben seguir disponibles. Repetir dentro de un diálogo y con errores de estado, descubrimiento y capacidad.

## Pruebas manuales realizadas

- Sidebar real: Crear Video → Biblioteca → Personajes → Extensión → Voces.
- Badge expandible en la vista y dentro de Radix Dialog: detalles visibles, sin navegación ni cierre del diálogo.
- Actualización: carga y botones deshabilitados durante la consulta, cambios detectados, respuesta sin cambios y error de descubrimiento visible.
- Tres perfiles pausados simulados: Actualizar no envía mutaciones; Reanudar envía únicamente `pauseFlow(false)`, espera respuesta y actualiza disponibilidad y capacidad.
- Grupo mixto de tres cuentas listas y una en cooldown: Pausar y Reanudar visibles en Extensión y en `FlowRunControls` dentro de Radix Dialog. Pausa global y reanudación simuladas confirmadas; el cooldown individual se conserva y Pausar continúa accesible.
- Compilación macOS local con bundle `.app`; no se instala ni sustituye la aplicación abierta. El DMG previo no se regenera en esta corrección.
