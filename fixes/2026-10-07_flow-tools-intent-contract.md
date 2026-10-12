---
title: Contrato opcional de intenciones Flow Tools en Vimo
date: 2026-10-07
tags: [vimo, flow, multimagen, contrato, fix]
---

# Fix: conservar el ejecutor en la intención Flow

- **Fecha:** 2026-10-07.
- **Rama:** `feat/flow-tools-contract-20261007`.

## Causa

El contrato RPC asumía seed numérica y cinco elementos en el hash. Añadir sólo
el campo a la interfaz permitiría perder el ejecutor al reservar, persistir o
restaurar; además compartiría la caché de capacidad y admitiría solicitudes contra
un coordinador incompatible. Es una prevención al extender el contrato, no una
causa atribuida al rechazo externo de las cuentas QA.

## Corrección

Se incorpora el plan estricto opcional, semilla null Tools, sexto elemento
canónico en su hash y capability global antes de capacidad/reserva/envío.
Cliente, almacenamiento, servicio y supervisor Rust validan sus fronteras. La
whitelist nativa conserva los doce códigos del contrato, sin mensajes internos.
Productores conservan el plan en proyecto/intención y replay, sin cambiar RPC;
recibos de otro plan no se importan ni provocan generación. El API y hooks aíslan
capacidad/caché por plan, conservan mínimos y feedback compartido; códigos nuevos
tienen traducción ES/EN/PT. Detalle, procedencia y diagrama en
[integration.md](../docs/handoff/2026-10-07-flow-tools-contract/integration.md).

## Límites deliberados

Sin vendor nuevo, selector habilitado, preferencia global, cambios de precios,
permisos, secretos, políticas, dispatcher ni importador JPEG. No se modifica
`visualSourceSceneId`, `animation_image_locked`, lote323, datos, perfiles ni QA
servida. La compilación fuente carece de configuración nativa QA; no es una app
lista para abrir. Build SEA/Tauri y aceptación real quedan para entrega coordinada.

## Validación reproducible

Los fixtures son locales externos, no tests oficiales versionados. Sus hashes y
los de las fuentes probadas quedan en el manifiesto de entrega externo.

```sh
node /Users/sebas/Documents/Vimo-Flow-QA/2026-10-07-multimagen-wire-evidence/check-execution-plan-equivalence.mjs
node /Users/sebas/Documents/Vimo-Flow-QA/2026-10-07-multimagen-wire-evidence/check-client-storage.mjs
node /Users/sebas/Documents/Vimo-Flow-QA/2026-10-07-multimagen-wire-evidence/check-service-guards.mjs
node /private/tmp/flow-tools-producers-check.mjs
node /Users/sebas/Documents/Vimo-Flow-QA/2026-10-07-multimagen-contract-evidence/frontend-capacity/check-frontend-capacity.cjs
python3 -B /Users/sebas/Documents/Vimo-Flow-QA/2026-10-07-multimagen-wire-evidence/rust/whitelist-final/check-rust-whitelist.py
```

Rust usa Cargo offline en carpeta fixture externa, sin enlazar la app. Las otras
sondas ejecutan fuente real con fronteras simuladas descritas en el handoff. Se
comprueban también formato acotado a archivos propios, `pnpm lint`, `pnpm build`,
`tsc -p tsconfig.pipeline.json --noEmit`, rustfmt y simetría de locales. Los logs
finales y cobertura de formato se entregan fuera del repo; no se acredita un test
end-to-end a partir de estos controles.

## Pruebas manuales realizadas

Ninguna: no se abrió, reinició o instaló la app ni se generó en Google. QA activa,
puertos, credenciales, pausa y proyecto del usuario permanecieron fuera del alcance.
