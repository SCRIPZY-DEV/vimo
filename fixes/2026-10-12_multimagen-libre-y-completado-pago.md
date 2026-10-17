---
title: Multimagen libre y completado pago de escenas pendientes
date: 2026-10-12
tags: [fix, flow, pipeline, recuperacion]
---

# Fix: Multimagen libre y completado pago

- **Fecha:** 2026-10-12.
- **Rama:** `feat/flow-export-motion`.
- **Base dev:** `87c84e37`, integrada en `8517ca09`; conserva exportación de clips con/sin movimiento.
- **Extensión requerida:** 0.2.32, commit local `d1a80c7`.

## Causa

El coordinador empaquetado imponía 500 envíos locales y dos sustituciones, la pantalla del pipeline destacaba una pausa global que no resolvía errores y el desplegable no mostraba las cantidades del video. No existía consentimiento durable para terminar sólo las escenas faltantes con GPT Image 2. La galería original de Multimagen no observa llamadas externas a su SDK.

## Corrección

Port selectivo del coordinador, preservando comandos privados, identidad, importador nativo y arranque SEA. Capacidad nueva libre, reconciliación paginada, cuatro reemplazos sólo para nuevas intenciones, selección de propietarios mediante `connectionProjects` y salida de agotamiento global. La UI acepta saldo nulo únicamente con `unlimited:true`; no confunde un dato desconocido con disponibilidad.

El pipeline muestra total, listas, generando y pendientes al desplegar la conexión. Retira su botón de pausa Flow; conserva cancelar proyecto y administración explícita. Mensajes ES/EN/PT explican el agotamiento y la espera sugerida sin prometer restablecimiento en tres horas.

«Finalizar con IA paga» aparece ante error de imágenes Flow con escenas pendientes. El diálogo muestra cantidad, GPT Image 2, proveedor configurado y estimación; no se envía nada antes de confirmar. La autorización guarda UUID/proveedor/escenas/lote, recupera recibos gratuitos listos antes de contar, confirma cancelación gratuita y sólo entonces usa el carril pago existente. Reiniciar conserva la autorización. El importador respeta la barrera bajo el mismo lock; un recibo gratuito tardío queda en galería y no sobrescribe una imagen paga. Escenas agregadas después no quedan autorizadas implícitamente.

Muestras de estilo y retratos ya usaban `generateFlowBatch` con plan Tools. Se verificaron esa ruta, frases de estilo, identidad y foto de referencia exacta, junto a importación JPEG real mediante FFmpeg. La extensión 0.2.32 añade un panel propio de resultados nuevos dentro de Multimagen, sin alterar el React de terceros.

[Decisión y flujo](../docs/adr/ADR-0054-recuperacion-multimagen-y-completado-pago.md).

## Límites deliberados

No garantiza ausencia de errores externos ni reinicia límites de Google. No reintenta inmediatamente una invocación incierta en otro modelo. CAPTCHA/sesión/identidad no se eluden. Sólo nuevos trabajos reciben el presupuesto ampliado. No cambia los recibos previos, las cinco vinculaciones o el ledger vivo. No se hizo ninguna generación paga durante las pruebas. La galería superpuesta muestra como máximo 20 resultados del documento actual; el historial completo permanece en Vimo.

## Validación reproducible

```sh
pnpm --config.verify-deps-before-run=false lint
pnpm --config.verify-deps-before-run=false build
pnpm --config.verify-deps-before-run=false exec tsc -p tsconfig.pipeline.json --noEmit
node scripts/test/check-locales.mjs
node /private/tmp/vimo-vendor-bridge-20261012.mjs
node /private/tmp/vimo-check-paid-20261012.mjs
node /private/tmp/vimo-paid-stage-20261012.mjs
node scripts/test/check-character-identity-lock.mjs
node /private/tmp/vimo-route-check-20261012.mjs
node /private/tmp/vimo-auto-recovery-sea-20261012/check-scheduler.mjs
node /private/tmp/vimo-auto-recovery-sea-20261012/check-paid-barrier.mjs
```

- Formato, lint, tipos de frontend/pipeline y build aprobados; 2.151 claves ES/EN/PT alineadas.
- 33/33 escenarios WebSocket contra el vendor real: cinco propietarios, persistencia, agotamiento y 5.000 reservas sin tope500/cuenta. Workers sintéticos, cero Google.
- 25/25 regresiones oficiales de identidad/personajes; stage compatible con contextos parciales sin metadata.
- 3/3 casos del carril GPT Image 2 real con HTTP simulado: genera sólo faltante, no repite imágenes terminadas, rechaza nuevas escenas no autorizadas antes de enviar.
- 8/8 casos de consentimiento: conservar imagen, reinicio, consentimiento cambiado, clave ausente y cancelación fallida antes de activar proveedor pago. Sólo pruebas del límite de autorización, sin API paga real.
- 3/3 rutas de muestras/personajes: coordinador y LLM sustituidos por fixtures, ensamblado de prompts/referencias y FFmpeg reales; ocho muestras y un retrato de prueba. No demuestran fidelidad del modelo remoto.
- Ejecutable SEA empaquetado: 8/8 coordinación con ventana real120s y ambos órdenes de ganador; 6/6 importación, reinicio y barrera de consentimiento pago (incluye los cinco controles previos). Red saliente denegada por sandbox, datos temporales, puertos de Vimo real bloqueados.
- Build nativo firmado localmente; firma profunda verificada. Los siete archivos del bundle entregado coinciden en SHA-256 con el compilado. SEA `ed046d6f2dca7bf3c8c25bb9379921b19501ee571330602b471791c1160181fe`.
- Integración dev previa: 61 tests Rust y diez checks FFmpeg. No hubo cambio Rust posterior.

Los scripts temporales de validación no se incluyen en Git. Informes de prueba conservados fuera del repositorio; no capturas ni secretos en el commit.

## Pruebas manuales realizadas

Ledger real consultado antes del cambio: lote del usuario `ebb80315-ee31-4da3-8d64-8e3d1cd7ae69`, 19/19 imágenes listas, Tools/Lite; prueba de la versión anterior. No se atribuye al candidato. No se verificó la nueva interfaz en Vimo ni la nueva galería con Google: CUA devuelve `Sky Computer Use native pipe startup failed`.

Entrega local: `/Users/sebas/Documents/Vimo-builds/Vimo-0.10.0-flow-recuperacion.app` y extensión `/Users/sebas/Documents/EXTENSION-RPC-FLOW/artifacts/vimo-automate-0.2.32`. Conserva identificador `click.vimo.portable` y la configuración ya existente de cinco cuentas; no reinstala datos. Se pidió al usuario actualizar los perfiles y abrir el nuevo bundle al terminar cualquier generación activa. Aceptación manual pendiente: muestras, personaje con referencia, video, contadores, panel de resultados y confirmación paga sólo si se desea consumir ese proveedor. No push, PR o despliegue.
