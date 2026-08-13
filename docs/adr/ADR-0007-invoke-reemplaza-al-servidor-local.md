# ADR-0007 — invoke() de Tauri reemplaza al servidor local

- **Estado:** Aceptada
- **Fecha:** 2026-08-13
- **Área:** distribución
- **Reemplaza a:** [ADR-0002](ADR-0002-servidor-local-como-sidecar-de-tauri.md)

## Problema

El servidor local (Hono) existía por una sola razón: la SPA React del proyecto original
corría en un navegador y necesitaba un **puente con el sistema operativo** (filesystem,
procesos, FFmpeg). La ADR-0002 planeaba conservarlo compilándolo como sidecar de Tauri.
Pero dentro de Tauri ese puente ya existe de fábrica: `invoke()` conecta la webview con
Rust, que tiene acceso pleno al sistema. Mantener el sidecar implicaba empaquetar un
segundo runtime, gestionar su ciclo de vida (puerto, health check, huérfanos) y
sostener una capa de seguridad (entitlements firmados) cuya única razón de ser era que
hubiera un servidor HTTP escuchando en localhost.

## Decisión

**El servidor local desaparece.** El puente entre la app y el sistema operativo es
`invoke()`:

- **Las funciones del pipeline se conservan tal cual** (a lo sumo refactor o renombre a
  inglés): cambia _quién las invoca_ — comandos de Tauri ejecutados por Rust — no _qué
  hacen_. Las 6 fases (voz, transcripción, cortes, prompts, imágenes, render) siguen
  siendo el mismo código.
- **El entitlement firmado (Ed25519 + AES-GCM) se elimina como concepto.** Firmar
  licencias servía para que el servidor Hono local pudiera verificar acceso sin
  confiar en la SPA; sin servidor, no queda nada que firmar ni quien lo verifique. La
  verificación de acceso queda en el edge de vimo.click (ADR-0006).
- **Utilidad de transporte dual (solo especificada, NO implementada):** cuando el
  pipeline se migre, el `api/` de cada módulo no llamará `invoke` ni `fetch` a mano:
  usará una utilidad de `modules/common` que bifurca con `isTauri()` — nativo →
  `invoke()`; web → `fetch` contra el backend web. Es el mismo patrón del `api/` que
  ya instauró auth (ADR-0006). No se implementa hoy porque no existen todavía ni los
  comandos Rust ni el backend web que consumiría.

Esta ADR **documenta la dirección**; no cambia código del pipeline. El `fetcher` actual
de `modules/common` queda como está hasta que la migración del pipeline lo reemplace o
lo absorba la utilidad dual.

## Alternativas consideradas

- **Sidecar Hono compilado (ADR-0002)** — reemplazada: segundo runtime empaquetado,
  ciclo de vida propio (puerto dinámico, health check, procesos huérfanos) y firmas de
  entitlement, todo para duplicar un puente que Tauri ya provee.
- **Servidor embebido en Rust (axum/actix sirviendo HTTP local)** — descartada: mismo
  overhead conceptual del sidecar (HTTP, puerto, auth local) sin su única ventaja, que
  era reutilizar el binario Hono sin tocarlo.
- **Backend 100 % web (el pipeline corre remoto)** — no descartada como _complemento_:
  la utilidad dual la contempla (`fetch` en web). Como único modo contradice la promesa
  del producto: el trabajo de video no sale de la máquina del usuario.

## Consecuencias

- ✅ Un solo proceso: sin gestión de sidecar, puerto, health check ni huérfanos (las
  secciones correspondientes de ARCHITECTURE.md quedan obsoletas y se marcan así).
- ✅ Menos superficie: sin HTTP en localhost no hay CSP local, ni auth de loopback, ni
  firmas de entitlement.
- ✅ FFmpeg pasa a ser invocado por Rust directamente (sigue viajando como binario).
- ⚠️ El pipeline TypeScript debe poder ejecutarse desde Rust: la forma exacta (Node
  como sidecar mínimo, port a Rust, o embebido) es una decisión de la fase de
  migración del pipeline — se documentará en su propia ADR con el diseño de comandos.
- ⚠️ Progreso por fase: sin SSE/polling HTTP local, el avance viajará por eventos de
  Tauri (`emit`) — a fijar en esa misma ADR.
- 🔒 Hasta esa fase, la app no genera videos: no hay modo degradado intermedio con
  sidecar "mientras tanto".

## Verificación de cumplimiento

- **Greps ejecutables (hoy):**
  - `grep -rn "5174\|localhost:517" src/` → vacío (nada apunta al servidor viejo).
  - `grep -rn "licencia/refrescar\|entitlement" src/` → vacío (las firmas no se
    portaron).
  - `grep -rn "externalBin" src-tauri/tauri.conf.json` → vacío (no se empaqueta
    sidecar).
- **Cuando se migre el pipeline:** los `api/` de los módulos no contienen `invoke(`
  ni `fetch(` directos — solo la utilidad dual de `common`; una regresión se ve como
  un `invoke` suelto en un hook o una vista.
- **Regresión de dirección:** reaparición de un servidor HTTP local en
  `src-tauri/` o un `fetcher` configurado con un puerto de localhost.

## Referencias

- ADR-0002 (la decisión reemplazada; su análisis de FFmpeg como binario sigue vigente).
- ADR-0006 (verificación de acceso en el edge; patrón `api/` que la utilidad dual
  generaliza).
- Pipeline original: `02-vimo/cursor-video/app/servidor-local/` (las funciones a
  conservar).
