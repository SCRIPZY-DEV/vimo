# Integración: Flow como motor de imágenes

- **Fecha:** 2026-09-17
- **Rama:** `feat/extension-vimo-automater`

## Causa

Vimo sólo podía generar imágenes mediante proveedores pagos. El coordinador de
la extensión era un proceso externo sin conexión con la UI, los destinos de
escena ni la recuperación de proyectos de Vimo. La integración debía conservar
el pipeline y proteger credenciales, revisiones y trabajos de resultado incierto.

## Corrección

- Selector GPT Image 2 Fal/Evolink o Flow gratis en Catálogo/Mi estilo, previews
  de personaje, muestras de estilo y regeneración del editor.
- Sección Extensión en sidebar con estado, descubrimiento, vínculo automático,
  revocación y controles de recuperación. Capacidad independiente de créditos.
- Coordinador persistente administrado por Rust y empaquetado en el SEA. Token
  privado de 256 bits por ejecución; protocolo público con allowlist de comandos.
  Origen de extensión fijado al ID público verificado.
- Intención durable antes de reservar/presentar, mínimo tres cuentas distintas,
  páginas acotadas y conciliación conservando IDs. Sin fallback pago silencioso.
- Importación JPEG comprobada con FFmpeg, hash y revisión; publicación atómica,
  caché invalidada y render anterior desactualizado. No sobrescribir escenas
  editadas mientras la generación estaba en curso.
- Recuperación de descarga sin generación, cancelación de reserva y trabajos,
  reintento RPC13 confirmado, eliminación local elegible y reinicio de lotes
  cancelados solamente cuando los recibos prueban seguridad.

La decisión y los contratos están en
[ADR-0058](../docs/adr/ADR-0058-flow-como-motor-de-imagenes.md). La procedencia de
la copia del coordinador está en su README; no depende del repositorio externo
ni del Node del sistema en producción.

## Límites deliberados

La verificación de código y el proveedor simulado no certifican las cuentas de
Google, cuotas remotas ni un benchmark real. El mínimo de tres cuentas y el
presupuesto local de400 envíos/24h proceden del contrato de la extensión.
Administrar proyectos o resolver una pausa individual sigue en el panel de la
extensión. No se incorpora un backend cloud ni trabajo ajeno de animaciones.

Un resultado incierto permanece por revisar. Un trabajo eliminado antes de que
Vimo observara un estado terminal seguro no se presume seguro. La credencial
local no protege frente a un proceso malicioso con los mismos permisos del
usuario. La aceptación del paquete final de extensión en perfiles reales está
pendiente; no se publicó esta rama ni se generaron imágenes en Google.

## Validación reproducible

1. `pnpm format`, `pnpm lint`, `pnpm build` y `pnpm check:locales`.
2. Construir el SEA con Node oficial22 y `pnpm build:sidecar`.
3. `cargo check --manifest-path src-tauri/Cargo.toml` y compilar la app local.
4. Ensayar el proceso `flow-service` con carpeta temporal privada, puerto de
   extensión efímero y tres workers simulados. Verificar orígenes, autenticación,
   identidad cambiada entre anuncio/canje, replay, capacidad, archivos grandes y
   cero credenciales en salida pública. Repetir con CJS y SEA real.
5. Probar JPEG/PNG/WebP reales mediante FFmpeg; recibo repetido, revisión cambiada,
   destino eliminado, resultado incierto y recuperación sin submit adicional.
   Competir ocho procesos por un lock abandonado: sólo uno adquiere el lock.
6. Interactuar con los componentes reales mediante fixture local con cuentas
   sintéticas. Comprobar motores, pausa, capacidad, recuperación y confirmaciones.

Scripts de ensayo locales, deliberadamente fuera del commit:
`/private/tmp/check-vimo-flow-service.mjs`,
`/private/tmp/vimo-flow-pipeline-test.mjs`,
`/private/tmp/vimo-flow-lock-test.mjs` y fixtures locales de UI.
No existe un framework oficial de tests añadido por este cambio.

## Pruebas manuales

En Chrome, componentes reales conectados a proveedor simulado (sin Google):
se verificaron tres cuentas listas, descubrimiento de una cuarta, pausa global,
estado vinculado con capacidad insuficiente y los tres motores del editor.
Flow sustituye créditos/calidad por conexión/capacidad. El editor confirma un
reinicio con UUID y aceptación explícita; Mi estilo muestra cuatro posiciones
En cola, Generando imágenes (extensión) y confirmación inline tras cancelación.
Previews de personaje distinguen cola y deshabilitan controles durante el trabajo.

Recuperar descarga invocó únicamente download. El control RPC13 conservó
expectedAttemptId, retryRequestId y acknowledgeDuplicateRisk; el caso unknown
ordinario no ofreció reintento. Cancelar lote invocó batch.cancel y después cancel
para sus tres trabajos aún cancelables. Todo con cuentas sintéticas.

Aceptación de la app empaquetada contra la extensión final en tres cuentas
reales: pendiente y separada de los ensayos controlados.

## Resultados controlados

- Format, lint y build completos aprobados; 1307 claves alineadas es/en/pt.
- Compilación nativa macOS arm64 y bundle local Vimo.app generados.
- 38 controles del coordinador aprobados en CJS y SEA; repetidos usando el SEA
  extraído de Vimo.app, incluido resultado PNG de13631573 bytes, origen no
  autorizado e identidad cambiada antes del canje. Cero solicitudes a Google.
- 23 controles del pipeline aprobados con FFmpeg real: replay, revisión, JPEG,
  reinicio elegible, selección parcial y Crear incierto → editor sin duplicado.
- Competencia real de ocho procesos: un propietario del lock y siete rechazos.
- 24 comprobaciones de la utilidad real de consentimiento y predicado RPC13.

Estos son ensayos temporales de desarrollo, no una nueva suite oficial. No se
certificó Windows ni se ejecutó un lote real mediante la extensión distribuible.
