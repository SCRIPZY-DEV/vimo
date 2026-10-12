---
title: Fix - Identidad visible de cuentas Flow y diagnostico de discovery
date: 2026-09-20
tags: [vimo, flow, extension, identity, fix]
---

# Fix: identidad visible de cuentas Flow y diagnóstico de discovery

- **Fecha:** 2026-09-20
- **Rama:** `feat/extension-vimo-automater`

## Causa

El componente de Extensión usaba el alias como encabezado cuando faltaba identidad
actual; «Mi cuenta de Flow» podía aparecer a la vez como cuenta y proyecto. El
coordinador descartaba el email al invalidarse la sesión, aunque el vínculo fuese
válido. El nombre de una cuenta y el permiso actual para generar eran un mismo dato.

En la extensión externa 0.2.13 (`929dfcc`), `discoveryContext` termina antes de
consultar pestañas cuando no existe binding. Por eso abrir un proyecto sin elegirlo
anuncia perfil sin identidad y sin destino preparado. El botón Vincular de Vimo
está correctamente bloqueado. Después de una navegación, el binding puede retener
el documentId antiguo; seleccionar otra vez obtiene el actual y recupera la cuenta.
Doce comprobaciones sobre módulos originales con dependencias ficticias reproducen estos
mecanismos. No constituyen una captura RPC real ni identifican la causa de cada
perfil del usuario. UpteDb lista proyectos; el adaptador actual verifica el correo
mediante DOM de sesión restringido y comparación con Chrome.

Durante la revisión también se corrigió la coerción de `RegExp.test`: un array JSON
con un hash único podía pasar como accountKey. Ahora debe ser un string real.

## Corrección

- El bridge guarda `lastVerifiedIdentity` normalizada, opcional y exclusivamente
  visual. Se alimenta en pair/resume/session y migra registros válidos al arrancar.
  No cambia versión 1 ni participa en autenticación, conflictos o capacidad.
- El canje persiste la identidad actual vacía junto al histórico nuevo antes del
  ACK; revincular A→B y reiniciar antes del primer heartbeat conserva B y no A.
- `FlowAccountIdentity` se comparte en Extensión y detalles de conexión: correo/
  máscara actuales, histórico explícitamente pendiente o referencia de cuenta por
  identificar. El alias del proyecto nunca se usa como nombre de cuenta.
- El proyecto muestra alias y referencia propia; vinculación, preparación y
  verificación son estados separados. El refresco reconoce cambios del histórico.
- Catálogos es/en/pt explican selección/verificación pendiente y nunca habilitan
  `canLink` a partir de datos históricos.
- Handoff nuevo con causas, puntos de código, candidato efímero, promoción tras
  gesto, fences de navegación y pruebas; actualiza el pedido anterior, cuya
  implementación del gesto ya existe en la fuente externa 0.2.13.

Archivos: bridge server/profiles y README vendorizado; tipos/helpers de identidad,
componente compartido, vista Extensión, detalles y snapshot de refresco; tres
catálogos; ADR-0038 y handoffs. Registro de la coerción en errores conocidos globales.

## Límites deliberados

- No se edita la extensión desde esta sesión. La observación sin binding y la
  renovación segura de documento siguen pendientes de su implementación externa.
- No se obtiene un email desde un hash ni se finge identidad verificada. Un correo
  perdido antes del cambio requiere nueva evidencia del worker.
- No se cambia cadencia, concurrencia, presupuesto, pausas, credenciales ni trabajos.
- No se ejecutan generación, connection.test ni llamadas Google para esta auditoría.
  El usuario inició un video real durante la sesión; se conserva la app activa.
- Ningún script temporal o imagen de evidencia se incluye en el commit.

## Validación reproducible

Sobre Node 22 del entorno:

```sh
pnpm format
pnpm lint
pnpm build
pnpm check:locales
pnpm exec tsc -p tsconfig.pipeline.json --noEmit
```

Comprobaciones locales, con scripts temporales fuera del repo:

- 27 comprobaciones con bridge real y sockets ficticios: pair/heartbeat inválido/recovery/
  resume/migración/reinicio y scheduler. Tres cuentas normales admiten hasta nueve
  activos; cuarta en revisión aporta uno y normal aporta tres. No es benchmark.
- 24 regresiones del contrato de vinculación existente.
- 16 comprobaciones SSR sobre componentes reales con APIs ficticias; 2 sobre el
  snapshot de refresco, incluyendo equivalencia de campo ausente y null.
- 12 comprobaciones sobre módulos originales de extensión: descubrimiento sin
  binding, probe de identidad y documento obsoleto/selección nueva, sin fetch Google.
- Reproducción independiente de revinculación A→B y reinicio antes de heartbeat.

Para repetir sin esos scripts personales: crear almacén temporal y puerto efímero,
autenticar worker sintético, emitir identidad válida y después no verificada; el
histórico permanece, capacidad queda a cero. Reanudar/reiniciar no da permiso. Revocar
sólo la conexión ficticia, vincular otra cuenta y reiniciar antes del heartbeat:
el histórico pertenece a la nueva cuenta. Renderizar componentes con identidad
actual/histórica/ausente y verificar que `canLink:false` mantiene el botón bloqueado.

**Resultado:** formato, lint, build, paridad de catálogos y tipos del pipeline
aprobados. Se compiló un bundle Tauri `.app` en un target separado, usando el
frontend recién compilado y reconstruyendo el SEA. Firma ad-hoc verificada con
`codesign --verify --deep --strict`; no es una distribución notarizada.

El SEA extraído de ese paquete pasó 16 comprobaciones con puerto efímero y
almacén ficticio: gesto/canje, ausencia de token en estado público, identidad
histórica durable, identidad actual vacía antes del ACK, capacidad cero hasta
prepararse y cierre limpio. Cero solicitudes Google y cero trabajos de imagen.
La app preparada está en `src-tauri/target/review-flow-identity/Vimo.app` (artefacto
local ignorado por Git). No reemplaza ni reinicia la app que ejecuta el usuario.

## Pruebas manuales realizadas

Se revisó la captura aportada y se observó Vimo por accesibilidad. Una lectura
agregada del almacén local mostró cuatro cuentas con identidad/correo presentes y
tres aliases genéricos; ese snapshot no es una captura RPC ni reproduce la imagen
anterior. El usuario inició después una generación: no se reinició la app, el
coordinador o Chrome ni se modificaron sus cuentas. No se atribuye aceptación
manual del nuevo vínculo a esta sesión. El cambio visual se verificó con SSR;
la aceptación del recorrido nuevo necesita el paquete corregido de extensión.
