# ADR-0036: Prompts de Catálogo con rotación y sin relleno

- **Fecha:** 2026-09-12.
- **Estado:** Aceptada para el bug solicitado por el usuario.
- **Área:** pipeline / Catálogo.

## Problema

El carril Catálogo usa Qwen balanced con esperas de 120 s y capas de reintentos
repetidas. Cancelar puede alcanzar el fallback determinístico, persistirlo y
hacer que `skip()` lo acepte al reanudar. Reproducción local previa al arreglo:
señal ya cancelada → una escena guardada, `promptIsFallback: true`, 1414 caracteres.
Además, anclar realismo antes de validar puede convertir una respuesta vacía
en un prompt sintácticamente válido sin narrativa.

## Decisión

Mantener las seis fases, invoke/Channel, rutas y formato de escenas. Solo en
Catálogo, usar streaming y Scout → GPT OSS Turbo → Ultra, con plazo acotado por
intento, concurrencia limitada y memoria de modelos indisponibles durante el job.
Validar el contenido de cada tarea antes de aceptar la respuesta; no solo HTTP 200.
Conservar el guion, fragmento, estilo y personajes al cambiar de modelo.

El director no inventa un plan si no pudo redactarlo. El redactor valida ANTES
de añadir anclas y no escribe fallback determinístico. Cancelar propaga la señal,
conserva solo trabajo válido ya guardado y no completa artificialmente la fase.
Imágenes tiene una barrera independiente contra prompts vacíos/de relleno.
Si los modelos se agotan, fallar de forma retomable antes de pagar imágenes.

Reanudar reescribe rellenos anteriores sin imagen ni tarea remota. No borra ni
regenera imágenes pagadas automáticamente, ni cambia el prompt de tareas remotas
pendientes: esos casos requieren revisión explícita para evitar un segundo cargo.
La regeneración del editor sigue limitada a los ids solicitados.

## Alternativas descartadas

- Más reintentos sobre el mismo modelo saturado: acumulan minutos sin progreso.
- Rellenar siempre para completar el video: convierte un fallo textual en gasto
  de imágenes sin narrativa, precisamente el defecto reportado.
- Cambiar modelos globales: afectaría identidad y Mi estilo fuera del alcance.

## Verificación

HTTP simulado con 429/503, timeout, stream cortado, JSON vacío, planes parciales,
cancelación y reanudación. Afirmar cero solicitudes de imagen sin prompts válidos,
conservación de avances, identidad/estilo/fragmento por id y ausencia de escrituras
tardías. Build nativo y smoke del SEA; calidad visual real y Windows requieren QA.
