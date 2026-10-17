---
title: Revision Vimo de cuenta y proyecto observado en extension 0.2.14
date: 2026-09-21
tags: [vimo, flow, extension, identidad, discovery, revision]
estado: vigente
actualizado: 2026-09-21
---

# Revisión de la entrega de cuenta y proyecto observado · 0.2.14

- **Fecha:** 2026-09-21.
- **Rama Vimo:** `feat/extension-vimo-automater`; base `6497236`.
- **Fuente externa:** `6ac9d03`, rama `feat/flow-extension`, limpia.

## Resultado para Vimo

La entrega ya es compatible con el receptor, los tipos y los componentes de esta
rama. El cambio necesario está en la ayuda de la UI: seis textos de cada catálogo
es/en/pt dejan de exigir selección previa siempre. Con un único proyecto
preparado, se abre el panel, aparece el correo y se pulsa Vincular. Con varias
pestañas o preparación pendiente se indica revisar la cuenta/proyecto en el panel.
Véase [causa y validación de los textos](../../../fixes/2026-09-21_flow-ayuda-observacion-cuenta.md).

`FlowAccountIdentity` prioriza identidad actual; si falta, presenta el histórico
rotulado como pendiente, sin convertir alias en correo. `Extension` conserva
`disabled={!profile.canLink || busy}`; el clic envía sólo `discoveryId` mediante
`commonApi.linkFlow` y el comando nativo existente. El estado se refresca con
TanStack Query. No se infiere elegibilidad de un correo histórico.

No se importa `observation` en React ni se añade al WebSocket: es un DTO local del
panel y worker. La extensión ya anuncia identidad actual y preparación por las
rutas existentes. La secuencia del [contrato de observación](prompt-extension.md#secuencia-propuesta-de-observación-y-clic-nativo)
se conserva; no hay cambios de transporte, autorización ni nuevas variables.
Se preserva el vendor de Vimo con sus arreglos propios de descargas, identidad y
canje; no se sustituye con el bridge independiente.

## Paquete comprobado

- Versión de fuente/carpeta/ZIP: **0.2.14**.
- ID público: `bjpjjnjiikhccbjlkgmfpfhenbdpikbm`.
- 17 archivos idénticos entre `extension/`,
  `artifacts/vimo-automate-0.2.14/` y el ZIP del repositorio externo.
- SHA-256 ZIP:
  `5ccb94f090a4c6e50867c1a43eb09d86da7cfbd2297fde29af719df627a89cbd`.
- SHA-256 del worker:
  `a93021215f37616014516a7927b738e331ad41e765a0890f03f1f903bc922526`.
- 22 JavaScript con sintaxis comprobada.

## Validación repetida en esta sesión

| Capa                                 | Resultado y alcance                                                                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker del paquete                   | 42/42 comprobaciones de observación, promoción, cancelación, carreras y rollback                                                                     |
| Worker + receptor fuente Vimo        | 12/12 comprobaciones, tres workers, WebSocket y ledger temporales                                                                                    |
| Worker + ejecutable SEA de esta rama | 13/13 comprobaciones, incluidos persistencia del hash de credencial, recarga sintética, pérdida y recuperación de identidad, reconexión y doble clic |
| UI existente con textos nuevos       | 16/16 comprobaciones SSR de identidad, proyecto y `canLink`; queries/i18n reales y API aislada                                                       |

El ejecutable de la rama probado tiene SHA-256:
`f705ece7c0868fa42c02e37f425ab65fd9e1a350e851032602abc43828a991fa`.
Los tres workers parten sin binding. La observación publica correo y canLink
pero no guarda selección, autentica ni genera. El clic nativo promueve el mismo
tab/documento/cuenta y la credencial queda guardada antes del éxito. La ruta de
clic en la extensión conserva capability y un único UUID. Consumo y pausas
permanecen intactos.

Fixtures locales no versionadas, reproducibles con Node 22:

- `/private/tmp/flow-implementation-20260916/check-worker-observation.mjs --package`.
- `/private/tmp/flow-implementation-20260916/check-vimo-three-workers-observation.mjs`.
- `/private/tmp/vimo-worker-package-sea-20260921.mjs`.
- `/private/tmp/check-vimo-flow-identity-20260920.mjs`.

El fixture SEA comprueba el hash antes de arrancar. Admite, en orden, carpeta
del paquete con barra final, ruta del SEA y SHA-256 esperado; sin argumentos usa
el artefacto de esta rama. Los resultados
viven en directorios temporales, sin secretos reales. APIs de almacenamiento del
worker simuladas; ledger del bridge en filesystem real. Ninguna cuenta Google,
petición a proveedor, generación, `connection.test` o descarga real se ejecutó.
Esta evidencia no es una prueba visual manual de Tauri ni certifica qué versión
de extensión está cargada en los perfiles del usuario.

## Diferencia con la aplicación instalada · lectura anterior a la continuación

En la lectura de esta sesión del 2026-09-21 estaba abierta `/Applications/Vimo.app`, versión
**0.8.6**, distinta del artefacto de la rama. Su SEA tiene SHA-256:
`ede730ddc8d98dcf132b07afeabf68edbee13b82b3220e1fbebc792514b74ea3`.
Al ejecutarlo en aislamiento con `flow-service`, devolvió `job-failed`,
`unknown_subcommand`, salida 1. Ese ejecutable no incluye el servicio Flow;
actualizar únicamente la extensión no añade ese comando a la app instalada.
La inspección no intervino sobre el proceso de la app abierta ni inició workers
contra ese ejecutable. No había listener 43127 en esa lectura.

La aceptación de esta rama y el número de versión de la app instalada son hechos
separados. No se reemplaza la app de Aplicaciones ni se migran sus datos como
parte de este cambio de ayuda.

## Compilación local lista para probar

`pnpm format`, `pnpm lint`, `pnpm build` y `pnpm check:locales` aprobados.
Se compiló la app de esta rama, versión 0.8.5, en
`src-tauri/target/review-flow-observation-0214/Vimo.app`, sin reemplazar ni abrir
la instalación 0.8.6 de Aplicaciones. La firma local ad-hoc pasó
`codesign --verify --deep --strict`. SHA-256 del ejecutable principal:
`cdce96e233919e7e503ccb14d64c38292e61e165bfb4423f941cfa86bfc8c0fe`.
El sidecar final conserva exactamente `f705ece7…` validado arriba; los únicos
cambios de producto de esta sesión son textos de la interfaz.

## Pendiente operativo original · actualizado por la comprobación siguiente

Cargar la extensión 0.2.14 con el mismo ID y almacenamiento en cada perfil, y
usar la compilación de Vimo que contiene esta integración. Antes de actualizar
perfiles, comprobar trabajo activo/incierto, recibos y limpieza pendiente.
No desinstalar, resetear contadores ni volver a vincular credenciales válidas por
defecto. Validar con proyecto único y panel abierto; observar no vincula y el
clic explícito sí. La aceptación Google real continúa pendiente.

## Continuación operativa real · 2026-09-21 22:46 America/Bogota

El usuario pidió continuar. Se comprobó que la app 0.8.6 abierta estaba en un
formulario vacío, sin pipeline hijo ni listener 43127. Se cerró por su acción
normal de salir y se abrió la compilación local de esta rama ya verificada;
no se reemplazó `/Applications/Vimo.app`. Vimo quedó abierta en Extensión y su
servicio hijo es el único listener 43127.

Antes de la intervención, el ledger tenía 117 recibos: 88 `ready`, un `failed`
histórico y 28 `deleted`. Cero trabajos activos/inciertos, descargas, reservas sin
enviar, reintentos autorizados pendientes o limpiezas pendientes. Esta lectura es
necesaria: el arranque del coordinador sí puede continuar trabajos previamente
encolados o descargas pendientes; abrirlo no equivale a una garantía general de
cero generación. En esta ejecución no existía ese trabajo pendiente.

Chrome mostraba tres perfiles vinculados con extensión 0.2.12 y uno con 0.2.13.
Se verificaron en la página nativa de Detalles el ID público estable y la carpeta
`~/Documentos/EXTENSION-RPC-FLOW/extension` antes de usar **Volver a cargar**.
La fuente de esa carpeta ya era 0.2.14, idéntica al paquete auditado. La operación
fue una actualización explícita del software existente, no una recarga para
inferir un diagnóstico. No se editaron fuentes del repositorio externo ni se
desinstaló la extensión; las instalaciones antiguas deshabilitadas quedaron
intactas.

Los cuatro perfiles confirmaron **0.2.14** en Chrome y se reconectaron a Vimo
con sus vínculos existentes. No se pulsaron Vincular, Desvincular, Reanudar,
Generar ni `connection.test`. Los paneles se reabrieron sobre los proyectos que
ya estaban abiertos; no se recargaron los documentos de Flow ni se crearon otros.

La UI nativa mostró cuatro cuentas vinculadas y con capacidad, sus cuatro correos
verificados actualmente y uso de 500 por perfil. Una disponibilidad individual
seguía figurando como «Comprobando»; ese estado no se cambió ni se presentó como
una generación probada. El ledger final conserva los mismos 117 recibos y sus
estados, cuatro identidades verificadas, límite 500 en cada cuenta y consumo
agregado 89. Limpiezas pendientes: cero. No hubo nuevas imágenes ni gasto de
proveedor causado por esta revisión.

**Alcance probado con perfiles reales:** arranque de la app nativa, lectura de
cuentas, actualización del paquete cargado, reconexión de credenciales existentes,
etiquetas de correo y conservación de resultados/consumo. **Todavía pendiente:**
primera vinculación real de una cuenta sin binding; los cuatro perfiles existentes
ya estaban vinculados. Se solicitó al usuario identificar un perfil nuevo para
ese caso, sin eliminar vínculos ni crear cuentas como parte de la prueba. La
aceptación de primera vinculación continúa siendo la simulada documentada arriba.
