---
title: Selección Multimagen por intención y recuperación tras reabrir editor
date: 2026-10-07
tags: [vimo, flow, multimagen, fix]
---

# Fix: selección de ejecutor y recuperación del plan durable

- **Fecha:** 2026-10-07.
- **Rama:** `feat/flow-tools-contract-20261007`.

## Causa

El contrato de fuente e797 aceptaba el plan Tools pero no había una elección UI
ni coordinador compatible incorporado. Una regeneración Tools sobre un proyecto
RPC guarda su plan por intención; al reabrir el editor, la memoria local del
selector desaparece. Recuperar con la preferencia nueva/RPC produciría conflicto
con el recibo. No debe cambiarse el plan del trabajo para evitar ese conflicto.

## Corrección

Selector compartido en Crear, editor/galería y previews, condicionado a capability
global y preparación de cinco perfiles. Semilla del proveedor explícita. Capacidad
por plan, copias canónicas por UUID y persistencia de opciones para nuevas tareas.
Cambiar de modo no convierte una intención ya admitida. Previews Flow esperan el
botón de generación y conservan su ejecutor durante recuperación.

La señal interna `flowRecoverOnly:true` exige UUID y recibo coincidente; deriva
el plan durable antes de comparar revisiones. No encontrarlo falla antes de LLM,
admisión o ejecución. Preserva escenas/importación/animación y metadata original.
Se porta sólo el contrato necesario del coordinador 0.2.20, conservando parches
locales. El mismo cliente/DTO preparado comunica seednull/hash6 para Tools y
semilla/hash5 legacy para RPC.

## Límites deliberados

No modifica QA abierta, datos, lote323, perfiles, auth, costos, concurrencia,
pausas o bloqueo externo Google. No instala paquetes, reconstruye nativos ni
publica. La selección depende de preparación real; no concede permisos Chrome.
La recuperación no constituye autorización para otro intento remoto.

## Validación reproducible

Comandos fuente: formato focal con cobertura de parser, `pnpm lint`, `pnpm build`,
`pnpm exec tsc -p tsconfig.pipeline.json --noEmit`, `pnpm check:locales` y
`git diff --check`. Fixtures locales, hashes, comandos y límites en el directorio
`2026-10-07-multimagen-port-evidence` de la copia QA durable, fuera del repo.
Ejecutan componentes/hooks/productores reales con fronteras simuladas y el vendor
real con workers sintéticos. No son una suite oficial del producto.

Resumen y procedimiento de siguiente QA en
[el traspaso](../docs/handoff/2026-10-07-flow-tools-contract/selective-port.md).

## Pruebas manuales

Ninguna prueba manual nativa/Chrome/Google en este bloque. QA activa congelada y
no se solicita ni reenvía ninguna imagen. La futura aceptación real queda
explícitamente pendiente del cierre y arranque coordinados de Root.
