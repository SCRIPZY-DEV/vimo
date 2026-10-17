---
title: Galería Flow sin promesas de descarga para intentos sin medio
date: 2026-10-07
tags: [vimo, flow, galeria, fix]
---

# Fix: estado de vista previa y limpieza de historial

- **Fecha:** 2026-10-07.
- **Rama:** `fix/flow-gallery-terminal-state-20261007`.

## Causa

`FlowImagePreview` usaba `galleryPreviewPending` para todos los estados distintos
de ready. Ese texto prometía una vista previa tras descargar incluso para un
rechazo definitivo sin medio o un trabajo todavía en cola. El permiso
`localDeletable` del coordinador sólo acredita que el recibo puede limpiarse
seguramente; no prueba que exista un archivo descargado. La etiqueta «Eliminar
archivo local» confundía ese permiso con la existencia de una imagen.

Root reprodujo ambos mensajes en QA a5a3091 con el lote real pausado. No se
consultó ni modificó su estado desde esta sesión para diagnosticarlo.

## Corrección

- Placeholder visible y neutral: no hay imagen local para mostrar. El estado
  específico de cola, descarga, rechazo o incertidumbre sigue en la descripción
  del trabajo. No se promete una descarga futura.
- Acción «Eliminar del historial» con confirmación que explica eliminación del
  registro/contenido de recibos y de las copias locales que existan. Se conserva
  la protección explícita de las imágenes importadas en proyectos de Vimo,
  originales de Google y exportaciones; no se promete recuperar presupuesto.
- Texto de registro eliminado coherente; paridad de ES/EN/PT.

## Límites deliberados

Sin cambios en `localDeletable`, predicados, confirmación obligatoria, revalidación
de status, API, vendor, dispatch, política, reintentos o borrado. El botón sigue
permitiendo limpiar un recibo terminal seguro aunque no exista medio: ese es el
contrato real del historial. `ready` conserva la lectura de vista previa y su
manejo de errores. Este fix no resuelve el bloqueo externo de Google.

Sólo worktree de integración. QA abierta, HMR, SEA, wrapper, manifiestos, datos y
perfiles permanecen congelados. El cronómetro se revisa en un fix separado.

## Validación reproducible

Fixture local fuera de Git: `/private/tmp/flow-terminal-ux-20261007/gallery/`.
Componentes reales, TanStack Query y API de lectura simulada; estados sin medio,
ready con imagen, error de lectura, flags de borrado, confirmación y tres idiomas.
Comparación con el mismo fixture contra el padre `52c156ec`: 205/274; después
274/274, con 69 negativos corregidos. Incluye `useFlowPreview` y TanStack reales,
diálogos Radix, confirmación final, flags localDeletable/busy, lectura sólo ready,
imagen ampliada/error/relectura, ES/EN/PT. Cero red o API inesperada. Son controles
locales de jsdom; no acreditan layout ni aceptación nativa. Los 14 hashes de
fuente/locales quedan asociados al reporte.

```sh
node /private/tmp/flow-terminal-ux-20261007/gallery/check-gallery-terminal.cjs before
node /private/tmp/flow-terminal-ux-20261007/gallery/check-gallery-terminal.cjs after
```

El intento inicial de 271 controles se conserva: se corrigió en el fixture un
criterio lingüístico demasiado literal y se añadió el botón final a la
comparación. El resultado definitivo compara los mismos 274 casos en ambos lados.
Comandos del proyecto: `pnpm format`, `pnpm lint`, `pnpm build`,
`pnpm check:locales`.

## Pruebas manuales

La reproducción inicial fue comunicada por Root en la app QA real. No se probó
este nuevo fix en la app nativa: está abierta y pertenece a su aceptación; no se
instaló ni se ejecutó ninguna acción contra el lote real.
