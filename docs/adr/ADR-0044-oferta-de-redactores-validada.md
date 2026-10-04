# ADR-0044 — Oferta de redactores basada en validación narrativa

- **Estado:** Aceptada
- **Fecha:** 2026-09-27
- **Actualizada:** 2026-09-28 — oferta y ejecución rápida descritas abajo. 2026-10-04 — la revisión de ADR-0043 se retiró (ver su sección «Retirada de la revisión LLM»); lo que esta ADR dice del revisor temporal queda como historia.
- **Área:** pipeline / app
- **Complementa:** ADR-0020, ADR-0022 y ADR-0028.
- **Origen:** pedido explícito de limitar todos los selectores a los modelos con menos errores, preservando arquitectura y previews.

## Contexto y evidencia

Se compararon 22 solicitudes reales de ocho modelos sobre los mismos 19 fragmentos de Video-1, con el cliente y parser de producción, antes del validador. Hubo 18 lotes completos (342 prompts). Son un guion y pocas repeticiones, no una garantía general de calidad.

V4 Pro completó dos lotes sin contradicciones claras detectadas; Haiku completó dos con mejor concreción visual y tres casos ambiguos en una ronda (con discrepancia entre evaluadores). Son los dos perfiles de producción retenidos. GPT-OSS bajo/medio y Ultra sin esfuerzo explícito tuvieron errores de correspondencia; Scout adelantó acciones y Flash no devolvió el lote. GPT-OSS alto dio una respuesta completa por variante después de ampliar el límite de salida: esa muestra no basta para introducir otro perfil global. V3.2 conservó buena continuidad, pero tardó 172–221 segundos y ya estaba oculto por saturación. Qwen permanece retirado.

La evidencia íntegra, costos y desacuerdos se conservan fuera del repo, en el vault del proyecto: `Reportes/2026-09-27-redactor-full-comparison/Comparacion completa - Redactores antes del validador.md`. No se suben scripts locales ni imágenes de las pruebas.

## Decisión original del 2026-09-27

Los puntos 1 y 4 sobre modelos, y el costo del predeterminado, quedan **superados** por la actualización del 2026-09-28. Se conservan como historia. Los contratos de resolución, UI, auditoría y protección de previews siguen vigentes.

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

## Actualización del 2026-09-28 — velocidad, costo y recuperación selectiva

Pedido explícito: modelos rápidos/económicos, también para animación, y reintentar solo los fragmentos que faltan o fallan. No se cambia guion, fragmentador, audio, timeline ni el contrato NDJSON/Rust.

- Oferta central: **DeepSeek V4.1 Flash** predeterminado y **Claude Haiku 4.5** alternativo. Los rescates cruzan esas dos familias. V4 Pro queda técnico para el revisor temporal, oculto como redactor elegible. Preferencias antiguas se resuelven al nuevo default con aviso, conservando prompts y auditoría previos.
- MiMo V2.6 Flash con esfuerzo `none` queda técnico para animación (ADR-0042), sin tarjeta en Ajustes ni Crear. Aunque rápido en lotes menores, omitió vestuario contextual en diez escenas de la muestra; no se ofrece como equivalente del redactor estático. Su razonamiento por defecto agotó tokens sin texto útil en las pruebas.
- Los lotes de Mi estilo pasan de 20 a **10 fragmentos**, conservando gema, guion completo, personaje y contextos temporales. Máximo **8 lotes simultáneos por invocación** usando el limitador existente; el resto espera. La concurrencia se mantiene ocupada hasta finalizar también la revisión/persistencia del lote, evitando multiplicar revisiones sin límite. No es un limitador global entre proyectos. **SUPERADO por la rectificación de lotes y recuperación del 2026-09-28 que sigue.**
- Peticiones de escenas con contexto temporal tienen plazo **45 segundos por intento**; el cliente ofrece un timeout opcional que no cambia los consumidores heredados. El timeout sigue siendo recuperable. El plazo no garantiza una fase completa menor a un minuto: revisar, corregir, la cola de un video largo y fallos externos pueden prolongarla. **SUPERADO por la rectificación de lotes y recuperación del 2026-09-28 que sigue.**
- Los IDs son obligatorios para escenas temporales. Duplicados, ausencias o contenido inválido afectan únicamente a esos IDs. Un stream cortado conserva solo prompts inequívocos y delimitados, que pasan por la revisión habitual antes de guardarse. No se inventan tokens cobrados si el proveedor no entregó `usage`.
- Cancelación, auth/saldo y fallos terminales de revisión detienen la cola pendiente. Los lotes guardados se conservan. La compatibilidad sin IDs queda limitada al formato histórico sin contexto temporal y conteo exacto; no se adivina un emparejamiento inseguro para ahorrar un reintento.
- `list-prompt-models` informa el nuevo tamaño; el respaldo del simulador usa también 10. Las estimaciones usan tarifa regular de Flash USD0,20/M entrada y USD0,60/M salida para no depender de una promoción temporal. **SUPERADO por la rectificación de lotes y recuperación del 2026-09-28 que sigue.**

Evidencia: 24 llamadas previas sobre el mismo guion y cuatro adicionales de lotes menores; los 19 prompts en dos lotes concurrentes demoraron **23,68 s / USD0,00211642** con DeepSeek y **30,49 s / USD0,00203126** con MiMo. Son redacción aislada, con caché variable y sin revisión: no representan la fase entera ni un SLA. Ambos conservaron anclajes temporales en esta muestra, con seis respuestas parcialmente completas por modelo. No se declara cero incoherencias universales.

La revisión de ADR-0043 continúa **temporal**; su medición integrada, límites y comandos de verificación se registran en `fixes/2026-09-28_fast-scene-prompt-models.md`. Los experimentos y scripts auxiliares permanecen fuera del repo.

## Rectificación del 2026-09-28 — lotes de 20 y control de fallos

Pedido explícito: conservar 20 fragmentos por petición, distinguirlos del límite de concurrencia del proveedor, repetir pruebas sin validador y proteger el bloqueo/elección/reanudación del usuario.

- Se restaura **hasta20 fragmentos por petición**, también en el respaldo del estimador. El lote final puede tener menos. La división10+9 fue más rápida en el ensayo, pero añade peticiones y no demuestra mayor coherencia ni un beneficio universal que justifique cambiar ese contrato.
- El limitador existente permite **hasta200 lotes por invocación** y encola el excedente. Los 8 anteriores fueron una precaución local; no eran la cuota de DeepInfra. La documentación oficial fija 200 peticiones simultáneas **por modelo y cuenta**, no 200 por minuto ni200 fragmentos. El límite local no coordina otras apps/proyectos que compartan la cuenta, ni convierte los 200 en un objetivo de carga. El manejo histórico de 429 continúa y puede activarse también por saturación del proveedor.
- Se retira el timeout añadido de 45 s **del redactor de escenas**. Recupera el techo histórico de 600 s del cliente y el watchdog existente de la UI: no se fuerza a declarar un modelo malo porque una respuesta normal tarde 55,6 s. El adaptador separado de animación conserva su política; este cambio no lo modifica.
- Recuperar texto completo no borra la causa del fallo. Los intentos de transporte acompañan solo IDs pendientes del mismo ejecutor. Se persiste lo aceptado antes de notificar problemas; los fallos repetidos y los defectos persistentes vuelven a emitir las señales que la UI ya consume. No cambian duración del bloqueo, diálogo, watchdog, selección, comandos de reanudación, IPC ni Rust.
- Los marcadores explícitos también separan prompts si el modelo omite saltos de línea. Una respuesta real de diez IDs no puede persistirse como una sola escena. El prefijo de un stream interrumpido excluye su último registro incompleto y mantiene el rechazo de duplicados.
- Nuevas pruebas:23 llamadas pagadas, dos guiones reales, respuestas originales antes del revisor. Se conservan request/response, tiempos, recibos y evaluación semántica fuera del repo. Sin imágenes/video/TTS comprados ni edición de proyectos originales.
- La revisión de ADR-0043 sigue **temporal**. Los nuevos borradores contienen errores semánticos; no se retira solo para reducir latencia. Estos ensayos tampoco certifican la precisión del revisor actual. Permanecen las comprobaciones locales de IDs, que no consumen otra llamada de IA.

Fuente: [Rate Limits de DeepInfra](https://docs.deepinfra.com/account/rate-limits). Evidencia: `Reportes/2026-09-28-batch-policy/Lotes de 20 y validacion de redactores.md` en el vault. Detalles y límites del fix: `fixes/2026-09-28_restore-prompt-batches-and-model-recovery.md`.
