---
title: Preparación de app Tauri para QA Flow aislada
date: 2026-10-07
tags: [vimo, flow, qa, tauri]
---

# Fix de configuración: app QA nativa aislada

- **Fecha:** 2026-10-07
- **Rama:** `chore/flow-native-qa-20261006`
- **Base:** `d4169747`.

> **SUPERADO parcialmente el2026-10-07:** navegador CfT, callback de bundle y comandos directos de arranque son históricos. Rige [Beta y arranque QA](2026-10-07_flow-qa-beta-arranque.md): sólo dev5173, sin esquemaQA registrado y con lanzadera propia. Los resultados anteriores no validan OAuth real.

## Causa

Cambiar el nombre de una app Tauri no aislaba el namespace hardcodeado de llavero, el default `Documents/Vimo`, el puerto43127 ni el esquema OAuth `vimo://`. Su opener usaría el Chrome operativo. Updater y uploader también apuntaban a producción.

## Corrección

Se prepara un clon QA persistente con identifier/llavero/WebKit/proyectos/callback propios, bridge43137 explícito y Chromium de login separado. Desactivados updater nativo/UI y uploader; logs/spool locales permanecen. Dos variables públicas reales se copian con whitelist al `.env` ignorado; claves de proveedores y sesiones no se leen ni trasladan.

El UUID WebKit se fija en el contexto Rust antes de crear ventanas para evitar el error de codegen Vec/array de esta versión. El override macOS también exige 14.0; antes anulaba el mínimo de la configuración base con 11.0.

Detalles y diagrama: [ADR-0059](../docs/adr/ADR-0059-flow-qa-nativa-aislada.md). Pipeline, vendor, dispatcher, alias de imagen y locks de animación son los de d4169747. La configuración es sólo QA local, no una propuesta de release.

## Límites deliberados

No se inicia la app ni navegador, no se ejecutan generaciones, pagos o login. Root lo hará con Sebas. El callbackQA debe estar autorizado en Supabase; las credenciales válidas de Vimo se obtienen por login manual. El build no sirve como aceptación real. La restricción inicial de no usar tauri dev quedó superada por el pedido de Root y el fix [login localhost](2026-10-07_flow-qa-login-localhost.md); ambos modos conservan aislamiento, pero se ejecutan uno por vez. La ruta de proyectos seleccionable debe mantenerse dentro del área QA.

## Validación reproducible

- Instalar dependencias propias con lock; `pnpm format`, `pnpm lint`, `pnpm build` usando configuración pública real.
- Node22 oficial y `pnpm exec tauri build --bundles app`, firma local ad-hoc; no descargar actualizaciones ni publicar/notarizar.
- Inspeccionar Info.plist/firmas/binarios, namespace/callback, hashes y dist embebido; comprobar que el vendor/pipeline sigue idéntico a d4169747.
- Revisar ausencia de mocks/placeholders y nueva funciónOAuth sin ejecutar su spawn; puerto43137 debe estar libre antes de Root abrir.
- Comprobación local del validador OAuth contra el código Rust real: 14/14 casos, sin ejecutar el opener, navegador ni red. Rechaza otro host/protocolo/ruta/callback, duplicados y PKCE inválido. El script temporal permanece fuera del repo y no se entrega como suite oficial.
- Rust: `cargo test --manifest-path src-tauri/Cargo.toml --lib`, 51/51. Format/lint/build web aprobados; bundle Tauri arm64 construido con datos públicos reales.
- Paquete final: firma ad-hoc válida en `codesign --verify --deep --strict`; Info.plist confirma identifier QA, único callback QA y mínimo macOS14. No hay datos/session/settings precargados.
- La fuente completa de `pipeline/` conserva igualdad con d4169747. El SEA fue reconstruido y firmado para este bundle: sus hashes propios se registran en la entrega externa, no se atribuyen las pruebas sintéticas del SEA anterior a este binario.
- Resultado final y procedencia se registran en `../APP-QA-READY.md` fuera del clon, junto a logs y validaciones; no se incluyen credenciales ni scripts temporales en el commit.

## Pruebas manuales realizadas

Ninguna apertura nativa o generación: Root es quien inicia la app QA. Se hizo revisión estática de aislamiento y código; la aceptación Crear/Editor/Rust/SEA con Google real está pendiente.
