# Fix: conservar prompts aceptados y reintentar únicamente fragmentos pendientes

- **Fecha:** 2026-09-28
- **Rama:** `feat/animation-scenes-dev-20260922`
- **Área:** redactor de escenas de Mi estilo; lectura y recuperación de respuestas.

## Causa

El redactor ya reintentaba solo los faltantes cuando **todos** los prompts traían IDs válidos. Sin embargo, había caminos que perdían esa propiedad:

- Una mezcla de respuestas con y sin IDs podía caer en la asignación por posición. Un conteo aparentemente correcto no garantizaba que la imagen correspondiera a la narración.
- Un ID duplicado elegía su primera versión, aunque las dos podían describir escenas distintas.
- Una entrada contaminada descartaba todo el lote, incluyendo prompts identificados y utilizables.
- Un stream cortado por límite de salida, desconexión o falta de terminación descartaba prompts completos ya recibidos; repetir el lote volvía a solicitarlos.
- El rescate histórico por número de líneas podía separar incorrectamente un prompt con ID escrito en varias líneas.
- Dentro de un JSON completo, un prompt vacío/nulo o un elemento malformado invalidaba el contenedor entero, perdiendo también las respuestas identificadas de sus hermanos.

## Corrección

`verbatim-writer.ts` conserva por ID los prompts utilizables. Un faltante, ID duplicado, contradicción entre el ID JSON y el marcador del texto, respuesta contaminada o rechazo del contrato local deja pendiente únicamente esa escena. Los IDs extra se descartan y nunca sustituyen fragmentos pedidos.

Las escenas que incluyen contexto temporal exigen IDs explícitos aun cuando el conteo total coincida. Una mezcla de IDs nunca se interpreta por posición. Las entradas históricas sin contexto temporal conservan compatibilidad con respuestas anónimas completas de conteo exacto.

`parser.ts` recupera únicamente contenido delimitado de un stream interrumpido: cierre del bloque, separador de prompts o comienzo del siguiente ID. El texto final sin terminar no se acepta. Se conserva su ID vacío para detectar un posible duplicado de una entrada anterior. Un JSON incompleto no se reconstruye inventando cierres. En un JSON completo, un elemento defectuoso conserva su ID o un hueco anónimo: no invalida sus hermanos y no desplaza posiciones.

El prefijo recuperado atraviesa los mismos controles de personajes y la misma revisión narrativa que una respuesta completa. Solo después se persiste. Los prompts aprobados quedan excluidos de las solicitudes siguientes, incluyendo rescates con otro modelo. No se cambia el fragmentador, el guion, los tiempos, la voz ni los assets pagados.

La política de tamaño de lote y los perfiles de modelos se documentan por separado en ADR-0044. Esta corrección funciona con el tamaño exportado por el escritor. La verificación final se ejecutó con **lotes de 10, hasta 8 lotes simultáneos y timeout de 45 segundos por solicitud temporal**, sin extender ese timeout a previews.

## Límites deliberados

- Sin IDs no existe una manera fiable de identificar qué fragmento se omitió o reordenó. En escenas temporales se vuelve a pedir el conjunto aún no aceptado; no se adivina una correspondencia.
- Una respuesta con un ID duplicado no permite elegir una versión por ser la primera. Se conserva el resto y se vuelve a pedir ese ID.
- Los prompts incompletos y el JSON cortado no se consideran trabajo aceptado. La recuperación no es un mecanismo para aprobar texto truncado.
- Al fallar un stream, el cliente actual no devuelve su `usage`. No se inventan tokens o costos para ese intento. El proveedor puede haber facturado parte de la generación fallida.
- Cancelar conserva los lotes que ya se persistieron y detiene nuevas solicitudes. No se inician revisiones ni se aceptan respuestas incompletas después de la cancelación. Un fallo de disco sigue siendo un límite real de persistencia.
- La revisión narrativa sigue siendo **temporal y probabilística**. IDs válidos garantizan identidad estructural, no ausencia de errores semánticos del modelo.
- Los scripts locales de verificación y las respuestas simuladas quedan fuera del repositorio y no forman parte del PR.

## Validación reproducible

### Casos de recuperación y correspondencia

Se ejecutaron **32 comprobaciones** contra las funciones reales del pipeline: 19 de lectura, 9 del escritor completo y 4 con el cliente SSE real y transporte simulado.

| Grupo          | Entradas y resultado requerido                                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Faltantes      | 20 fragmentos, respuesta sin ID 7: conservar los demás y solicitar únicamente 7. Con lote 10, las solicitudes iniciales son 1–10 y 11–20; después, solo 7. |
| Orden          | IDs reordenados conservan su correspondencia; no se asignan por índice de array.                                                                           |
| Mezclas        | Texto y JSON con IDs parciales conservan entradas inequívocas y reintentan lo no identificado.                                                             |
| Duplicados     | Repetición del mismo ID afecta solo ese ID, incluso cuando la segunda versión queda cortada en el stream.                                                  |
| Contaminación  | Una entrada defectuosa afecta su ID; un ID extra defectuoso no descarta entradas válidas.                                                                  |
| Formato        | IDs vacíos, líneas consecutivas, indentación y prompts envueltos no desplazan ni recortan otras escenas.                                                   |
| JSON           | IDs contradictorios se rechazan; un JSON incompleto no se acepta como prosa.                                                                               |
| Compatibilidad | Respuesta anónima completa sigue funcionando sin contexto temporal; en escenas temporales se exige identidad explícita.                                    |
| Validación     | Un rechazo de personaje o de revisión narrativa vuelve a pedir solo esa escena.                                                                            |
| Streams        | `finish_reason=length`, EOF sin `stop`, desconexión y timeout conservan 9 prompts completos del lote de 10 y solicitan solo el pendiente.                  |
| Concurrencia   | 45 escenas se reparten según la constante exportada; un faltante se solicita una sola vez después de los lotes iniciales.                                  |
| Cancelación    | No se vuelven a comprar los lotes ya persistidos y no se inicia otra ronda después del aborto.                                                             |

En los fixtures SSE el timeout se acelera únicamente en el reloj del test; se comprueba la ruta real de aborto del cliente. No se espera ni se modifica el plazo de producción.

Además se ejecutaron **7 comprobaciones de la política final**: 88 escenas con máximo de 8 fetches concurrentes; cola detenida ante 401, saldo insuficiente, cancelación o fallo no verificable del revisor; caso explícito de 20 fragmentos con solo el 7 pendiente; y ausencia del timeout temporal en entradas históricas sin contexto temporal.

**11 comprobaciones adicionales de JSON** cubren prompts vacíos, nulos, numéricos o ausentes; ítems nulos/malformados; IDs de tipo string o ausentes; duplicados y contradicciones entre ID JSON y marcador. El caso integrado devuelve primero los IDs 1 y 3, los persiste y solicita únicamente el ID 2.

Evidencia local: `/private/tmp/vimo-partial-prompt-retries-20260928/`, archivos `results.txt`, `queue-results.txt`, `json-results.txt` y scripts asociados. Los fixtures importan `VERBATIM_BATCH_SIZE`: no suponen que el producto siga usando 20.

```sh
node --experimental-strip-types /private/tmp/vimo-partial-prompt-retries-20260928/check.mjs
node --experimental-strip-types /private/tmp/vimo-partial-prompt-retries-20260928/client-check.mjs
node --experimental-strip-types /private/tmp/vimo-partial-prompt-retries-20260928/queue-check.mjs
node --experimental-strip-types /private/tmp/vimo-partial-prompt-retries-20260928/json-partials.mjs
pnpm exec tsc -p tsconfig.pipeline.json --noEmit
```

Los scripts anteriores son evidencia local, no herramientas versionadas disponibles automáticamente en otro checkout. La tabla anterior especifica las respuestas simuladas y las invariantes para reproducirlos.

### Auditoría de previews y Catálogo

Los **67 checks existentes** de `check-preview-regressions.mjs` y `check-catalog-prompts.mjs` pasaron. Se añadieron fuera del repo 6 comprobaciones de igualdad de perfiles/call sites contra `b7390e73`: Scout, GPT-OSS Turbo y Ultra conservan sus perfiles técnicos; las muestras no llaman al redactor por lotes; el protagonista de previews sigue fijado a Ultra; V4 Pro continúa disponible técnicamente para el revisor.

```sh
node --experimental-strip-types --test scripts/test/check-preview-regressions.mjs scripts/test/check-catalog-prompts.mjs
```

El comando independiente de diseñar un personaje de Mi estilo sí consulta el selector de modelos, como ya lo hacía; por ello hereda su nuevo predeterminado. No debe confundirse con el protagonista usado por las previews, que permanece fijado a su perfil anterior.

### Guard existente de persistencia

`check-verbatim-prompt-persistence.mjs` dejó de fijar 20/21 como frontera: importa `VERBATIM_BATCH_SIZE`, construye una tanda completa y otras cinco escenas pendientes. Se conserva la intención original del guard cuando cambia la política de lotes.

También se completó su mock del revisor: el redactor recibe SSE y la revisión recibe JSON no-streaming con evidencias derivadas de sus candidatos, igual que el guard existente de Catálogo. Antes de corregir ese fixture se comprobaron los mismos **4 fallos de 6** en un snapshot limpio de `b7390e73`; no eran una regresión introducida por este cambio. Con el contrato simulado correcto, las **6 comprobaciones de persistencia pasan**, incluyendo reanudación sin recomprar prompts y protección de respuestas tardías tras cancelar. Esta aprobación simulada prueba persistencia, no la calidad del revisor.

```sh
node --experimental-strip-types --test scripts/test/check-verbatim-prompt-persistence.mjs
```

Evidencia: `persistence-head-results.txt` frente a `persistence-final-results.txt` en el directorio local de verificación.

## Pruebas manuales realizadas

No se hicieron clics ni generaciones de imágenes/videos en la aplicación para esta corrección. Se verificaron fallos inyectados sobre el escritor y el cliente real, sin gastar créditos externos. No se declara validada una instalación nativa a partir de estas comprobaciones.

Antes de publicar, probar en la aplicación un proyecto nuevo y una reanudación con prompts ya guardados: las escenas aceptadas deben mantener su texto, IDs y tiempos; ninguna imagen debe generarse con un prompt pendiente o no verificable. Las llamadas reales de evaluación de modelos pertenecen al informe de modelos de esta fecha, no a estos fixtures.
