# ADR-0042 — Animación Kie por intervalos, recibos y respaldo automático

- **Estado:** Aceptada
- **Fecha:** 2026-09-14
- **Área:** pipeline | providers | app
- **Sustituye:** las reglas de duración, selección de proveedor, visión y recorte de ADR-0040 y ADR-0041.

## Decisión

El usuario autorizó explícitamente implementar su revisión del 2026-09-14. Se preservan invoke/Channel, el sidecar por job y las seis fases: la operación opcional de animación corre después de completar imágenes, dentro de esa fase, y también desde animate-scenes en el editor.

Revisión del 2026-09-14: al activar animación en el formulario, los primeros N minutos se cortan cada 6 s antes de generar imágenes y prompts. Un minuto completo crea diez escenas; dos minutos, veinte. El resto sigue los segundos elegidos en Mi estilo o la cantidad total de Catálogo, ajustada a escenas de 3–12 s. El plan puro de ventanas se comparte con las estimaciones y la vista previa de cortes. La pausa existente comunica animationMinutes y persiste el conteo sugerido; no añade preguntas.

Las escenas de ese prefijo guardan animationRequestedSeconds=6: incluso si el audio termina en un fragmento incompleto, el encargo es de 6 s y el archivo final se ajusta al intervalo real, sin alargar la narración. Si ya existen prompts, imágenes, tareas o clips, se conservan los cortes históricos. Reanudar no redistribuye trabajo pagado.

En el editor, las escenas existentes conservan sus tiempos: 4–12 se animan individualmente. Revisión autorizada del 2026-09-15: en shorts 9:16 cada escena se anima por separado, incluidas las de 3 s (encargo de 4 s ajustado a 3 s). En 16:9 se conserva la fusión de dos escenas contiguas de 3 s en 6 s aunque expresen lugares distintos. Una escena de 3 s sin pareja encarga 4 s y usa velocidad exacta 4/3 para ocupar su intervalo. Un fragmento menor de 3 s en el borde de un minuto o de un proyecto muy corto conserva el inicio del clip a velocidad normal y se recorta: no se acelera 20 veces un tramo de 0,2 s. Nunca compensa tiempo tomando segundos de la siguiente. Los bordes absolutos se cuantizan al reloj visual de 25 FPS, sin sumar redondeos por escena.

Se conserva la presentación del editor: panel y botón azul, icono de claqueta, spinner, barra de progreso y clips con borde azul y brillo de selección en el timeline. El switch activo del formulario usa el mismo color y responde al clic en todo su encabezado. La tarjeta compartida muestra la estimación a 18 px, la duración a generar y la cantidad de nuevos clips; se retiran de la UI la referencia de 6 s y la explicación sobre cobros.

Revisión autorizada del 2026-09-16: la interacción del 2026-09-14 que abría una ventana individual queda sustituida. «Animar clip», «Rehacer clip» y «Reanudar» ejecutan directamente desde el panel derecho, con estimación compacta, duración, saldo de Kie y actualización visibles antes del botón. Conservan bloqueo por saldo, falta de clave, operaciones incompatibles o demo, y el spinner y progreso durante la tarea. El recibo histórico mantiene título singular/plural, duración y cargo remoto, o costo desconocido. Al seleccionar una escena absorbida se muestra el recibo del clip que la cubre; rehacer presupone el grupo completo que el sidecar reemplaza de forma atómica.

«Animar el inicio del video» conserva su ventana Radix sin overlay, arrastrable por su encabezado dentro del viewport, incluso sobre el sidebar. Se cierra con X, Escape o clic exterior. El portal no cambia el tamaño del preview y cerrar no cancela una tarea.

El selector del editor admite minutos enteros entre 1 y floor(duración real / 60). En videos menores de un minuto se ofrece animar su duración completa, sin selector imposible. Un borrador vacío conserva la estimación de un minuto y se normaliza a 1 al salir; cero y valores fuera de rango se corrigen antes de presupuestar o enviar. La duración de creación todavía desconocida no se usa como límite ficticio. Se mantiene el contrato existente de minutos enteros y el corte del plan al final del video.

Revisión autorizada del 2026-09-15: «Animar todo el video» se ofrece en shorts 9:16, tanto al crear como en el editor, sin extender por ahora esa opción visible a 16:9. Crear persiste `animateWholeVideo`, mutuamente excluyente con un prefijo positivo; al conocer la duración del audio se reutiliza el cortador de 6 s y la confirmación existentes. No se añaden fases, comandos, IPC ni cambios Rust. El editor envía los ids del trabajo pendiente al comando `animate-scenes` existente, sin `force`. El límite del audio se aplica también al pedir minutos; ninguna solicitud nueva puede rebasarlo. Antes de medir audio propio, la estimación total se presenta como pendiente, nunca como cero créditos.

Ampliar del primer minuto a todo conserva cada clip listo y su recibo, en ambos formatos. Solo se generan intervalos faltantes, incluida la cola estática de una escena parcialmente animada. Un reemplazo pagado pendiente conserva ids válidos aunque el clip anterior todavía lo cubra.

Los prefijos por minutos pueden acabar dentro de una escena. Scene.animations contiene bloques activos con identidad y límites; animationPending contiene candidatos y recibos, sin retirar el anterior hasta validar el nuevo. animation histórico sigue siendo legible. Esto permite ampliar un prefijo sin pagar otra vez su parte existente. Cada versión tiene un MP4 propio, físicamente mudo y ajustado antes de ready; export-clips y preview leen los mismos intervalos.

La política interna es Kie, Grok Imagine Video 1.5 Preview, 480p y formato 16:9 o 9:16 del proyecto. Tras dos fallos remotos confirmados y reintentables del generador se usa Seedance 1.5 Pro. Autenticación, saldo, moderación, 429, fallos de consulta/descarga/procesamiento y envíos ambiguos no son fallos de modelo. No se ofrecen modelos ni PoYo en UI; los datos históricos no se borran.

El redactor recibe texto: guion, prompts estáticos, fragmentos temporales e identidad de personajes. La respuesta exige sujeto principal, acción observable, cámara, movimiento secundario opcional y continuidad por escena; desde el 2026-09-16 se usa el tier premium desde la primera redacción y en una única reparación de salida incompleta: DeepSeek V3.2 por defecto. Si ambas respuestas son inválidas, no se autoriza el POST pagado. La selección es exclusiva del redactor de animación: la configuración global y los prompts estáticos conservan sus modelos. Se mantiene el dispatcher compartido: 429 con esperas limitadas y degradación a equilibrado ante timeout; la preferencia inicial por DeepSeek no es un pin que suprima esa recuperación existente. Se prioriza la acción del sujeto desde los primeros fotogramas y se subordina el ambiente a esa acción. La ventana utilizada debe contener el gesto esencial; se elimina la instrucción de micromovimiento seguido de reposo en clips cortos. El reparto se toma de `charactersPresent` y del prompt estático: la ficha de un personaje no obliga a introducirlo donde no aparece. Las personas presentes mantienen identidad y encuadre, permitiendo movimiento natural. Los clips y recibos previos no se reescriben al reanudar. No usa visión ni inventa un prompt de respaldo que autorice gasto. Las referencias se preparan en el formato del proyecto, especialmente porque Grok ignora aspect_ratio con una imagen. Los tiempos de transición pedidos al modelo son instrucciones, no garantías verificadas.

### Coherencia narrativa dentro del intervalo (2026-09-17)

El redactor recibe las palabras de `words.json` que coinciden con el intervalo de cada segmento. Sus marcas absolutas se trasladan al reloj del clip generado con la misma velocidad que usa la normalización; no se recortan ni reordenan las escenas persistidas. En intervalos con varias ideas, la acción debe repartir el foco según la voz y no prolongar el fragmento inicial durante todo el clip. Si la transcripción falta o es inválida, se conserva el texto local sin inventar precisión temporal; las palabras de duración cero al final del audio se omiten.

El prompt estático actual determina el inventario visual. El guion completo y las frases vecinas explican contexto, pero no autorizan participantes nuevos ni acciones fuera de su ventana. El prompt histórico del remake permanece guardado, pero no se envía al redactor: se indica solamente que es una nueva versión, evitando copiar errores anteriores. Cada segmento recibe solamente las identidades de personajes que le corresponden; una lista vacía no elimina a extras ya visibles. Un objeto pasivo puede seguir fijo mientras se anima el elemento narrativo existente. Se conserva el movimiento concreto y no se exige fabricar un agente oculto para mover un objeto.

Antes de autorizar una solicitud de video nueva, una segunda llamada textual revisa el candidato contra la descripción estática actual, identidades por segmento y narración local con tiempos. No recibe el guion global ni el prompt histórico. Un rechazo devuelve correcciones al redactor y permite un segundo candidato, nuevamente revisado; como máximo dos redacciones y dos revisiones. Una respuesta de revisión inválida o un rechazo persistente produce `animation_prompt_failed`, conservando el clip anterior y sin comprar video. Se reutiliza el tier premium y su manejo existente de errores; no se añade estado público, subcomando o proveedor. La revisión evalúa contradicciones concretas de inventario, reparto, idea y tiempos; no exige que la descripción de una imagen inmóvil enumere cada movimiento o fuerza ambiental. Una deriva u ondulación natural no demuestra la existencia de un participante oculto. La revisión es probabilística, no una certificación visual.

La auditoría de `video-3.3.3` verificó clips de cinco segundos sin desplazamiento acumulado en timeline/render y sí una invención narrativa en el prompt del saco. [Causa, evidencias y límites](../../fixes/2026-09-17_animation-narrative-timing.md). No hay migración de los videos pagados ni garantía semántica por fotograma: una nueva redacción se usa al animar o rehacer; reanudar conserva el recibo original.

## Contrato de ejecución

Antes del POST se persiste un intento creating; después se conserva taskId y resultado remoto. Un cierre entre esos dos puntos queda ambiguo y no repite la compra automáticamente. Las consultas y la normalización reanudan el recibo. La cancelación conserva trabajo y se espera a todas las tareas antes de cerrar el job.

Revisión autorizada del 2026-09-16: sustituye el bloqueo de un único job individual. Los `animate-scenes` comparten la lease del proyecto; todos los otros mutadores conservan lease exclusiva. Cada grupo completo de escenas tiene exclusión propia y los checkpoints releen/actualizan escenas y metadata bajo una lease corta común. Un job no limpia estados de otro y los eventos tardíos se descartan por id de solicitud. El editor acepta múltiples selecciones: hasta diez jobs locales activos por proyecto y el resto en cola visible. La espera no muestra porcentaje ficticio; preparar, esperar cuota y generar son estados distintos. Cancelar retira la cola aún no enviada y solicita cancelar todos los jobs activos, conservando recibos incluso si el jobId llega tarde.

La [FAQ oficial Kie](https://kie.ai/), revalidada el 2026-09-16, declara veinte solicitudes nuevas cada diez segundos, hasta 120/min, sin máximo estricto de tareas activas. Diez es el límite local por recursos, no la cuota del proveedor. El ledger compartido por huella de clave reserva cada POST; otros clientes de la cuenta pueden producir 429. Un rechazo 429 confirmado espera al menos una ventana, respeta Retry-After y aplica backoff acotado sin consumir intentos de respaldo. No se guardan claves en esa coordinación.

Rehacer recupera las unidades del clip listo: mismos segundos solicitados, inicio/fin y referencias, incluso una fusión histórica de seis segundos en un short cuya política nueva genera imágenes individuales. El presupuesto usa ese mismo contrato. El prompt/recibo anteriores pasan al historial al publicar el reemplazo. Revisión del 2026-09-17: se sustituye el envío del prompt anterior al redactor por una indicación de remake sin ese contenido; la nueva acción se fundamenta en la imagen actual y la voz para no heredar participantes o causas inventados. Reanudar una tarea con recibo sigue usando su prompt intacto. La nueva redacción es una intención de mejora, no una garantía de calidad audiovisual.

La exclusión usa turnos propios PID/UUID recuperables al morir el proceso; no elimina el archivo de un nuevo dueño. La cuota reserva cada POST antes del envío. Un registro de cuota corrupto espera una ventana completa bajo exclusión antes de reiniciarse. Escenas y metadata usan archivos temporales únicos, escritura sincronizada y reemplazo por rename; un fallo no se presenta como guardado. Un clip se anuncia listo después de publicar su manifest. Cambiar tiempos con clips o candidatos asociados queda bloqueado.

Las consultas del editor migran oportunistamente clips históricos a MP4 mudo de 480p bajo la misma exclusión. Si hay un escritor ocupado, no migran ni exponen el original con audio. Los archivos y recibos históricos se conservan. Las tareas antiguas de PoYo no autorizan nuevas compras en ese proveedor.

Reanudar consulta tareas existentes y termina descargas pagadas antes de pedir saldo para nuevas unidades. Tras agotar los intentos de generación, el botón explícito del editor permite un presupuesto nuevo; reanudar automáticamente no lo reinicia. Una pausa por saldo mantiene la posición Grok/Seedance y los importes anteriores.

## Costes y consecuencias

Tarifas públicas verificadas el 2026-09-14: Grok480p 2,4 cr/s, Seedance480p sin audio 1,75 cr/s; crédito USD0,005. La FAQ oficial de Kie aclara que las generaciones fallidas no se cobran. La estimación muestra los nuevos segundos encargados × 2,4: 6 s ≈ 14,4 créditos; un minuto ≈ 144; dos minutos ≈ 288. Se retira la contingencia de 6,55 cr/s porque sumaba intentos fallidos como si fueran éxitos cobrados. El respaldo automático cuesta menos; el cargo conocido sigue viniendo del recibo remoto, sin inventar importes ni alterar recibos históricos. Imágenes y redactor tienen coste aparte.

Los fundidos viven dentro del intervalo asignado; no reducen su duración ni añaden una cola fija. La imagen de respaldo se conserva si falla una generación. No se promete exactitud semántica por fotograma ni se verifica visión: eso requiere revisar el resultado.

Revisión autorizada del 2026-09-15: los límites contiguos con un clip animado listo en cualquiera de los lados siempre llevan fundido. Entre dos imágenes estáticas el valor inicial es corte directo; el checkbox del editor habilita el fundido mediante `Scene.staticTransitionIn`, persistido por `update-scenes`. Los marcadores morados, preview, render y exportación de clips comparten la política pura. Se conserva Ken Burns y el reloj de 25 FPS. El fundido usa hasta 8 cuadros del bloque entrante, sin alterar sus límites. No se modifica el transporte, los subcomandos ni las fases.

La inspección pausada muestra el bloque actual opaco; si el render vigente contiene un fundido en ese instante, se superpone el recurso editable sin desmontar el video. Fuera del fundido se conserva la pausa del render final. El campo `renderTransitionVersion` se publica al completar el render y el editor considera desactualizados los renders de una política anterior; no elimina sus archivos. La versión de caché de chunks también cambia. Causa reproducida, superficies protegidas y alcance en [la auditoría de selección y transiciones](../fixes/editor-selection-transitions.md).

## Verificación ejecutable

- `scripts/check-animation-provider.mjs`: contrato HTTP simulado, recibos, respaldo, ambigüedad y fallos de saldo/autenticación/cuota.
- `scripts/check-animation-service.mjs`: prefijos, recuperación y publicación de reemplazos atómicos.
- `scripts/check-animation-coordination.mjs`: procesos independientes, cancelación, muerte del escritor y cuota compartida.
- `scripts/check-animation-timing.mjs`: FFmpeg empaquetado, número real de cuadros, ausencia de audio, cortes, migración y transición entre chunks.
- `scripts/check-animation-frontend.mjs`: componentes y hooks reales en Chrome con servicios simulados.
- `scripts/check-editor-transitions.mjs`: matriz de cortes y fundidos con píxeles reales, límites de chunks, exportación y persistencia sin alterar recibos.
- `scripts/check-animation-packaged.mjs`: contrato NDJSON sobre el ejecutable SEA reconstruido.

Estas comprobaciones no consumen generaciones reales de Kie. La calidad del movimiento, la fidelidad del personaje y el cumplimiento visual de las marcas temporales requieren aceptación con clips reales. El esquema de Grok admite referencias múltiples, pero no garantiza anclas de primer/último fotograma.

## Fuentes

- [Grok schema](https://docs.kie.ai/market/grok-imagine/1-5-preview)
- [Seedance schema](https://docs.kie.ai/market/bytedance/seedance-1-5-pro)
- [Cuotas](https://docs.kie.ai/1973359m0)
- [Consulta de tareas](https://docs.kie.ai/market/common/get-task-detail)
- [Precios](https://kie.ai/pricing)
- [FAQ oficial: tareas fallidas sin cargo](https://kie.ai/)
