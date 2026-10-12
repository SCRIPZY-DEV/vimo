---
title: Login localhost en app Tauri Flow QA
date: 2026-10-07
tags: [vimo, flow, qa, auth]
---

# Fix QA: callback de desarrollo en navegador aislado

- **Fecha:** 2026-10-07
- **Rama:** `chore/flow-native-qa-20261006`
- **Base QA:** 97529c8; producto d4169747 intacto.

> **SUPERADO parcialmente el2026-10-07:** navegador CfT, callback de bundle y comandos directos de arranque son históricos. Rige [Beta y arranque QA](2026-10-07_flow-qa-beta-arranque.md): sólo dev5173, sin esquemaQA registrado y con lanzadera propia. Los resultados anteriores no validan OAuth real.

## Causa

El abridor nativo QA admitía exclusivamente `vimo-flow-qa://auth/callback`. La app en desarrollo utiliza el relay PKCE existente en `http://localhost:5173/auth/desktop-callback`; el guard rechazaba esa URL válida antes de abrir el navegador. Root autorizó preparar esta ruta de login existente, evitando depender de una nueva allowlist para el deep link QA.

## Corrección

El guard elige callback por `tauri::is_dev()`, asociado a la feature custom-protocol del CLI, no por debug_assertions ni un argumento del renderer. Sólo el modo dev admite la URL localhost exacta; bundle conserva el deep link QA exclusivo. Origen Supabase, provider Google y PKCE siguen validados; el opener conserva ejecutable/perfil QA propios y no usa el navegador predeterminado.

Vite QA fija host localhost, puerto5173 y strictPort, sin fallback a otro puerto. Se conserva el relay existente, el verifier en WebKit exclusivo, Rust, SEA y puente43137. No se introduce callback de producción ni bypass de autenticación/licencia.

## Límites deliberados

Sólo esta rama QA local; no publicar ni llevar sus defaults a producto. No arrancar Vite/Tauri o browser desde esta sesión. Primera apertura y OAuth real pendientes de Root/Sebas. El relay heredado es de un solo login pendiente en memoria; no soporta logins simultáneos y reiniciar Vite pierde el retorno pendiente. Abrir dev y bundle simultáneamente no es un caso de aceptación. El relay local heredado no autentica a otros procesos locales ni correlaciona el código con un intento; otro cliente local puede consumirlo o reemplazarlo. El verifier sigue en el WebKit QA y PKCE exige ese secreto para canjear. No registrar códigos ni tratar la página de retorno como sesión confirmada: comprobar canje y veredicto online. Mantener directorios QA al elegir proyectos.

## Validación reproducible

Compilar nativo dev sin ejecutar, reconstruir bundle y contrastar ambos modos de Tauri con casos puros de URL: callback propio aceptado, callback del otro modo/producción/otro puerto/otro host rechazados; conservar guards de origen, duplicados y PKCE. Scripts locales fuera del repo. Ejecutar format/lint/build y verificar firma/hashes finales. No inferir login real de estas verificaciones; evidencia final y comandos viven en entrega persistente y UI-REPLY.

Resultado: format/lint/build aprobados. `cargo build --manifest-path src-tauri/Cargo.toml` con mínimo macOS14 compiló el modo dev y sus sidecars sin ejecutarlos. `pnpm exec tauri build --bundles app` reconstruyó el bundle, cuya firma deep/strict sigue válida. Guard OAuth local: **19/19 en dev y 19/19 en bundle**, incluyendo rechazo cruzado de callback y verificación del modo real de la dependencia Tauri. El bundle de producción conserva los mismos hashes que97529c8 porque el nuevo caso sólo se activa en dev. No se atribuye esto a aceptación real de login.

## Pruebas manuales realizadas

No se abrió la app ni se ejecutaron login, Google, generación o pagos. Revisión del código real y preparación de los dos modos; aceptación nativa queda a cargo de Root.
