# Fix: la última escena menor a 3 segundos queda estática

- **Fecha:** 2026-09-29
- **Rama:** feat/animation-scenes-dev-20260922
- **PR:** #91, abierto hacia dev.

## Causa

El planificador convertía cualquier intervalo positivo en un encargo de al menos
4 s (6 s en el prefijo automático). También permitía unir 3 s con la cola parcial
del audio. Esto animaba escenas finales demasiado breves y cobraba clips que el
usuario prefiere conservar como imágenes. Los recibos históricos se añadían por
fuera del planificador y podían eludir una exclusión aplicada solo al plan nuevo.

## Corrección

El plan compartido identifica la última escena por el final real del proyecto.
Si dura menos de 3 s la omite, tampoco la absorbe en una pareja y no suma duración
solicitada ni créditos. Es una omisión prevista, no un rechazo que dispare modal
de fallo o bloquee el resto. Exactamente 3 s sigue siendo elegible; solo se tolera
el error numérico mínimo de punto flotante.

Formulario/pipeline, editor, galería y estimaciones usan la misma política. La UI
explica la cola estática, permite continuar con escenas aptas de una selección
mixta y no dice «todo animado» cuando solo queda esa cola.

Los reemplazos históricos que incluyen la cola se protegen completos para no
reemplazar media pareja. Los recibos pendientes también se conservan completos,
sin reanudarlos ni comprar otro clip para su primera imagen. Los clips listos
siguen visibles y pueden deshacerse antes de volver a animar las escenas aptas.

## Límites deliberados

No se borran clips ni recibos ya pagados al actualizar la aplicación. Un clip
histórico que ya contiene la cola sigue en el proyecto hasta que el usuario
utilice «Deshacer animación»; esta corrección impide nuevos encargos de esa cola.

No cambia la fragmentación, narración, timestamps, render, proveedores, cuotas,
contrato Rust ni generación de guiones/prompts. Una escena corta intermedia y una
porción de menos de 3 s debida al recorte de un rango conservan su política: no son
la última escena corta real. Las imágenes conservan sus movimientos Ken Burns
existentes; «estática» significa que no se genera video IA para esa fuente.

## Validación reproducible

```sh
pnpm format
pnpm lint
pnpm build
pnpm exec tsc -p tsconfig.pipeline.json
pnpm check:locales
```

Los escenarios locales ejercitan el planificador y el generador reales con datos
aislados y un proveedor centinela que falla si se instancia para una cola
excluida. Se comprueban límites menores a 3 s y exactamente 3 s, parejas, selección
mixta, intervalos históricos, estimaciones, ausencia de errores y conservación de
los archivos. Scripts/evidencias temporales fuera del repositorio, sin APIs pagadas.
Resultados completados: **37/37 casos locales** del planificador, generador,
detección de trabajo y fase automática; **39/39 comprobaciones de utilidades UI**,
estimaciones, rangos y tarjetas del pipeline. La red permanece bloqueada y el
proveedor centinela registra cero invocaciones en los casos excluidos.

App macOS Apple Silicon recompilada con firma ad-hoc y codesign verificado. Su
sidecar empaquetado ejecutó **3/3 casos aislados** mediante animate-scenes: cola
individual de 1 s, pareja pendiente histórica 3+1 s y pareja lista histórica con
force. Todos devolvieron animated/failed/rejected vacíos y créditos cero, sin
claves API ni binarios multimedia suministrados al job. Los archivos de cada
fixture (escenas, imágenes, metadata y clip cuando existe) conservaron sus hashes.

Format, lint, build, tipos del pipeline y paridad es/en/pt completados. Se utilizó
Node 22 y pnpm_config_verify_deps_before_run=warn solamente en esta máquina, por
el fingerprint de versión descrito en el fix de integración de dev. Ningún script
personal ni fixture se añade al PR. No se han certificado Windows/Intel ni se ha
operado el webview en estas comprobaciones.

## Pruebas manuales

Pendiente de validación visual por el usuario. Para aceptar: proyecto con final
3+1 s → se anima la escena de 3 s y la última conserva su imagen; final3+3 s →
pareja normal. Seleccionar solo la cola en editor/galería muestra explicación sin
permitir compras; seleccionar otras junto con ella anima solamente las aptas.
Revisar narración/duración total, deshacer histórico y reabrir el proyecto.
