---
title: Identidad desconectada en las listas de capacidad Flow
date: 2026-10-06
tags: [vimo, flow, frontend, identidad, qa]
---

# Fix: identidad vigente sólo con vínculo conectado

- **Fecha:** 2026-10-06
- **Rama:** `feat/flow-dev-compat-20261006`
- **Base:** integración aislada `900e4664243c352d6ca966643ba2647972631f08`, sobre dev `2950ebb` y Flow `8257e334`.

## Causa

`FlowCapacityNotice` omitía `connected` al montar `FlowAccountIdentity` tanto en las cuentas bloqueadas como en el detalle de capacidad. El componente toma `true` por defecto para los candidatos de discovery. Un snapshot de capacidad podía conservar una identidad verificada después de desconectarse, de modo que Crear y Editor afirmaban verificación actual sin un vínculo conectado. Las correcciones anteriores cubrían Extensión y el detalle de conexiones, no estas dos listas.

## Corrección

Ambas listas buscan el vínculo por `connectionId` y pasan `connected` explícitamente: sólo es verdadero si la conexión existe, está conectada y no está revocada. El componente conserva su presentación histórica cuando falta conexión o está offline; no altera el cálculo de capacidad ni la vinculación. Se mantiene el comportamiento de discovery.

Archivo de producto: `src/modules/common/components/FlowCapacityNotice.tsx`.

## Límites deliberados

La prueba usa Chromium for Testing aislado, el componente compartido real, sus hooks/API y el SEA nativo con cinco workers sintéticos. No abre la app Tauri ni navega los formularios completos de Crear/Editor. No ejecuta Google ni modifica perfiles, credenciales, puerto 43127, extensión u original Vimo. Las respuestas sin vínculo y con revocación desfasada son fixtures explícitos en la frontera invoke; las desconexiones, pausas y reconexiones usan el coordinador nativo.

## Validación reproducible

1. Abrir Crear o Editor con Flow y expandir el detalle de capacidad. Desconectar un worker de prueba que conservaba identidad verificada: ambas listas muestran identidad histórica, nunca verificación actual.
2. Omitir el vínculo correspondiente de `status.connections` manteniendo el perfil en capacidad: conservar la misma presentación histórica. Un vínculo revocado tampoco certifica identidad actual.
3. Pausar un worker conectado: puede aparecer bloqueado para generar y seguir verificado. Reconectarlo con su credencial existente restaura la identidad actual después del estado nativo fresco.
4. Ejecutar `pnpm format`, `pnpm lint`, `pnpm build`; reconstruir con Node 22 oficial y `pnpm build:sidecar`. Repetir el harness sobre ese SEA y guardar hashes de fuentes/artefacto antes y después.
5. Ejecutar `node --test scripts/test/check-gem-verbatim-lane.mjs`: los cuatro fingerprints legacy coinciden; el redactor sigue idéntico a dev `2950ebb`.

El harness temporal permanece fuera del repositorio: `/private/tmp/flow-ui-qa-20261006.mjs`.

### Evidencia final

- `pnpm format` → `pnpm lint` → `pnpm build`: aprobados. Build web con variables públicas ficticias de QA; no es una distribución configurada para usuarios.
- SEA reconstruido con Node 22 oficial antes de repetir QA. SHA256: `036584962d80e3e813c2c71d46e6106390e4afa401f321aaa094d43bdd1336f6`. Coincide con el anterior porque esta corrección sólo modifica el componente frontend; no se reutilizó una corrida anterior.
- Corrida actual: **59/59 comprobaciones, 130 comandos**, `failure:null`, cero errores runtime. Informe externo `/private/tmp/vimo-flow-ui-regression-ggBzrL/report.json`. Incluye las 50 comprobaciones previas y nueve de capacidad/procedencia: desconexión, falta de vínculo, restauración, pausa conectado, reconexión, revocación, ausencia de generación y estabilidad de fuentes/SEA.
- El informe guarda SHA256 de 1186 archivos de entrada: `9e1389f527178a0f30aaa5cf03b0c8292f9cb8eeb2560b3e0f3ae5516592468b`. Se comparó antes/después; documentación fuera de ese conjunto. Base `900e4664` con únicamente `FlowCapacityNotice.tsx` modificado en código.
- Control negativo: mismo SEA/harness sustituyendo únicamente el componente por el de `900e4664` falla exactamente al exigir identidad histórica del perfil offline en ambas listas. Informe `/private/tmp/vimo-flow-ui-regression-GivOY2/report.json`. La regresión detecta el defecto anterior.
- Guard focal de verbatim: **21/21**; incluye generic/text/reference/none. Blob del redactor `59e3a901511c5ef34c7697d9599dbed2383adae9`, idéntico a dev `2950ebb`.
- Revisión de otros usos de `FlowAccountIdentity`: Extensión y detalle pasan `connected`; discovery conserva su valor predeterminado deliberadamente. No se modificaron cuotas, cadencia, concurrencia, dispatcher, locks, alias ni protocolo.

## Pruebas manuales realizadas

No se abrió la aplicación ni perfiles reales. La interacción automatizada con el navegador aislado cubre Extensión y el componente compartido de capacidad. Cinco cuentas reales siguen pendientes del login preparado por el usuario.
