# ADR-0044 — Oferta de redactores basada en validación narrativa

- **Estado:** Aceptada
- **Fecha:** 2026-09-27
- **Área:** pipeline / app
- **Complementa:** ADR-0020, ADR-0022 y ADR-0028.
- **Origen:** pedido explícito de limitar todos los selectores a los modelos con menos errores, preservando arquitectura y previews.

## Contexto y evidencia

Se compararon 22 solicitudes reales de ocho modelos sobre los mismos 19 fragmentos de Video-1, con el cliente y parser de producción, antes del validador. Hubo 18 lotes completos (342 prompts). Son un guion y pocas repeticiones, no una garantía general de calidad.

V4 Pro completó dos lotes sin contradicciones claras detectadas; Haiku completó dos con mejor concreción visual y tres casos ambiguos en una ronda (con discrepancia entre evaluadores). Son los dos perfiles de producción retenidos. GPT-OSS bajo/medio y Ultra sin esfuerzo explícito tuvieron errores de correspondencia; Scout adelantó acciones y Flash no devolvió el lote. GPT-OSS alto dio una respuesta completa por variante después de ampliar el límite de salida: esa muestra no basta para introducir otro perfil global. V3.2 conservó buena continuidad, pero tardó 172–221 segundos y ya estaba oculto por saturación. Qwen permanece retirado.

La evidencia íntegra, costos y desacuerdos se conservan fuera del repo, en el vault del proyecto: `Reportes/2026-09-27-redactor-full-comparison/Comparacion completa - Redactores antes del validador.md`. No se suben scripts locales ni imágenes de las pruebas.

## Decisión

1. Ofrecer únicamente **DeepSeek V4 Pro** y **Claude Haiku 4.5**. V4 Pro queda predeterminado. Se usa el catálogo central existente, sin listas duplicadas en React o Rust.
2. `inUi` gobierna tanto la oferta como la ejecución del redactor elegible. `resolveVerbatimModel` sustituye un ID oculto, retirado o desconocido por el predeterminado con aviso. Se aplica al generar, reanudar, regenerar y diseñar personajes con una preferencia de proyecto. No se migran archivos históricos ni se borran prompts pagados.
3. `modelProfile` sigue siendo un perfil técnico. Las políticas internas de previews y Catálogo conservan sus modelos, presupuestos y plazos: el ensayo evaluó otro contrato. No se marca `retired` globalmente a Scout/Turbo/Ultra ni se cambia su razonamiento. El diseño del protagonista de las muestras fija explícitamente su Ultra anterior para que el nuevo default del selector no lo altere indirectamente.
4. Los rescates del carril elegible también pertenecen a la oferta: V4 Pro rescata con Haiku y Haiku con V4 Pro. No reaparecen modelos ocultos por una cadena de respaldo.
5. `list-prompt-models` devuelve exactamente esa oferta, con un default incluido. No reintroduce automáticamente un perfil oculto.
6. Ajustes, Crear compacto/expandido y diálogo de recuperación consumen el mismo catálogo. Los bloqueos históricos de modelos ocultos no se ofrecen para desbloquear. Una tarea antigua no muestra «Reintentar con el mismo modelo» si ese modelo ya no se ofrece; permite elegir uno admitido.
7. `promptModelUsed` conserva la auditoría histórica. Mostrar qué modelo produjo un proyecto no lo vuelve a habilitar como opción.

## Contrato y fallos

No cambia el esquema de jobs, payloads, eventos NDJSON, preferencias ni el puente Rust. Sin catálogo cargado, el diálogo no debe habilitar reintentar un modelo antiguo. Con ambos modelos temporalmente bloqueados, se conserva la política existente de cancelación/espera y desbloqueo manual. Una sustitución no borra resultados anteriores ni modifica audio, cortes, orden o duraciones.

La elección de un modelo mejor no elimina la validación de IDs ni garantiza coherencia semántica. El revisor de ADR-0043 sigue igual en este cambio; si el PR lo conserva, debe declararlo **temporal mientras se corrige la causa raíz**, con costo/latencia adicionales y condiciones de retirada verificables. No se convierte en una garantía permanente mediante esta ADR.

## Alternativas descartadas

- Solo ocultar tarjetas: los proyectos guardados seguirían ejecutando modelos con errores.
- Retirar globalmente todos los perfiles ocultos: dejaría sin candidatos las políticas de previews/Catálogo.
- Activar GPT-OSS high globalmente: cambia costo y presupuesto en servicios con plazos de 25/40 segundos, sin validación suficiente de esos contratos.
- Reescribir preferencias, proyectos y auditoría en disco: innecesario; la resolución al ejecutar conserva compatibilidad.

## Costo y límites

El nuevo default es más caro que el anterior. El selector conserva las estimaciones de cada perfil; no cambia tarifas ni créditos Kie. Las muestras de V4 Pro promediaron USD 0,011247 por lote de 19 (con caché desigual); Haiku USD 0,023168. No son precios fijos ni incluyen el revisor. El filtrado se basa en evidencia limitada y puede revisarse tras ampliar la evaluación con otros guiones.

## Validación

Ver el fix de esta fecha para comandos y resultados: catálogo del sidecar empaquetado, resolución de preferencias antiguas, rescate, protección de previews, render de selectores y compilación. Las simulaciones verifican contratos; la calidad narrativa procede de las llamadas reales conservadas, no de respuestas ficticias.
