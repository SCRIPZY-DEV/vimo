---
title: Rechazo de cuenta Flow y resultado incierto diferenciados
date: 2026-10-07
tags: [vimo, flow, errores, qa]
---

# Fix: revisión de cuenta sin afirmar imágenes existentes

- **Fecha:** 2026-10-07
- **Rama:** `fix/flow-submission-rejection-20261007`
- **Base:** `bf062bf8aa5f52e08cfa6ee4f875eca914bbd97e`

## Causa

La aceptación real comunicada por Root produjo 323 escenas de cinco segundos y
323 prompts, 148 con referencia de Elías. Google rechazó explícitamente cinco
operaciones iniciales con `ACTIVITY_BLOCKED`, `rpcCode:7` y
`submission:rejected`; no se importó ninguna imagen ni se recibió media.
Quedaron dos solicitudes received y 316 queued, con pausa manual. Los 196,2 s
del intento fallido no representan un benchmark de generación completada.
Estos datos son del informe de Root; esta sesión no leyó el runtime ni repitió
el lote.

En el código, `safeTerminal` identificaba el rechazo confirmado como un terminal
seguro. El observador lo comunicaba como `flow_restart_required`; la existencia
de hermanos pendientes impedía `canRestart` y lo convertía en
`flow_review_required`. Su traducción decía «Conservamos su recibo», sin
distinguir el registro durable de un medio generado. La galería tampoco separaba
rechazo de cuenta de fallo genérico.

## Corrección

- Diagnóstico tipado `flow_account_review_required` para `ACTIVITY_BLOCKED`
  inequívocamente rechazado, sin resultado y sin contradicciones de aceptación
  o incertidumbre. Upload rechazado incluye phase y estado not-sent explícitos.
- `flow_submission_unknown` para estado o envío incierto; se prioriza frente a
  rechazo en el resumen de lotes mixtos. No se clasifica por `rpcCode:7` solo.
- Mensajes diferenciados en Crear, editor, personajes y galería, en ES/EN/PT.
  Revisión genérica tampoco afirma que exista una imagen.
- El pipeline conserva recuperación manual del mismo lote y revisión en Extensión.
  En el editor y previews, un rechazo terminal no se etiqueta Recuperar ni salta
  verificación de capacidad: Regenerar sigue siendo un gesto explícito de nueva
  imagen. Sólo la incertidumbre conserva la vía de recuperación de resultado.
  Un rechazo ACTIVITY_BLOCKED deja de ofrecer la nueva intención asociada al
  código restart, aun cuando todos los registros sean terminales seguros.
- Descargas de medios existentes mantienen prioridad. No cambia ninguna regla
  de despacho, retry, reserva, safeTerminal, canRestart, pausa o importación.

## Límites deliberados

No corrige ni elude el rechazo de Google. No reenvía, reanuda, borra ni modifica
el lote real; no instala fuente, SEA o UI en la QA abierta. No modifica vendor,
Rust, auth, claves, puertos o perfiles. La nueva clasificación del cliente
requiere recompilar SEA antes de una futura instalación coordinada; un cambio
sólo de traducciones no recupera la causa perdida en una versión antigua.

La pausa real de aproximadamente doce segundos está dentro del plazo existente
de quince segundos. El botón permanece ocupado y el texto indica espera de
confirmación; este fix no intenta reducir ese plazo ni afirma otra causa.

## Validación reproducible

**161/161 comprobaciones focales**, con registros sintéticos y sin transporte real:

- Cliente y storage reales: **77/77** en quince escenarios. Base bf062: 67/77,
  diez negativos. Caso 323 con cinco rechazos, dos received y 316 queued: dos
  recuperaciones conservan IDs/revisión/pendientes y sólo consultan status;
  no generan, reservan, cancelan ni descargan. Un caso separado importa un
  hermano ready una vez y restaura su importación en el segundo intento.
- Componentes reales GenerationProgress, FlowRecoveryJob y EditorScenePanel:
  **80/80** SSR ES/EN/PT. Base: 39/80, 41 negativos. Verifica mapas y controles:
  rechazo + capacidad insuficiente conserva Regenerar deshabilitado; unknown
  conserva Recuperar; los códigos nuevos no son reintentables automáticamente.
  El store ajeno de bloqueos LLM se sustituye por snapshot vacío porque carece
  de getServerSnapshot; transportes de la UI prohibidos dentro del harness.
- Hook/botón de pausa reales con API local simulada: **4/4**. A los 12.041 ms
  el único comando sigue pendiente, con spinner, disabled, aria-busy y mensaje
  esperando cuentas. Resolver ACK y observar snapshot posterior confirma la
  pausa, sin emitir un segundo comando. No es medición de la pausa nativa.
- **17 invariantes** de archivos/funciones: safeTerminal, canRestart, reemplazo,
  importación, editor, pausa, vendor y Rust coinciden con la base.

La revisión independiente inspeccionó los códigos, controles y fixture del
cliente; sin bloqueos. Cero QA nativa/Google en estas comprobaciones. Los
transportes están sustituidos o prohibidos; la ausencia de red no es una
medición de tráfico del sistema.
Evidencia local durable y fixture fuera del repo:
`/Users/sebas/Documents/Vimo-Flow-QA/2026-10-06/generation-controls/submission-rejection/validation/`.

Reproducción desde el worktree owner con Node 22 de la instalación local:

```sh
node /Users/sebas/Documents/Vimo-Flow-QA/2026-10-06/generation-controls/submission-rejection/validation/check-submission-client.mjs after
node /Users/sebas/Documents/Vimo-Flow-QA/2026-10-06/generation-controls/submission-rejection/validation/check-submission-ui.cjs after
node /Users/sebas/Documents/Vimo-Flow-QA/2026-10-06/generation-controls/submission-rejection/validation/check-submission-ui.cjs pause
```

Usar before en lugar de after reproduce el control negativo de bf062. Las
fixtures y archivos generados son evidencia local; no se agregan al commit.

`pnpm format`, `pnpm lint`, `pnpm build` y `pnpm check:locales` completados sin
errores; **2065 claves** alineadas. No se ejecuta el launcher ni un build nativo
o SEA aquí. Los informes registran hashes del árbol evaluado.

## Pruebas manuales realizadas

Ninguna nueva interacción nativa de esta sesión. La reproducción real fue
comunicada por Root el 2026-10-07 y motivó el fix; no es aceptación nativa del
código corregido. La QA permanece abierta y pausada bajo control de Root.
