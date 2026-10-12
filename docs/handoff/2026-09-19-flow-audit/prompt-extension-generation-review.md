---
title: Traspaso - Revision de ACTIVITY_BLOCKED durante prueba real
date: 2026-09-19
tags: [vimo, flow, extension, diagnostico]
---

# Pedido para EXTENSION-RPC-FLOW

Revisa el rechazo de proveedor observado en la prueba real de diez escenas de Vimo. Trabaja en el repositorio de la extensión; Vimo queda en solo lectura. Este pedido es de diagnóstico: no autoriza nuevas generaciones, `connection.test`, cambio de cuentas para eludir una pausa, borrados, rotación de identidad, reinicios del presupuesto ni publicación.

## Evidencia

Proyecto `prueba-flow-10-escenas-2026-09-19`; lote `c298b286-24c1-4adf-b8eb-9cc2d0a58976`. Diez trabajos únicos, siete resultados correctos e importados y tres rechazos `ACTIVITY_BLOCKED` con `submission: rejected`, escenas 2, 5 y 8 del mismo perfil. Cada trabajo tiene exactamente un POST confirmado. Hubo doce invocaciones locales: diez POST y dos preparaciones canceladas antes de enviar. No quedaron trabajos inciertos, reescrituras ni regeneraciones explícitas. El consumo local aumentó diez.

Las escenas 5 y 8 volvieron a cola tras una preparación `not_sent`; luego la recuperación automática intentó su primer POST y también fueron rechazadas. La escena 2 fallida no se reenvió. El último snapshot terminal fue 2026-09-19 17:57:19 America/Bogota: siete `ready`, tres `failed`, cero trabajo pendiente. No se atribuye una causa remota a partir del código de error.

Los diez prompts son distintos y el coordinador conserva el texto sanitizado de Vimo. Que las imágenes repitan el estudio es un problema anterior al envío y se está investigando en Vimo; no reescribir prompts en la extensión para compensarlo.

## Resolver con fuente y datos agregados

1. Identifica la versión efectivamente cargada en el perfil afectado sin imprimir su identidad ni almacenamiento. Distingue paquete cargado de fuente local, sin recargar perfiles reales para averiguarlo.
2. Confirma la clasificación de `ACTIVITY_BLOCKED` y la semántica real del cooldown/checking. Describe si un trabajo de producción aún no enviado se utiliza como sonda después del cooldown y cómo lo informa la UI.
3. Comprueba que `failed` con respuesta rechazada no vuelve a la cola automáticamente, que `not_sent` no duplica reserva/consumo, y que no se reenvía un intento incierto para probar disponibilidad.
4. Explica el paso de disponibilidad aparente a rechazo. Usa solo códigos, tiempos, estados y contadores; no tokens, cookies, reCAPTCHA, correos, cuerpos RPC, prompts, URLs firmadas o respuestas crudas.
5. Determina si se trata de comportamiento previsto, un error reproducible de la extensión o un límite del proveedor que no puede diagnosticarse con la evidencia disponible. No presentes una hipótesis como causa comprobada.

Si hace falta corregir un contrato para comunicar mejor disponibilidad o recuperación, entrega DTO, versión, errores y semántica exactos antes de asumir que Vimo incorpora ese cambio. No rebajes comprobaciones ni automatices eludir bloqueos. Valida modificaciones con proveedor/worker simulados, sin otra llamada a Google.

Entrega hallazgos, archivos cambiados si correspondiera, comprobaciones y límites pendientes. No afirmar que las tres imágenes restantes se generaron ni que el rechazo fue resuelto sin evidencia real autorizada.
