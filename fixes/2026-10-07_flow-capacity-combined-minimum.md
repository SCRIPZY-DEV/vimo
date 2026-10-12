# Fix: disponibilidad visual con el mínimo combinado de Flow

- **Fecha:** 2026-10-07
- **Rama:** fix/flow-qa-generation-controls-20261007

## Causa

`useFlowCapacity.ready` comprobaba el estado global contra su propio mínimo mediante `flow.ready`, pero sólo contrastaba la capacidad con el mínimo combinado. Si el estado declaraba 5 cuentas listas y un mínimo de 3, mientras capacidad declaraba 6 listas y un mínimo de 6, la interfaz habilitaba generar aunque el estado global no cumpliera 6. La verificación fresca previa al envío ya bloqueaba correctamente este caso.

## Corrección

El estado visual exige también `flow.status.readyProfiles >= minimumProfiles`, con ausencia de estado tratada como cero. Se conservan el mínimo de producto de cinco cuentas, las pausas, el control de capacidad y la verificación fresca existente. La copia QA incorpora los cambios de controles `8230d4eb` y de disponibilidad de comprobaciones `13539ada` sin modificar los overrides nativos aislados.

## Límites deliberados

Sin cambios de autenticación, cuotas, cadencia, protocolo, datos ni generación. La importación conserva el ejecutable nativo compilado en `914fe1b`; sustituye exclusivamente el coordinador SEA entregado y su wrapper firmado. Esta preparación no constituye aceptación de la interfaz nativa ni un benchmark.

## Validación reproducible

Desde la copia QA, con Node 22:

```sh
node /Users/sebas/Documents/Vimo-Flow-QA/2026-10-06/qa-install-8230-20261007-h4adbihj/check-capacity-combined.cjs
pnpm format
pnpm lint
pnpm build
```

El arnés temporal está fuera de Git; importa el hook real y sustituye las consultas para evitar tráfico. Reproduce el falso positivo anterior y verifica el resultado visual y `verify()` para mínimos discrepantes (5/6 bloquea; 6/6 permite), cinco disponibles, cuatro bloqueadas y una pausa del proveedor. Los hashes, firmas y comprobaciones del launcher se registran fuera del repositorio en el directorio de instalación.

## Pruebas manuales realizadas

Pendientes tras el arranque controlado por la sesión coordinadora. No se inició la app, no se generaron imágenes y no se accedió a las cuentas o los datos de la aplicación operativa durante esta instalación.
