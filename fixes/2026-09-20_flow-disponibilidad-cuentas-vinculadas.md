---
title: Fix - Disponibilidad Flow con cuentas ya vinculadas
date: 2026-09-20
tags: [vimo, flow, capacity, ui, fix]
---

# Fix: disponibilidad Flow con cuentas ya vinculadas

- **Fecha:** 2026-09-20
- **Rama:** `feat/extension-vimo-automater`

## Causa

`FlowCapacityNotice` convertía cualquier `!ready` en el mismo aviso: faltaban tres
cuentas con capacidad. No mostraba cuántas ya estaban vinculadas ni las razones
que devuelve `capacity.check`. Carga inicial y errores también terminaban en ese
mensaje, con ceros de respaldo. Tener saldo positivo no prueba que un perfil
esté conectado, preparado, conciliado o sin pausa; el texto ocultaba esa diferencia.

El coordinador ya entregaba `linkedCount`, `blockedReason`, `profiles[].reasons`
y reservas. Los tipos de UI omitían esos campos y el componente no los leía.
No se necesita cambiar el protocolo ni calcular capacidad en React.

La lectura agregada actual no reproduce el cero de la captura. Al evaluar el
cálculo original sobre ese snapshot, suponiendo cuatro sockets conectados,
resultan cuatro cuentas y 1.412 imágenes disponibles para una solicitud de 99.
Una cuenta en comprobación aporta sólo una imagen, aunque conserve saldo. Si se
suponen cero sockets, los mismos saldos dan cero disponible y razón offline en
las cuatro. Son cálculos sobre datos persistidos, no una lectura del estado real
de sockets ni una explicación probada del bloqueo histórico de la captura.

## Corrección

- Se muestran por separado cuentas vinculadas, cuentas disponibles y capacidad
  calculada para nuevas imágenes. Sólo se pide vincular más si el total vinculado
  está por debajo del mínimo del coordinador.
- Con cuatro vinculadas y cero disponibles, se indica que las cuentas existentes
  necesitan preparación y se muestran sus causas fuera del acordeón: desconexión,
  cuenta/proyecto, comprobación, pausa, estado antiguo, historial o reservas.
- La consulta pendiente muestra comprobación; un error gana sobre la caché previa
  y deja guiones en capacidad, sin afirmar que faltan cuentas o saldo. Se puede
  actualizar la conexión desde el mismo bloque con el control compartido.
- Pausa manual y hold del proveedor tienen prioridad sobre el mínimo. El déficit
  de imágenes se explica por separado cuando ya hay suficientes cuentas disponibles.
- El desglose numérico permanece en detalles y añade reservas sólo si existen.
  Los nombres usan la presentación de identidad actual/histórica ya existente.
- Claves traducidas es/en/pt; se elimina el texto genérico anterior. Campos opcionales
  permiten diagnosticar snapshots antiguos sin inventar causas.

Archivos: `FlowCapacityNotice.tsx`, `useFlowCapacity.ts`, DTO `flow.ts`, entrada
`flowCapacity.ts`, helpers `flowCapacityMessageKey.ts`/`flowCapacityReasonKeys.ts`,
tipo presentacional `flowIdentity.ts` y los tres catálogos.

## Límites deliberados

No cambia el mínimo de cuentas, el cálculo de saldo, canPrepare, los guards de
ready/verify, ni cadencia, concurrencia, pausas o API. No se reanuda ni conecta
ninguna cuenta automáticamente. La corrección muestra causas entregadas por el
coordinador; no deduce el motivo de una captura antigua. La extensión no necesita
cambios para estos nuevos avisos. No se ejecutan imágenes ni pruebas Google.

## Validación reproducible

```sh
pnpm format
pnpm lint
pnpm build
pnpm check:locales
pnpm exec tsc -p tsconfig.pipeline.json --noEmit
```

QA local fuera del repo: hook con TanStack Query real, caché previa, carga, polling,
error de estado/capacidad y recuperación; SSR de la UI real con snapshots ficticios.
Reproducir cuatro vínculos con razones offline y saldo 500: debe mostrar cuatro
vinculadas, cero disponibles y desconexión, sin pedir vincular otras tres. Con dos
vínculos falta uno; con cuatro disponibles y déficit de imágenes se explica saldo/
reservas. Pausa manual o hold tienen su propio aviso. Carga/error no se muestran como
saldo cero. Claves desconocidas usan revisión genérica sin inventar un diagnóstico.

**Resultado:** formato, lint, build, paridad de catálogos y tipos del pipeline
aprobados. Pasaron 11 comprobaciones del hook con TanStack real y 41 de la UI SSR,
incluidas consultas fallidas con caché previa, carga, pausa/hold, razones conocidas
y desconocidas, compatibilidad de DTO, revocadas y reservas. La confirmación de
capacidad usa un texto válido también para una imagen.

Bundle Tauri construido en un target independiente con el frontend recién
compilado; el sidecar no cambia en este fix. Firma ad-hoc verificada con
`codesign --verify --deep --strict`. Copia preparada en
`src-tauri/target/review-flow-capacity/Vimo.app`, ignorada por Git; no reemplaza ni
reinicia la app abierta. No se afirma QA visual manual de ese paquete en perfiles
reales; las comprobaciones de interfaz son SSR con servicios ficticios.

## Pruebas manuales realizadas

Se revisó la captura del usuario y la fuente del cálculo. La lectura local se
limitó a valores agregados/booleanos; no se imprimieron correos, IDs privados,
credenciales, prompts ni URLs firmadas. No se navegó la app ni se reinició su
coordinador o sus perfiles; la corrección visual se verifica mediante SSR aislado,
no se afirma un nuevo recorrido Google real ni reproducción del estado histórico.
