---
title: Extensión — preparación separada de capacidad
date: 2026-10-11
tags: [vimo, extension, multimagen, fix]
---

# Fix: cuentas preparadas y guía de cuatro pasos

- **Fecha:** 2026-10-11.
- **Rama:** `fix/flow-qa-recovery-permit-20261010`.
- **Base:** `253325fd2280718b298cf68ec470b00865537ff4`, QA canónica.

## Causa

La ruta Extensión mostraba la capacidad para generar como avance de preparación. Cinco cuentas con Multimagen preparado podían aparecer como dos disponibles y recibir instrucciones para volver a preparar. Las pausas, comprobaciones, reservas e historial limitan los envíos sin deshacer la configuración de Tools. La guía agrupaba abrir y preparar en un paso y no reflejaba las cuatro etapas del panel.

## Corrección

El resumen separa **cuentas preparadas** de **disponibles para generar**. Preparada exige estado y capacidad del plan Multimagen confirmados, una sola fila por conexión, instalación/proyecto/cuenta coincidentes, identidad verificada, vínculo listo y capacidad Tools exacta en ambas lecturas. Las filas antiguas, no reconciliadas, duplicadas o incompatibles no confirman preparación. `status_stale` aplica la ventana de 90 segundos que ya calcula el coordinador; no se agrega una consulta ni un reloj de proveedor. Los campos públicos de instalación y proyecto ya atraviesan el JSON de Rust y los hooks; se declaran opcionalmente en los tipos locales y se validan al leerlos.

Datos ausentes o contradictorios y fallos de consulta muestran «sin confirmar», nunca cero como conclusión. Un fallo de Consultar estado también retira el verde de la caché anterior. Pausa, comprobación, ritmo, cuota e historial no reducen las cuentas preparadas; siguen afectando la disponibilidad. Con cinco preparadas y dos disponibles se muestra **Revisar cuentas**, que enfoca la lista sin ejecutar comandos. Crear conserva `flowCapacityReady` y el mínimo de cinco disponibles; el contador nuevo no autoriza envíos.

La guía muestra Elegir proyecto → Abrir Multimagen → Preparar → Listo. Son instrucciones para el panel de Chrome existente; Vimo no inventa comandos de apertura o preparación. Cada cuenta muestra preparación y disponibilidad por separado; el detalle de uso y las restricciones quedan en Opciones avanzadas. Una reserva local no se presenta como una cuota de Google agotada.

## Límites deliberados

- Sólo cambia el renderer de Extensión y sus traducciones es/en/pt. No cambia API, Rust, SEA, navegación, montaje único ni configuración QA.
- No prepara, genera, reanuda ni reintenta al abrir la guía o revisar cuentas. Los resultados inciertos y sus reservas se conservan.
- Preparada confirma configuración informada; no demuestra disponibilidad de Google ni generación completada.
- La validación de envío sigue consultando el número real de imágenes; la consulta de presentación usa el plan exacto con una imagen.

## Validación reproducible

En una exportación aislada de la base con los archivos del cambio, `node_modules` real, enlaces individuales de dependencias y cachés locales:

```sh
node node_modules/prettier/bin/prettier.cjs --check src/modules/extension public/locales/es.json public/locales/en.json public/locales/pt.json fixes/2026-10-11_extension-contador-preparadas-y-guia.md
node scripts/test/check-locales.mjs
node node_modules/eslint/bin/eslint.js src/modules/extension
node node_modules/typescript/bin/tsc -b
node node_modules/vite/bin/vite.js build
node /private/tmp/vimo-native-wizard-20261011/check-wizard.mjs /ruta/a/copia
```

El arnés temporal, fuera del commit, ejecuta los helpers y elementos React reales con hooks simulados: cinco preparadas/dos disponibles; pausas y reservas; identidad/proyecto/instalación exactos; duplicados y datos ausentes; errores con caché; guía de cuatro pasos; acciones sin mutaciones y conservación de incertidumbre histórica. No prueba Google ni render nativo. Resultados y hashes viven en la entrega temporal.

## Pruebas manuales realizadas

Root aplicó los 12 archivos a la QA canónica y reinició su wrapper existente. CUA confirmó en Extensión **Cuentas preparadas: 5 / 5**, **Disponibles para generar: 2**, preparación completada y tres resultados históricos sin confirmar. Revisar cuentas enfoca la lista; abrir Cómo preparar cada cuenta muestra cuatro pasos sin mutaciones. Se corrigió el texto del cuarto paso para nombrar el botón real Actualizar conexión (es/en/pt) y la concordancia «Multimagen preparada». Los 60 casos también pasan sobre la fuente aplicada. No se generó ni se reanudó ningún trabajo.
