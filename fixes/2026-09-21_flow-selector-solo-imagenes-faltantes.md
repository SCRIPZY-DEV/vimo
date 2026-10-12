---
title: Fix - Selector Flow sólo para imágenes faltantes
date: 2026-09-21
tags: [vimo, flow, editor, fix]
---

# Fix: selector Flow sólo para imágenes faltantes

- **Fecha:** 2026-09-21
- **Rama:** `feat/extension-vimo-automater`

## Causa

El selector múltiple recibía todas las escenas y no filtraba por `imagePath`.
Una imagen recuperada seguía ofreciéndose como candidata, aunque el archivo ya
existiera. La selección tampoco se reconciliaba al actualizar el detalle.

El evento `scene-image-ready` del editor actualizaba su store de progreso, pero
la ruta del detalle quedaba esperando el cierre del lote. El cierre del pipeline
completo invalidaba lista y estado, pero no el detalle que consume el editor.

## Corrección

El bloque muestra sólo escenas sin ruta local y desaparece si no falta ninguna.
Su título es «Escenas sin imagen» en los tres idiomas. Al confirmarse una imagen,
la caché del detalle recibe únicamente los campos de esa imagen; los borradores
y otros campos se conservan. Cancela sólo la lectura previa de ese detalle para
que una respuesta tardía no borre una importación confirmada; las lecturas
posteriores siguen pudiendo detectar un archivo eliminado. No cancela jobs.
El cierre del pipeline vuelve a consultar disco.

La selección y su contador descartan escenas ya recuperadas. Antes de encolar,
se comprueba otra vez la caché vigente: si se recuperaron mientras se verificaba
capacidad, no se envían ni se sustituyen por la escena abierta. La regeneración
individual elegida expresamente desde una escena sigue disponible.

## Límites deliberados

No cambia prompts, archivos del proyecto, contratos, cola ni límites de la extensión.
La existencia se toma del detalle nativo (archivo regular no vacío) y de su evento
de importación confirmada; no de un error antiguo o un estado de generación.
No se añade vigilancia permanente del filesystem: cambios externos se reflejan al
refrescar el detalle. El componente no lee archivos por su cuenta.

## Validación reproducible

```sh
pnpm format
pnpm lint
pnpm build
pnpm check:locales
```

Comprobar con escenas con/sin archivo: sólo las faltantes aparecen; todas presentes
ocultan el bloque; un estado de error con imagen existente no lo vuelve a mostrar.
Recuperar desde editor y pipeline debe quitar la escena y su selección. Resolver
todas las seleccionadas durante el precheck no debe encolar nada ni regenerar
otra escena. Confirmar preservación de borradores y regeneración individual.

Formato, lint, build y paridad de las 1475 claves es/en/pt aprobados.
Veinte comprobaciones de selector/hook con SSR React y QueryClient reales:
todas presentes, error antiguo con archivo, contador, recuperación parcial,
selección resuelta durante el precheck, caché ausente, proyecto distinto,
ocupadas y regeneración individual intencional. Veinticinco comprobaciones
adicionales de caché y handlers reales: identidad de operación/proyecto,
borradores intactos, refetch antiguo descartado, dos resultados consecutivos,
lectura posterior con archivo eliminado y carga inicial sin datos preservada.
Los hooks de React se instrumentaron en la fixture; no se afirma QA de DOM.

Verificaciones temporales (no versionadas):
`/private/tmp/vimo-flow-missing-selection-check-20260921.mjs` y
`/private/tmp/check-vimo-project-image-cache-20260921.mjs`.

La app nativa se compiló y verificó con `codesign --verify --deep --strict`.
Se reemplazó la app en `src-tauri/target/release/bundle/macos/Vimo.app` después
de comprobar cero operaciones activas/inciertas y ausencia de otros jobs hijos.
El servicio anterior cerró por EOF y dejó 43127 libre antes de iniciar el nuevo.
Se guardó un respaldo del bundle anterior fuera del repo. Se verificó el proceso
nuevo y su único servicio hijo; la app tiene SHA-256
`741581e1403cddaef8e47b3232adc5bb4c40cf8d5c0a68d6d3a7dab0b7768af7`.
El sidecar conserva exactamente el hash del fix anterior: este cambio es de UI.

## Pruebas manuales realizadas

Computer Use no pudo capturar la ventana nativa (`cgWindowNotFound`). La comprobación
funcional se realizó con las fixtures locales sobre los componentes y stores
reales descritas arriba. La apertura del artefacto se verificó por procesos y
hashes. El estado durable conserva 88 resultados listos, un rechazo histórico
y 28 recibos borrados; no se generaron imágenes ni se editaron proyectos reales.
