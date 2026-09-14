# Previews paralelas con recuperación de modelos

Fecha: 2026-09-12. Bugs 1.1 y 1.2.

La generación tenía dos bucles secuenciales: cuatro prompts con Qwen3 235B
(tier balanced, hasta 120 segundos por pedido y reintentos sobre el mismo 429),
seguidos de cuatro imágenes. Las imágenes se acumulaban en memoria y se guardaban
al final. En la UI, el primer evento de imagen reducía la grilla de cuatro a una
tarjeta y los porcentajes de prompts se ignoraban.

La redacción intenta primero UN pedido streaming con los cuatro prompts en JSON,
IDs 1–4 y presupuesto de 3600 tokens de contenido. Reemplaza la política de cuatro
solicitudes iniciales por pedido explícito del usuario del 2026-09-12.
Se conservan los prompts válidos del lote; faltantes, duplicados o inválidos se
redactan individualmente EN PARALELO (900 tokens cada uno). Un fallo HTTP/timeout
del lote usa los modelos siguientes para ese respaldo, sin insistir con otros lotes.
La política interactiva usa Llama 4 Scout → GPT OSS Turbo → GPT OSS Ultra,
modelos ya presentes en el catálogo. Cada intento dispone de 25 segundos;
un 429, fallo de proveedor o respuesta inutilizable pasa al siguiente candidato.
Un modelo fallido se descarta para los pedidos siguientes del mismo job.
Auth y saldo son errores de cuenta, no provocan rotación.
Esto no cambia el modelo elegido para generar las escenas del video (ADR-0028).

Con los cuatro prompts válidos, los cuatro POST de imagen arrancan en paralelo.
Evolink consulta cada segundo solo en previews. No se cambia su plazo de encargo
ni su verificación final, ni el polling de las escenas. El archivo se escribe
atómicamente en cuanto llega y el evento lleva ruta y mtime: se puede verlo mientras
las demás muestras siguen en curso. Un resultado parcial se conserva y el fallo
se comunica; el 100 % solo corresponde al archivo ya escrito.

El avance de redacción combina actividad del stream y estimación temporal, con
techo 95 % hasta validar el prompt. No representa un porcentaje real del LLM.
Evolink informa progreso propio; Fal usa la estimación que ya tenía.

Validación: `node --test scripts/test/check-preview-regressions.mjs` (17 casos:
429/503/timeout/formato inválido, auth/saldo, concurrencia y guardado inmediato en
ambos proveedores; lote parcial/inválido/duplicado, 429, timeout, auth/saldo,
cancelación y fallo individual). Se exige una sola petición LLM para el lote
correcto y concurrencia real para los faltantes. HTTP interceptado, sin gastar créditos. Frontend y pipeline
deben pasar format/lint/build y tsc del pipeline.

QA: generar cuatro muestras con Evolink y después Fal. Las cuatro tarjetas deben
permanecer visibles, las barras de redacción deben avanzar y las cuatro generaciones
arrancar juntas. Una imagen puede terminar antes que las otras y debe verse
inmediatamente. La latencia real de generación y descarga depende del proveedor
y la red; no se garantiza un tiempo de descarga menor a dos segundos.

Fuentes oficiales consultadas:
[Llama 4 Scout](https://deepinfra.com/meta-llama/Llama-4-Scout-17B-16E-Instruct),
[Turbo](https://deepinfra.com/openai/gpt-oss-120b-Turbo),
[Ultra](https://deepinfra.com/openai/gpt-oss-120b-Ultra),
[consulta de tareas Evolink](https://evolink.ai/docs/en/api-manual/task-management/get-task-detail).
