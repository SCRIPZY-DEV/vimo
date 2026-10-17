---
title: Revision Vimo de la entrega extension 0.2.13
date: 2026-09-21
tags: [vimo, flow, extension, vinculacion, revision]
estado: vigente
actualizado: 2026-09-21
---

# Revisión de la entrega de vinculación 0.2.13

- **Fecha:** 2026-09-21.
- **Rama Vimo:** `feat/extension-vimo-automater`, revisión de producto `1fc558c`.
- **Fuente externa:** `929dfcc`, rama `feat/flow-extension`, limpia; manifest y
  package `0.2.13`. No se modificó el repositorio de la extensión.

## Resultado

La entrega recibida ya es compatible con Vimo. No necesita otro endpoint,
permiso, secreto ni sustitución del bridge vendorizado. Se conservan los arreglos
propios de Vimo sobre autenticación, identidad, presupuesto y descargas.

| Requisito de la entrega            | Evidencia actual                                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Arranque al abrir Vimo             | `src-tauri/src/lib.rs` llama `flow::start_on_launch`                                                        |
| Origen público fijo                | `src-tauri/src/flow.rs` fija `chrome-extension://bjpjjnjiikhccbjlkgmfpfhenbdpikbm`                          |
| Receptor activado                  | `service.ts` usa `allowExtensionLinkRequests: true`; vendor anuncia la capability y procesa el frame exacto |
| Canje privado en el socket elegido | El ejecutable firmado entrega nonce antes del ACK público y exige `auth.pair` con identidad coincidente     |
| Autenticación antes de éxito       | Bridge persiste asociación antes del ACK; worker guarda credencial antes de presentar conexión              |
| Un dueño del servicio real         | La app canónica actual posee 43127 mediante un único servicio hijo                                          |

## Validación del paquete y ejecutable

Los 17 archivos de `extension/`, `artifacts/vimo-automate-0.2.13/` y ZIP son
idénticos byte por byte. La clave pública mantiene el ID indicado. SHA-256 ZIP:
`ad2db9d07e8c64c8ab9090720bc0ca695ac5c7f1fa01def45f0624504fa11185`.
Sintaxis de worker y panel comprobada con `node --check`.

Se ejecutaron 13 comprobaciones contra el SEA firmado de la app canónica,
con WebSocket real, identidad sintética y directorio/puerto efímeros de prueba.
Incluyen capability, presencia pasiva, nonce antes del ACK, correlación, canje,
asociación persistida, cero jobs, distinción entre autenticación y capacidad,
credenciales ausentes del estado público/ledger y cierre limpio.

Sidecar validado y ejecutándose en la app:
`f705ece7c0868fa42c02e37f425ab65fd9e1a350e851032602abc43828a991fa`.
La evidencia externa anterior usaba otra revisión del vendor; por eso esta
comprobación se realizó contra el ejecutable actual y no se heredó su resultado.

Fixture local no versionada:
`/private/tmp/vimo-panel-link-final-artifact-check-20260921.mjs`.
No inició generación, `connection.test`, subida ni recarga de perfiles reales;
no cambió sus credenciales, datos, cuotas o pausas. No fue necesario recompilar
ni reiniciar la aplicación para aceptar esta entrega.

## Pendiente histórico de 0.2.13, atendido en 0.2.14

> **Actualización 2026-09-21:** la observación sin binding y renovación de
> documento ya están implementadas en la extensión 0.2.14 y verificadas en
> aislamiento. Véase la [aceptación posterior](../2026-09-20-flow-identity-discovery/review-extension-0.2.14.md).
> El bloque siguiente conserva el alcance de esta revisión de 0.2.13.

La observación de cuenta/proyecto antes de seleccionar sigue dependiendo de
binding en `discoveryContext`. También permanece el pedido de renovación de
documento tras navegar. Se conserva el
[pedido independiente de identidad y discovery](../2026-09-20-flow-identity-discovery/prompt-extension.md);
no hay que volver a implementar el contrato de vínculo de un gesto.

La paridad del paquete no acredita qué versión ejecuta cada perfil de Chrome.
Esta revisión tampoco afirma aceptación manual con cuentas Google reales.
