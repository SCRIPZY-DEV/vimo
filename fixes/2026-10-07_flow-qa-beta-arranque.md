---
title: OAuth Beta y arranque de Tauri QA con Vite propio
date: 2026-10-07
tags: [vimo, qa, auth, tauri, beta]
---

# Fix QA: callback dev y propietario de Vite

- **Fecha:** 2026-10-07
- **Rama:** `chore/flow-native-qa-20261006`.
- **Base:** QA 2dd6e7e; producto d4169747 sin cambios.

## Causa

Sebas informa que Google rechazó login en Chrome for Testing. La prueba pasa a Beta oficial con login manual sin CDP, con perfil nuevo. La URL de callback dev debe permanecer exactamente localhost5173 aunque el webview use IPv4. Además Tauri CLI 2.11.4 comprueba sólo conexión TCP y ejecuta el hook asíncronamente: strictPort solo no impide avanzar ante un servidor ajeno.

## Corrección

Opener dev-only restringido al authorize real y callback localhost exacto, manteniendo provider único y PKCE. Se retiró el registro de esquemaQA. Perfil OAuth `browser-auth-beta`, separado de los cinco perfiles Flow y del previo CfT. Root confirmó la ruta `/Users/sebas/Applications/Google Chrome Beta.app`; queda fijado su ejecutable interior, con cero fallback a navegador operativo. No se abrió navegador ni se creó su perfil durante la preparación.

Hook exacto `pnpm run dev --host 127.0.0.1 --port 5173 --strictPort`; Vite/devUrl IPv4. Constante frontend fija callback localhost permitido. La lanzadera persistente externa comprueba5173/43137 libres y crea contexto privado; Vite publica readiness atómico tras listening y el runner comprueba ID/permisos/PID propietario antes de exec Cargo. Ver [ADR-0053](../docs/adr/ADR-0053-flow-qa-nativa-aislada.md).

## Límites deliberados

Sólo QA local, no publicar. No cambiar Supabase, registrar esquema ni alterar identidad Google. Sin nuevas llamadas a proveedores ni cambios de pipeline/editor/vendor. Guard de puerto previo a Cargo, no vigilancia continua de la compilación. El relay PKCE heredado es para un login pendiente; no autentica otros procesos locales. Cualquier aceptación exige canje y veredicto online reales. Bundle anterior histórico: no abrirlo para esta prueba. La ruta de Beta ya está configurada; instalación y arranque final a cargo de Root.

## Validación reproducible

Ejecutar format→lint→build y compilar Rust dev sin `cargo run`. Guards locales de URL incluyen fuente Rust real, con dependencias Tauri dev y custom-protocol para comprobar modo y rechazar callbacks ajenos. Guards de arranque usan funciones puras e I/O inyectado: no arrancan servidores ni procesos. Scripts de comprobación fuera de git, resultados en entrega persistente. Inspeccionar hook exacto/devUrl y ausencia de deep-link registrado; cotejar pipeline/editor/vendor con d4169747.

Resultado de este árbol: `pnpm format`, `pnpm lint`, `pnpm build` y `cargo build --manifest-path src-tauri/Cargo.toml` aprobados. Guard OAuth con fuente real:38/38 dev y38/38 custom-protocol; el opener no se invocó. Revisión independiente de arranque:67/67 comprobaciones puras (46 Python y 21 Vite), sin procesos/listeners reales. Los guards custom-protocol sólo validan rechazo, no entregan un nuevo bundle. Evidencia y comandos en la carpeta persistente `validation/`; no atribuir a este cambio builds ni 19 casos anteriores.

## Pruebas manuales realizadas

No se abrió Vimo QA, Vite, puente, browser, login o generación. No se modificaron perfiles de Root ni llavero operativo. Root valida ruta de Beta y guards antes de iniciar; Sebas realiza login manual. La auditoría estática y los guards puros no acreditan OAuth Google ni aceptación de 300 imágenes.

## Cierre de configuración del navegador — 2026-10-07

Root entregó la ruta de Beta. Se configura exclusivamente `Contents/MacOS/Google Chrome Beta` y se conserva `browser-auth-beta` como perfil de OAuth de Vimo, separado de las cuentas de Flow. El callback exacto, hook strictPort y runner no cambian.

La inspección readonly encontró identifier `com.google.Chrome.beta`, autoridad `Google LLC (EQHXZ8M8AV)` y versión instalada `156.0.8078.12`, distinta de la156.0.8078.4 comunicada. La comprobación `codesign --verify --deep --strict` falló: `embedded framework contains modified or invalid version` en Google Chrome Framework.framework. Es un pendiente de la instalación que administra Root, no prueba de un problema en OAuth. Se conserva la instalación tal como la dejó Root; él revisa la integridad antes de abrir. No se atribuye una causa sin evidencia.

Para esta fuente con la ruta Beta real pasaron format, lint, build y cargo build dev, y se recompilaron los38casosOAuth por modo:38/38dev y38/38custom-protocol, sin abrir el navegador. Los67checks del arranque pertenecen a6a99cb8; esos archivos no cambiaron y no se repitieron. Hashes, comandos y resultados exactos quedan en la entrega duradera. El primer arranque y login siguen reservados a Root/Sebas tras validar instalación y guards. Esta sesión no ejecutó navegador, appQA, Vite o bridge.
