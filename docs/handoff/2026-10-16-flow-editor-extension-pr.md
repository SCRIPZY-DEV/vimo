# Publicación de Flow, editor con SFX y descarga de extensión

- **Fecha:** 2026-10-16.
- **Rama:** `feat/flow-export-motion`.
- **Destino:** revisión mediante PR contra `dev`.
- **Comparación:** [dev...feat/flow-export-motion](https://github.com/SCRIPZY-DEV/vimo/compare/dev...feat/flow-export-motion).
- **Integración:** `dev` en `9aaef8b6` y los cambios del PR #107 en `97b316b2`.

Este registro consolida el resultado de la rama para su publicación; la hora real y el enlace del PR se registran en el vault al publicarla. No implica merge, release de escritorio, push del repositorio separado de Chrome ni otra publicación en R2.

## Cambios finales

- **Imágenes con Vimo:** Multimagen para nuevas imágenes, muestras y retratos; cinco perfiles configurados, admisión según el coordinador y despacho a cuentas disponibles. Preparación, vinculación y recuperación durables conservan identidad, permisos, recibos y resultados. Completar faltantes con GPT Image 2 requiere confirmación explícita. La política moderna no impone un cupo diario local; no elimina los límites ni costos del proveedor.
- **Regeneración por escena:** escenas distintas se procesan en paralelo, con propietario y proveedor capturados y exclusión de cada destino. Flow utiliza la capacidad del coordinador; las solicitudes pagas tienen cinco carriles locales. El importador verifica proyecto, revisión y hash antes de incorporar un resultado.
- **Editor:** herramientas Animar, Audio/SFX, Transiciones y Música con iconos y tooltips, paneles laterales redimensionables y cierre mediante X o su icono. La vista previa se desplaza y puede ampliarse; el prompt conserva su contenido. Las grillas admiten hasta cuatro columnas; Transiciones/SFX abren con espacio para tres y una tarjeta única llena el ancho inicial.
- **Timeline y fundidos:** selección amarilla, tirador individual y marcador de transición conservado. Fundido en la unión seleccionada o en todas las editables, con muestra sobre dos fotos ya existentes. Sin selección, la tarjeta conserva su apariencia y explica que debe elegirse una escena.
- **SFX y exportación:** click de duración fija en pista propia, inserción en cursor, arrastre, borrado por Delete/Backspace/X y aplicación a cambios de escena. La posición o ancla persiste y se escucha en preview y video final; exportar para editar entrega `sound-effects.wav` sincronizado. La exportación también permite movimiento opcional para imágenes, conservando los clips ya generados.
- **Descarga de extensión:** consulta del descriptor público, versión y novedades, ZIP verificado en `Documentos/Vimo/Extensiones`, estado de descarga, apertura de carpeta y limpieza de ZIP anteriores sólo después de verificar el nuevo. Buscar actualizaciones con el archivo vigente confirma «Ya tienes la última versión» sin reabrir el aviso. Descargar no instala ni recarga Chrome.
- **Compatibilidad con dev y #107:** conserva voces, avatar, acceso y navegación de `dev`; incorpora demo v4, descarga reanudable por partes, Crear en demo, prompts de movimiento sin citas narrativas y evento terminal cuando el sidecar termina. El PR #107 mantiene su historial y revisión propios.
- **Validación multiplataforma preparada:** pruebas Rust de entrega de extensión en los workflows macOS/Windows y workflow específico Linux. No se agregan capturas, perfiles de navegador, ZIPs ni scripts personales de QA.

## Validación y límites

Las comprobaciones de esta integración y sus pasos reproducibles están en [el informe de integración](../../fixes/2026-10-16_integracion-demo-v4-flow-editor-extension.md). Las pruebas humanas comunicadas por el owner corresponden a `c48a3cd8`, antes de incorporar #107; no se presentan como aceptación manual de la combinación nueva.

La extensión 0.2.38 ya estaba publicada en R2 desde el 2026-10-15 a las 23:01:53: 130658 bytes, SHA-256 `c6663217a4823fb9d54d428c1beaab993cd8f4e59aa17a2b4accb614a11a72eb`. Su descarga nativa se verificó ese día con una app de prueba anterior. El ZIP y su descriptor permanecen intactos durante esta integración.

Publicar código para revisión no actualiza la app instalada. La aceptación manual de la combinación final y las ejecuciones nativas Windows/Linux se registran por separado; los workflows existentes son manuales o por tag, no una garantía de pruebas ejecutadas al abrir el PR.

## Referencias

- [Arquitectura](../ARCHITECTURE.md), ADR-0054/0055/0058/0060 y ADR-0061.
- [Paneles, fundidos y selección SFX](../../fixes/2026-10-15_paneles-transiciones-y-seleccion-sfx.md) y [selección de transición y tres tarjetas](../../fixes/2026-10-15_transiciones-sin-seleccion-y-tres-cards.md).
- [SFX sincronizados](../../fixes/2026-10-14_audio-sfx-editor.md), [descarga en Documentos](../../fixes/2026-10-15_extension-en-documentos-y-confirmacion-descarga.md) y [limpieza de ZIP anteriores](../../fixes/2026-10-15_limpieza-versiones-anteriores-extension.md).
