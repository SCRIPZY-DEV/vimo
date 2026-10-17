---
title: Ayuda de vinculacion para observacion Flow 0.2.14
date: 2026-09-21
tags: [vimo, flow, extension, ui, i18n]
---

# Fix: ayuda de vinculación según la observación de Flow

- **Fecha:** 2026-09-21.
- **Rama:** `feat/extension-vimo-automater`.

## Causa

La ayuda de Vimo seguía exigiendo seleccionar y verificar un proyecto antes de
mostrar una cuenta elegible. La extensión 0.2.14 ya observa un único proyecto
preparado sin binding previo. Además, `hasFlowTab:false` indica falta de
preparación comprobada; no permite atribuir por sí solo el problema a una
selección de proyecto pendiente.

## Corrección

Se actualizan seis textos de `extension` en `public/locales/{es,en,pt}.json`:
`discoverHint`, `discoveryStepProject`, `discoveryProjectSelectionHint`,
`openFlow`, `noProject` y `discoveryNotReady`. La ayuda presenta abrir un único
proyecto y el panel, esperar el correo verificado y pulsar Vincular. Mantiene la
selección/revisión para varias pestañas o preparación pendiente y explica la
compatibilidad con versiones anteriores.

La UI existente ya muestra identidad actual e histórica por separado y habilita
Vincular exclusivamente con `canLink`. La entrega no exige modificar JSX,
hooks, DTO, autenticación ni el bridge. `observation` pertenece únicamente a la
comunicación interna de la extensión.

## Límites deliberados

No se inventan causas específicas que el wire no transporta. No se relajan guards,
se actualizan perfiles Chrome, se regeneran imágenes ni se sustituye el vendor.
La aceptación de la entrega se documenta en
[la revisión 0.2.14](../docs/handoff/2026-09-20-flow-identity-discovery/review-extension-0.2.14.md).

## Validación reproducible

- Aprobados: `pnpm format`, `pnpm lint`, `pnpm build` y `pnpm check:locales`.
- Comprobación local reutilizada, no versionada:
  `node /private/tmp/check-vimo-flow-identity-20260920.mjs`.
  Ejecuta SSR real de `Extension`, `FlowAccountIdentity` y diagnóstico con
  TanStack Query e i18n reales; API aislada y datos sintéticos.
- Resultado focal: 16/16 comprobaciones; misma estructura de 1475 claves en
  los tres catálogos. Identidad fresca, máscara, histórico, alias separado,
  perfil no preparado y permiso `canLink` conservan su comportamiento.

- Compilación nativa `pnpm tauri build --bundles app` con firma local ad-hoc,
  directorio Cargo temporal y `beforeBuildCommand` de sidecar (frontend ya
  construido). `codesign --verify --deep --strict` aprobó el bundle final.
  App local: `src-tauri/target/review-flow-observation-0214/Vimo.app`.
  Su sidecar conserva exactamente el hash verificado con el paquete 0.2.14.

## Pruebas manuales realizadas

La revisión inicial comprobó los seis textos en los tres idiomas mediante SSR.
En la continuación solicitada por el usuario se abrió el bundle nativo de esta
rama y se inspeccionó Extensión: cuatro cuentas, correos actuales, límite 500 y
textos de observación presentes. Se actualizaron los cuatro perfiles existentes
a 0.2.14 usando su mismo ID/carpeta y se verificó la reconexión con resultados y
consumo conservados. No hubo nueva generación ni primera vinculación real;
ese último caso requiere un perfil todavía no vinculado. La cronología y los
agregados están en la revisión enlazada arriba.
