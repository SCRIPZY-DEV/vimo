---
title: Disponibilidad actual y pausa manual de cuentas Flow
date: 2026-10-07
tags: [vimo, flow, ui, disponibilidad, fix]
---

# Fix: disponibilidad actual de las cuentas Flow

- **Fecha:** 2026-10-07
- **Rama:** `fix/flow-account-readiness-20261007`

## Causa

La tarjeta usaba `profileAvailability.state` tras comprobar sólo socket y conflicto. Ese estado puede seguir en `ready` mientras la extensión vuelve a verificar la identidad o el proyecto restaurado de Chrome. En el caso comunicado por Root había cinco sockets conectados, cuatro verificaciones pendientes y una sola cuenta con capacidad: la capacidad era correcta, pero las cinco tarjetas decían Lista.

La etiqueta `manual` se traducía siempre a Revisar en Flow, incluso ante pausa voluntaria. La ayuda también agrupaba pausa y revisión externa como si ambas se resolvieran con Reanudar. El resumen interpolaba un número en un sustantivo plural fijo.

## Corrección

`flowConnectionReadiness` deriva el diagnóstico visual del snapshot actual. Desconexión, conflicto, identidad sin verificar y proyecto no preparado impiden mostrar Lista aunque el estado anterior del proveedor sea `ready`. La identidad histórica sirve sólo para identificar la tarjeta. El estado o motivo externo de revisión, espera o comprobación se conserva.

La pausa global explícita se distingue por `manualPaused`; la pausa del perfil por `MANUAL_PAUSE`. Si existe otra causa real concurrente, se muestra esa causa con una nota de pausa voluntaria. La pausa efectiva sin causa voluntaria no se presenta como decisión del usuario. Un saldo ausente o agotado tampoco se presenta como cuenta lista.

Tarjetas de Extensión y detalle del indicador comparten `FlowConnectionAvailability`; se retira la ayuda duplicada. El resumen usa pluralización i18next `count=readyProfiles`, con variantes cero, uno y varios en español, inglés y portugués. `linkedCount`, `readyProfiles`, saldo, reservas y admisión siguen procediendo del coordinador.

## Límites deliberados

Es una corrección de presentación. No cambia DTO, coordinador, Rust, SEA, presupuesto, cadencia, concurrencia, generación, autenticación ni las protecciones del editor/animaciones. No intenta recalcular admisión a partir de las tarjetas; las razones de capacidad conservan su propia fuente autoritativa. No convierte un socket conectado ni una identidad histórica en capacidad disponible.

La entrega se prepara en la copia de integración aislada. La fuente de la QA viva no se edita ni se recarga por HMR durante la operación de Root. No requiere recompilar Rust/SEA o sustituir el wrapper DEV; su aplicación al frontend QA se coordina aparte. No se ejecutó la variante de background ni se atribuye a ella este defecto de estado.

## Validación reproducible

Comandos ejecutados en la copia aislada, en orden: `pnpm format`, `pnpm lint`, `pnpm build`; los tres terminaron con código 0. `git diff --check` sin errores. El build valida TypeScript y el bundle de integración; no es una entrega de frontend QA ni una prueba de la app nativa.

Guard local externo (no versionado como test oficial): `validate-readiness.cjs`, conservado en el directorio persistente `readiness-fix/validation` de la entrega QA. Ejecutar con Node y las dependencias instaladas de esta rama; el script compila los componentes de producto con esbuild y renderiza con ReactDOM/i18next reales, sustituyendo sólo hooks de datos/acciones y superficies ajenas a este diagnóstico. No llama a Google, bridge ni Tauri.

- Caso de cinco sockets: cuatro identidades pendientes y una actual, exactamente una Lista y resumen singular, tanto en Extensión como en detalles; se conserva `readyProfiles=1`.
- Variantes: proyecto nulo/no preparado/stale, identidad histórica, desconexión, conflicto, checking, cooldown, revisión externa, pausa global/perfil, saldo nulo/agotado y motivo desconocido.
- Reanudar no fuerza Lista mientras continúa una comprobación; el cambio de snapshot verificado actualiza la tarjeta sin mutar el anterior.
- Cero/uno/dos en es/en/pt, paridad de catálogos, entradas congeladas y ningún transporte activado.

La evidencia y los hashes del árbol quedan en el informe de la entrega. No se repiten suites de SEA/coordinador porque no cambió su fuente ni sus artefactos.

## Pruebas manuales realizadas

El caso inicial, la vinculación y la pausa/reanudación reales fueron comunicados por Root; esta sesión no operó la app ni las cuentas. La corrección todavía no está aplicada a la QA viva. La aceptación nativa pendiente debe comprobar cinco tarjetas tras restaurar Chrome: sólo las cuentas con identidad y proyecto actuales pueden decir Lista; verificar las cuatro pendientes y luego su actualización sin volver a vincular. Pausar debe mostrar pausa voluntaria y reanudar debe conservar Comprobando o cualquier revisión real hasta recibir un estado preparado. Cero generaciones causadas por estas comprobaciones.
