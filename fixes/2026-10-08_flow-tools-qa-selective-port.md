---
title: Port selectivo de Multimagen a QA nativa aislada
date: 2026-10-08
tags: [vimo, flow, qa, multimagen]
---

# Port de Multimagen a QA canónica

- **Fecha:** 2026-10-08
- **Rama:** feat/flow-qa-multimagen-20261008

## Causa

La QA nativa sobre5b11d711 conservaba el coordinador RPC. La preparación
3fcfb4c7 añade un plan Tools opt-in que requiere contrato nativo y SEA nuevos;
sustituir el árbol completo borraría los aislamientos de QA.

## Corrección

Se aplican selectivamente71rutas del rango344f1c45..3fcfb4c7 sobre5b11d711:
56preimágenes exactas,14altas yflow.rs con dos diferencias QA preservadas.
El resto de1482archivos trackeados permanece intacto. Conserva puerto43137,
namespace keychain sin migración legacy, identifier/UUIDWebKit, projectsRoot,
OAuthBeta separado, callbackDEVlocalhost5173, strictPort y launcher existente.
Los contratos, selección y límites funcionales están en los dos informes
2026-10-07_flow-tools-intent-contract y flow-tools-selection-recovery.

## Límites deliberados

No convierte ni reenvía el lote323RPC; datos/pausa y cinco vínculos permanecen
fuera del port. No se cambia mínimo5, cuota500, concurrencia, cadencia, auth,
precios, editor/animaciones o generación operativa. No arranca la QA canónica.
La ejecución real de Google y preparación de los perfiles Tools pertenecen a
la aceptación posterior de Root. No se presupone desbloqueo del proveedor.

## Validación reproducible

Las preimágenes, respaldo y evidencias nuevas viven fuera del repositorio en
`/Users/sebas/Documents/Vimo-Flow-QA/2026-10-08-multimagen-qa-preflight/`.
Se ejecutan formato acotado, lint, build, tipos pipeline y paridad de locales.
Los306checks de fixtures UI reales con fronteras simuladas pasan en esta copia
(162capacidad,48Crear,12Library,23previews,21DOMrecuperación,40editor).
Para preparar artefactos: `pnpm build:sidecar` con Node oficial22.23.2, luego
`MACOSX_DEPLOYMENT_TARGET=14.0 cargo build --no-default-features --color never --message-format=json`
en src-tauri, sin TAURI_CONFIG/REMOVE_UNUSED_COMMANDS. Registrar inputs y
artefactos reales antes de renovar manifiestos; preparar wrapper mediante
`start-native-qa.py --prepare-wrapper` conserva guards y no inicia la app.
Resultados finales de compilación, SEA aislado, firmas y guards se registran
fuera del source en la entrega; no se acreditan anticipadamente en este commit.

## Pruebas manuales realizadas

Ninguna nueva prueba de UI nativa o Google durante este port. Root cerró QA y
confirmó snapshot de323RPC, pausa y0medios antes de autorizarlo. El smoke del
SEA usa datos y workers simulados aislados; no acredita generación real.
