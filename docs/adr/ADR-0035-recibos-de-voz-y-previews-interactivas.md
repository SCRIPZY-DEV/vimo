# ADR-0035: Recibos locales de voz y previews interactivas

- **Fecha:** 2026-09-12.
- **Estado:** Aceptada para las correcciones solicitadas.
- **Área:** app / pipeline / providers.

## Problema

Se solicitaron previews rápidas y reanudación sin duplicar solicitudes TTS.
Un checkpoint de fase terminada no representa una operación remota en curso.
La política premium de identidad y la preferencia de modelo de escenas no son
el problema y se conservan.

## Decisión

Mantener invoke/Channel, stages y rutas existentes. Agregar recibos atómicos
privados por parte TTS y exclusión de jobs nativos del mismo proyecto. Persistir
antes del POST y después de recibir ID/URL. Reanudar consulta el ID; un resultado
incierto bloquea regeneración. La cancelación cosecha la respuesta ya enviada,
sin comenzar la parte siguiente. El fallback queda limitado a rechazos confirmados.
La reanudación prioriza el proveedor registrado en los recibos, aunque sea un
carril de respaldo. Sin su clave o con carriles pendientes contradictorios, bloquea
antes del troceo para no pagar partes en otro carril.

Solo para muestras de estilos, utilizar cuatro redacciones streaming paralelas
con Scout → Turbo → Ultra y plazo de 25 segundos por intento; errores de cuenta
no rotan modelos. Después, cuatro imágenes paralelas y publicación individual
atómica. Polling Evolink de un segundo solo para esta operación interactiva.

## Alternativas consideradas

- Repetir el POST al fallar: descartado porque puede duplicar cargos.
- Reconstruir tareas por hora o texto: descartado sin contrato remoto verificable.
- Reescribir el transporte o agregar un servicio de jobs: fuera del ajuste
  solicitado; el recibo local aprovecha el proyecto y el sidecar existentes.
- Usar el modelo interactivo para todo el video: descartado para respetar la
  preferencia del usuario y la política de identidad.

## Consecuencias

Mejora la latencia visible y conserva encargos conocidos, sin garantía de latencia
externa. Un POST cuyo ID nunca llega exige conciliación manual: no hay
idempotencia remota documentada que permita repetirlo con seguridad. Los recibos
pueden contener URLs firmadas y no deben compartirse en logs públicos. Un cierre
forzado puede impedir cosechar respuestas de motores síncronos. No se incorpora
un endpoint, proveedor, secreto, ruta ni etapa nueva.

Las cuatro muestras aumentan concurrencia, no su número habitual. Un fallback de
texto puede sumar tokens del intento anterior. La protección nativa cubre jobs
de la misma instancia de app, no procesos CLI independientes ni otra app.

## Verificación de cumplimiento

- Local: `node --test scripts/check-preview-regressions.mjs` verifica rotación,
  cuatro POSTs simultáneos y publicación individual antes del cierre del job.
- Local: `node --test scripts/check-voice-resume.mjs` cuenta POSTs, verifica
  recuperación de ID/URL y prueba unión atómica con FFmpeg real.
- `pnpm format`, `pnpm lint`, `pnpm build`, tsc del pipeline y `cargo check`.
- Build local `pnpm exec tauri build --bundles app`; QA manual en los documentos
  enlazados. Estas pruebas no están integradas todavía en CI.
- Regresión observable: dos IDs cobrados al reanudar, una grilla que se reduce
  a una tarjeta o audio final presente tras una unión fallida.

## Referencias

- [Previews y pruebas](../fixes/style-preview-generation.md)
- [Reanudación y pruebas](../fixes/voice-resume.md)
- [Identidad desde Catálogo](../fixes/catalog-character-context.md)
- [ADR-0025](ADR-0025-troceo-universal-de-tts-y-tope-de-90k.md)
- [ADR-0028](ADR-0028-bloqueo-temporal-de-modelos-de-prompts.md)
