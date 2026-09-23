# Fix: rescate acotado y diagnóstico del redactor de animaciones

- **Fecha:** 2026-09-22
- **Rama:** `feat/animation-scenes-dev-20260922`

## Causa

Las ejecuciones históricas de las escenas 4, 12 y 13 mostraban
`animation_prompt_failed`, pero ese resultado no distinguía JSON truncado,
contrato incompleto, rechazo de continuidad ni una falla del proveedor. Los logs
conservados no permiten afirmar cuál fue la causa exacta de cada ejecución pasada.
La captura del modal, por sí sola, tampoco lo determina.

La reproducción local sí comprobó que dos respuestas JSON incompletas agotaban
el redactor sin explicarle al siguiente intento qué debía reparar. También se
comprobó que una respuesta 401 podía terminar presentada como error genérico de
redacción en vez de conservar su clasificación de credenciales.

La auditoría del nuevo rescate detectó además un caso de transporte: el proveedor
compartido devuelve `response.json()` y un HTTP 200 con cuerpo no JSON lanza
`SyntaxError`, no `PipelineFailure`. Tratar toda excepción desconocida como fallo
de programación impedía el rescate incluso si el siguiente modelo podía responder
correctamente. Se reprodujo con el proveedor real y `fetch` sustituido localmente,
sin llamadas de red.

Las pruebas reales de texto también mostraron la necesidad de separar lo que la
narración menciona de lo que la descripción de la imagen establece. Una idea
hablada puede atravesar un corte sin autorizar nuevos objetos o participantes en
la referencia siguiente. Un revisor sin evidencias verificables podía rechazar
movimiento válido o atribuir al candidato frases que no había escrito.

## Corrección

El cambio se limita al redactor de animación en `pipeline/animation/prompt.ts` y a
su conexión con el diagnóstico existente en `pipeline/animation/generate.ts`.

- Se solicita JSON estricto y se usan los tres tiers ya configurados, en orden:
  `premium` (DeepSeek V3.2), `economy` (Mistral Small 3.2) y `balanced` (Qwen3
  235B). No se añaden proveedores ni se modifica la selección compartida de modelos.
- Cada candidato debe conservar todos los IDs, segmentos, tiempos y campos
  requeridos; el prompt ensamblado sigue limitado a 4000 caracteres. Los errores
  de estructura, longitud y acciones repetidas tienen códigos propios y devuelven
  instrucciones concretas de reparación al siguiente redactor.
- Cada candidato estructuralmente válido pasa por el revisor `premium`. Solo una
  revisión malformada o un fallo recuperable de transporte permiten repetir esa
  revisión con `balanced`. Un rechazo semántico válido no se somete a varios
  revisores hasta obtener aprobación: vuelve al redactor con las correcciones.
- La revisión recibe `visual_references` y `narrative_context` separados. Sus
  evidencias citan campos del candidato y la descripción visual de la misma escena.
  El parser comprueba las citas por `scene_id`, permite únicamente normalización
  gráfica de Unicode, espacios y mayúsculas, y rechaza citas inexistentes o tomadas
  de otra escena. La narración no se usa como prueba de inventario visual. Una
  aprobación exige todas las citas válidas; un rechazo conserva sus issues
  comprobados aunque una cita secundaria ajena a ellos resulte malformada.
  Cada issue debe citar texto real y una escena con evidencia válida.
- Ante un rechazo válido, se entrega el **borrador rechazado de esta ejecución**
  junto con sus correcciones para reparar el movimiento concreto. Nunca se envía
  el prompt histórico del clip anterior; rehacer conserva solo la indicación de
  remake y se fundamenta en las referencias y narración actuales. El pensamiento
  debe expresarse mediante gestos observables, sin proponer imágenes mentales
  ausentes que el generador pudiera materializar.
- Una cancelación, credenciales rechazadas, saldo insuficiente o cuota agotada
  después de los reintentos del dispatcher detienen esta cadena. No se pasa a otros
  redactores para ocultar esos errores. Las excepciones de programación no
  clasificadas siguen propagándose.
- Se clasifican localmente los `SyntaxError` de respuesta y las interrupciones del
  body reconocidas por sus códigos de transporte. El proveedor y dispatcher LLM
  compartidos no cambian. Los fallos finales de red/servicio conservan su código
  LLM en lugar de culpar al guion.
- Los eventos `provider-failure` existentes registran fase, tier solicitado,
  intento, escena y causa técnica. Los nuevos eventos no incluyen el guion, el
  candidato ni las correcciones del revisor.

La decisión y el flujo se documentan en
[ADR-0042](../docs/adr/ADR-0042-animacion-kie-por-intervalos-y-recibos.md).

## Límites deliberados

No se cambian el modal de reintento, los recibos pagados, la publicación de clips,
los tiempos, las referencias de imagen, la cuota de Kie ni el contrato de eventos.
Los trabajos con recibo siguen recuperando su resultado sin volver a redactar ni
comprar otro video. Guiones, previews, prompts estáticos y dispatcher LLM compartido
permanecen fuera de este cambio.

El máximo propio es de tres candidatos y hasta dos revisiones por candidato. Los
reintentos de transporte/cuota ya existentes en el dispatcher pueden implicar más
llamadas HTTP; esos límites lógicos no equivalen a nueve peticiones HTTP máximas.

No se devuelve un prompt de relleno al agotar los modelos. Si ninguno produce un
candidato válido y aprobado, se conserva el error y el modal existente permite
reintentar sin perder el clip o imagen anteriores. Preservar ese rechazo es
preferible a encargar video con elementos inventados.

Las citas verifican que el texto citado exista en la fuente correcta. La
interpretación de su significado sigue dependiendo del modelo: esto no es visión
ni una garantía de exactitud semántica o de fidelidad audiovisual. Tampoco garantiza
que los proveedores estén disponibles o que nunca se vuelva a mostrar un error.

## Validación reproducible

Desde el worktree de esta rama, completar las comprobaciones de formato acotadas
al cambio y luego:

```bash
pnpm lint
pnpm build
pnpm exec tsc -p tsconfig.pipeline.json --noEmit
pnpm check:locales
```

El harness personal de recuperación vive fuera del repositorio. Mientras exista
en esta máquina se puede repetir, sin consumir APIs:

```bash
node --experimental-strip-types /private/tmp/vimo-animation-prompt-rescue-20260922/check-prompt-rescue.mjs
```

Cubre JSON/estructura/longitud, rechazo semántico, repetición exclusiva del revisor,
transporte, 401/saldo/429, cancelación, límites, evidencia por escena y conservación
de los archivos usados como fixtures. La ejecución final registra **36
comprobaciones locales** aprobadas, incluyendo el borrador actual, el rechazo
parcial fundamentado, un body HTTP interrumpido y cancelación dominante.

Evidencia temporal adicional, también fuera del repositorio:

- `review-grounding-live-results.json`: cuatro decisiones reales del revisor,
  dos rechazos de material no respaldado y dos aprobaciones de movimiento
  respaldado. Los cuatro veredictos coincidieron con el esperado. Una cita tuvo
  una diferencia gráfica de mayúsculas/espacios, tratada por la normalización
  limitada del contrato final; no se acepta una paráfrasis como cita exacta.
- `live-final-results.json`: seis casos de redacción y revisión de texto reales,
  con cinco aprobados. Incluye rescates Mistral y Qwen provocados mediante fallos
  iniciales controlados. La fusión 5–6 agotó los intentos al introducir elementos
  no respaldados y permaneció rechazada, sin solicitar video.
- `live-final-repair-results.json`: repetición de la fusión 5–6 y escena 13 con la
  reparación del borrador actual: ambos casos aprobados, nueve llamadas HTTP.
  La fusión conserva 0–3 y 3–6 segundos. La revisión manual encontró una
  descripción mental ambigua en la escena 13 y motivó el refuerzo posterior.
- `live-final-visible-results.json`: el refuerzo de gesto observable detuvo la
  escena 13 tras siete HTTP al no obtener una revisión válida. Reveló que una
  cita secundaria defectuosa descartaba una crítica correcta sobre partículas
  añadidas. El rechazo se conservó sin comprar video.
- `live-replayed-repair-results.json`: reproducción controlada con las cuatro
  respuestas iniciales anteriores, sin pagarlas de nuevo. Con el parser final,
  se conserva la crítica válida y Qwen recibe el borrador correcto para repararlo.
  Dos llamadas nuevas reales (redacción Qwen + revisión DeepSeek) completaron
  el caso con 2196 caracteres. No equivale a seis ejecuciones frescas 6/6 de la
  versión final ni establece una tasa general de éxito.

Los archivos de evidencia anteriores están en
`/private/tmp/vimo-animation-prompt-rescue-20260922/` y pueden desaparecer al limpiar
el sistema. Ningún script temporal, respuesta privada ni imagen se incorpora al
commit del producto. Las ejecuciones reales de texto leen copias de contexto y
comprueban hashes para detectar cambios en los proyectos; no deben ejecutarse
nuevamente como si fueran pruebas gratuitas sin considerar su consumo de LLM.

## Pruebas manuales realizadas

Se inspeccionaron los prompts, dictámenes y diagnósticos de las pruebas reales de
texto de `video-1` y `video-3-2`, separando errores del contrato y rechazos de
continuidad. Las muestras activaron rescates reales de Mistral y Qwen. En total
se realizaron 68 llamadas HTTP de texto entre baselines, variantes y
reproducciones: costo estimado reportado por DeepInfra **USD 0,03639697**.
Los ocho archivos originales de los proyectos conservaron sus hashes SHA-256.

La revisión manual también observó formulaciones interpretables e inferencias
del modelo en planes aprobados: por ejemplo, especificar un recipiente cuando
la referencia textual solo describe comida. No se presenta el dictamen de otro
LLM como prueba de correspondencia visual. La aceptación del video real sigue
siendo necesaria, especialmente cuando la descripción estática es incompleta.

La UI de galería y su aviso de parejas se comprobaron por separado con componentes
reales en Chrome y proveedores/jobs simulados; su alcance está documentado en
[el fix de parejas y tarjetas](2026-09-22_animation-pairing-gallery-notice.md).
Eso no representa una prueba del redactor remoto ni una animación pagada.

También se verificaron formato del alcance, ESLint, build frontend y nativo,
tipos de pipeline y 1374 claves i18n. El ejecutable empaquetado se comprueba
con 30 casos locales de duración, audio, exportación, concurrencia y recibos
sobre fixtures, sin proveedores de video reales.

**No se solicitaron videos a Kie durante estas verificaciones.** No se ha completado
la aceptación de clips pagados en la aplicación nativa para esta corrección. Queda
probar el reintento de las escenas afectadas en el build final, escuchar su voz,
revisar orden y movimiento y comprobar que no cambian los tiempos ni los clips
anteriores si un intento falla.
