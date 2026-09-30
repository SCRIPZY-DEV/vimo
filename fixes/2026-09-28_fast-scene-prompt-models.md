# Fix: redactores rápidos y recuperación selectiva de prompts

- **Fecha:** 2026-09-28
- **Rama:** feat/animation-scenes-dev-20260922

## Causa

El catálogo elegible V4 Pro/Haiku priorizaba calidad pero su predeterminado tenía costo alto. Algunos candidatos económicos consumían su presupuesto razonando sin entregar texto. En un lote de 19 fragmentos, V4.1 Flash demoró 31–65 segundos y MiMo Flash sin razonamiento 58–73. Además, todos los lotes se despachaban simultáneamente y una petición colgada podía esperar diez minutos.

## Corrección

**DeepSeek V4.1 Flash** es el predeterminado y **Haiku 4.5** permanece como alternativa. V4 Pro conserva uso técnico como revisor temporal; MiMo Flash `none` queda interno para animación por sus omisiones de vestuario en la muestra estática. El catálogo central gobierna todos los selectores y las preferencias antiguas, sin migrar archivos del usuario. Los perfiles de previews/Catálogo y los tiers compartidos de guion permanecen iguales.

Mi estilo utiliza lotes de diez, con el guion completo, personaje y contexto local. Ocho lotes en vuelo por invocación y timeout de 45 segundos por petición temporal. Cancelación y fallos terminales detienen la cola; los resultados guardados permanecen. El estimador usa el tamaño efectivo también como respaldo. Recuperación por ID/stream y animación se documentan en los otros dos fixes de esta fecha; ADR-0044 registra la política y su antecedente.

## Límites deliberados

No se garantiza menos de un minuto con cualquier cantidad de escenas, revisión, correcciones o fallos de red. No se elimina el revisor temporal ni se promete coherencia universal. No se modifican guiones, cortes, imágenes, audio, clips ni tiempos existentes. Ocho lotes es un límite local por invocación, no un planificador global entre proyectos. La estimación usa la tarifa regular Flash USD0,20/0,60 por millón de tokens de entrada/salida; una promoción puede cobrar menos.

La revisión rápida alternativa se descartó: V4.1 Flash y Haiku normalizado aprobaron causalidad invertida y una acción anticipada durante silencio. Haiku además devolvió Markdown fuera del contrato JSON. El revisor V4 Pro conserva limitaciones y falsos rechazos; si un PR incluye este validador debe declararlo **temporal mientras se corrige la correspondencia original**, no presentarlo como solución infalible.

## Validación reproducible

Completado sobre este cambio:

- `pnpm format`, `pnpm lint`, `pnpm build`, en ese orden: correctos.
- `pnpm exec tsc -p tsconfig.pipeline.json --noEmit`: correcto.
- `pnpm build:sidecar`: SEA macOS arm64 reconstruido y ejecutado.
- Guard externo de catálogo: 20 comprobaciones. Oferta, preferencias antiguas, rescates y perfiles protegidos.
- SEA contra servidor local: 12 casos de catálogo/resolución y tres ejecuciones completas hasta `scene-prompts`. Cada una genera 20 prompts con un fallo inducido: ID faltante, ítem JSON nulo y stream truncado. El request adicional contiene solo `[7]`, `[7]` o `[10]`, respectivamente; se conservan audio, guion, transcripción, orden y tiempos. El evento de progreso conserva su reemisión histórica incremental/final; no se exige exactly-once.
- Los fixes asociados detallan 32 comprobaciones de recuperación, 7 de cola/deadline, 11 de JSON, 6 de persistencia, 67 de previews/Catálogo y 17 del adaptador de animación.

Los scripts temporales se encuentran fuera del repo: `/private/tmp/vimo-fast-writers-20260928/`. No se incluyen en el commit. Para reproducir sin ellos: servidor local con SSE/JSON controlados, proyecto sintético de 20 escenas, `run-video-pipeline` con `untilStage: scene-prompts`, capturar IDs de cada request y comparar archivos antes/después. Nunca usar proyectos reales para fixtures.

### Medición real

Cuatro llamadas con mensajes/cliente/parser de producción y el mismo guion: 10+9 fragmentos en paralelo. DeepSeek produjo 19 prompts en **23,68 s / USD0,0021164248**; MiMo en **30,49 s / USD0,00203126**. Ambos mantuvieron los anclajes temporales examinados; hubo omisiones y detalles mejorables. Estos tiempos excluyen revisión.

Prueba integrada de redactor, tejido del personaje, finalización y revisor de producción: **19 prompts completos en 88,89 s**, ocho llamadas por USD0,06255253920409598. La redacción inicial terminó en 29,82 s. Se guardaron 14 prompts y solo los IDs 9,13,17,18,19 se reescribieron; algunos rechazos del revisor fueron discutibles. No fue una corrida audiovisual ni una medición de guion/voz/imágenes.

Total de esta entrega: **29 llamadas reales / USD0,12487232000409598**, incluyendo animación y evaluaciones descartadas. No se suma de nuevo la investigación previa de 24 llamadas. Recibos, desacuerdos y respuestas se conservan en el vault, `Reportes/2026-09-28-fast-prompts-implementation/` y sus informes enlazados.

## Pruebas manuales realizadas

Inspección de peticiones/respuestas y diffs, evaluación textual del mismo guion y ejecución del sidecar compilado. No se realizaron clics en una app Tauri instalada, ni se instaló un DMG nuevo. No se compraron medios Kie/Evolink. Para la aceptación visual: probar un proyecto nuevo, una reanudación, una animación individual y una fusión; verificar que escenas, narración y recursos anteriores permanezcan intactos.
