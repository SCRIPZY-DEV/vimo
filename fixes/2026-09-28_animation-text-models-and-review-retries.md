# Fix: faster animation prompt writers without rewriting valid drafts on review failure

- **Fecha:** 2026-09-28
- **Rama:** `feat/animation-scenes-dev-20260922`

## Causa

El redactor de movimiento utilizaba `createSceneLlm` y los tiers globales: DeepSeek V3.2, Mistral Small y Qwen3. Cambiar el catálogo de redactores de imágenes no cambiaba esos modelos de animación. El generador de movimiento necesitaba una política propia para usar los perfiles evaluados sin modificar guiones, previews o Catálogo.

Además, `buildAnimationPrompt` interpretaba un fallo agotado del **revisor** como motivo para volver a pagar al **redactor**. Un caso reproducible con un borrador válido y un revisor caído ejecutaba tres redacciones y seis revisiones. Ninguna de las redacciones nuevas resolvía ese fallo del servicio.

La prueba real también encontró instrucciones de sonido en un clip que debía ser mudo y tiempos de la segunda escena reiniciados en cero. La instrucción del redactor ya prohibía esas conductas, pero el revisor no explicitaba el control de audio ni el rechazo de ese reinicio de reloj.

## Corrección

- `animation/llm.ts` adapta el contrato existente `SceneLlm` al cliente streaming de producción. Su política local usa V4.1 Flash como primario, MiMo Flash con `reasoning_effort: none` como reparación económica y una última reparación V4.1 Flash con feedback. Haiku queda como respaldo de revisión y rescate de transporte ante timeout; si ese rescate redacta, su candidato debe pasar la misma revisión antes de comprar video. El revisor usa V4.1 Flash y, si su respuesta o transporte fallan, Haiku. Los tiers globales quedan intactos.
- Cada redacción admite 2000 tokens y cada revisión 1000, sin margen de razonamiento adicional. Se exige fin de stream completo y se conserva el parser de JSON. El cliente medido omite `response_format` y parámetros de muestreo; no se finge que la salida esté validada antes del parser.
- Un plazo local de 45 segundos por llamada evita esperar el techo largo del cliente genérico. El dispatcher existente conserva backoff ante 429 y rescate de timeout, resueltos solo contra la política de animación. Saldo, autenticación y cancelación no habilitan esa recuperación.
- `animation/generate.ts` cambia únicamente la factoría textual. Recibos existentes siguen omitiendo la redacción; se conserva su prompt, cobertura, duración y recuperación remota.
- Un fallo agotado de revisión termina con el código correspondiente, sin regenerar el borrador válido. Un rechazo semántico válido sí permite reparar el mismo clip con sus fuentes y feedback.
- El revisor comprueba instrucciones explícitas de audio y marcas de tiempo incompatibles con la ventana global del segmento, además de inventario y continuidad existentes.

La arquitectura y la sustitución de la política histórica se documentan en [ADR-0042](../docs/adr/ADR-0042-animacion-kie-por-intervalos-y-recibos.md).

## Límites deliberados

No se cambia la lógica de guion, previews, transcripción, fragmentación, timeline, normalización de velocidad, creación/poll de Kie, Rust, contratos IPC ni UI. No se modifican clips ya pagados. No se incorpora visión.

El validador narrativo temporal de imágenes es otro componente: este fix no altera su condición temporal ni promete cero errores semánticos. Los modelos de video pueden desobedecer un prompt correcto. Un fallo de revisión mantiene el recurso previo y no autoriza gasto de video nuevo.

El techo de 45 segundos es **por llamada**. Reintentos, revisión, rescates y cola de proveedor pueden superar un minuto; no se garantiza menos de 60 segundos para un video con una cantidad arbitraria de clips.

## Validación reproducible

Desde esta rama, los chequeos de integración generales son:

```sh
pnpm format
pnpm lint
pnpm build
pnpm exec tsc --noEmit -p tsconfig.pipeline.json
```

El harness temporal está fuera del repositorio, conforme a las reglas de contribución:

```sh
node --experimental-strip-types /private/tmp/vimo-animation-writers-20260928/check-adapter.mjs
node --experimental-strip-types /private/tmp/vimo-animation-writers-20260928/check-review-recovery.mjs --assert
```

Diecisiete comprobaciones deterministas ejercitan: perfiles y aislamiento, presupuesto real enviado, esfuerzo `none`, claves faltantes, 401/402/403, stream truncado, EOF incompleto, cancelación previa sin HTTP, timeout con rescate local, fallo de revisor sin nueva redacción, revisión malformada con el mismo candidato, rechazo semántico y reparación sin filtrar prompt histórico y recorrido completo redactor/revisor usando el nuevo adaptador. También verifican que la tercera reparación vuelva a V4.1 con el feedback más reciente y que una salida truncada reciba feedback de JSON compacto sobre el mismo clip. El caso original pasa de tres redactores/seis revisores a uno/dos. Las solicitudes HTTP de estos chequeos están simuladas y no tienen costo.

## Pruebas manuales realizadas

Se ejecutaron **seis redacciones reales de texto** en DeepInfra: aspiradora individual y fusión baño/diagrama, con V4.1 Flash, MiMo Flash sin razonamiento y Haiku. Se reutilizaron casos congelados del proyecto `video-fix-1`, sistema actual de `buildAnimationPrompt` y cliente streaming real. Un evaluador independiente revisó los borradores sin modelos, precios ni latencias; detectar JSON válido se contabilizó aparte de evaluar la semántica.

Se realizaron **cuatro revisiones reales adicionales**: V4.1 Flash y Haiku aprobaron un control con movimiento apoyado en la imagen y rechazaron un caso con defectos inyectados explícitos de reparto, conexión, audio y reloj. El parser de producción reconoció las revisiones. Esto calibra esos dos controles; no prueba sensibilidad universal a cada defecto aislado.

Costo API total de esas diez llamadas: **USD 0,0248572608**. Redacción V4.1 Flash: **7,53 s** individual / **13,28 s** fusión. MiMo Flash: **14,84 / 30,88 s**. Haiku: **5,78 / 8,59 s**. Revisión V4.1 Flash: **5,17 / 10,30 s**; Haiku: **3,12 / 7,79 s**. Las medidas de redacción y revisión provienen de solicitudes independientes; no se presentaron como un tiempo integral medido de generación del clip.

Evidencia local: `/private/tmp/vimo-animation-writers-20260928/`, con copia durable en el vault bajo `Reportes/2026-09-28-animation-text-models/`. No se guardan claves ni cabeceras de autorización.

No se compraron videos en Kie, no se generaron imágenes y no se hizo una prueba manual de reproducción o calidad del MP4 en la app instalada. La aceptación audiovisual queda pendiente del usuario. Los chequeos generales de esta entrega se registran en el informe conjunto; los tiempos anteriores no sustituyen esa validación.
