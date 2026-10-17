# Fix: Estado visible de recuperación persistente de Flow

- **Fecha:** 2026-10-13
- **Rama:** feat/flow-export-motion

## Causa

El coordinador puede conservar una escena pendiente tras varios rechazos temporales confirmados. El guard compartido del sidecar y la interfaz sólo reconocía hasta dos o cuatro reemplazos, por lo que una recuperación persistente válida podía aparecer como terminada o exigir revisión manual.

## Corrección

`FlowAutoRecovery` y su capability incluyen `persistentRecoveryVersion?: 1`. El guard `flowAutoRecoveryPending` reconoce contadores superiores a cuatro únicamente cuando ese opt-in está explícito en el resumen durable. Los contadores deben ser enteros seguros y no negativos; los intentos no pueden superar los reemplazos más uno. Se rechazan versiones desconocidas y topes legados ajenos a dos/cuatro. Los estados terminales siguen siendo terminales.

## Límites deliberados

Este guard interpreta estado recibido, no autoriza ni programa nuevos envíos. La elegibilidad sigue en el coordinador: sólo errores confirmados y sin incertidumbre habilitan recuperación; un recibo incierto nunca se convierte en rechazo por este cambio. Los datos legados sin opt-in conservan sus topes anteriores.

## Validación reproducible

```sh
node /private/tmp/vimo-persistent-ui-check.mjs
pnpm exec tsc -p tsconfig.pipeline.json --noEmit
```

26/26 casos locales: quinto y posteriores reemplazos explícitos, topes legados, versión desconocida, enteros no seguros, contadores contradictorios y estados finales. Código y evidencia fuera de Git en `Vimo-Flow-QA/2026-10-13/configuracion-autonoma/tools/persistent-ui-*`.

## Pruebas manuales

No se realizaron generaciones reales ni se alteraron perfiles del usuario. La prueba usa el guard compartido compilado con los mismos imports del producto; la aceptación con Flow depende de la entrega final.
