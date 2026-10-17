---
title: Flow - Conteo de imagenes pendiente en Crear
date: 2026-10-07
tags: [vimo, flow, crear, audio, capacidad]
---

# Fix: no convertir un conteo desconocido en una imagen solicitada

- **Fecha:** 2026-10-07.
- **Rama:** `fix/flow-pending-image-count-20261007`.
- **Base:** `e6832d84b95ac00d1e78b224a230cf7f1e9b2ed0`.

## Causa

Con audio propio y una gema, `estimatedSceneCount` devuelve cero porque Crear
no conoce aún el número final de escenas. También puede ocurrir con texto vacío
sin cantidad fija. `ImageProviderSection` convertía ese cero a uno al presentar
`FlowCapacityNotice`. Una consulta de disponibilidad para una imagen podía así
mostrar «Imágenes solicitadas: 1» y afirmar que las cuentas alcanzaban para el
video, aunque el lote real todavía no estuviera calculado.

La consulta preliminar no era la reserva del lote ni omitía la validación del
backend. El error era presentar su mínimo como una cantidad conocida y suficiente.

## Corrección

Crear pasa `null` al aviso cuando no existe estimación. El componente conserva
números explícitos en los demás usos y distingue «Imágenes por calcular» de una
solicitud concreta. Muestra la capacidad actual y aclara que Vimo comprobará si
alcanza para todo el video cuando se conozca la cantidad de escenas.

Se usa una explicación genérica porque el mismo estado puede preceder a la
transcripción de un audio propio o a la introducción del texto. No se calcula
una duración ficticia ni se altera el estimador de escenas.

La consulta interna mantiene su mínimo de una imagen para obtener el mismo
snapshot de disponibilidad. Ese uno ya no se muestra como cantidad del video ni
se utiliza para redactar una promesa de suficiencia o un déficit ficticio.
Errores, pausas, revisiones, mínimos de cuentas y discrepancias entre estado y
capacidad siguen teniendo prioridad sobre el mensaje de cantidad pendiente.
Las dos claves nuevas se agregan juntas a ES/EN/PT.

## Límites deliberados

El cambio es de presentación. `Create`, `CreateForm`, `useFlowCapacity.verify`,
las guardas y la revalidación/reserva del lote completo en backend permanecen
intactos. El `|| 1` de esos prechecks se conserva deliberadamente: comprueba la
disponibilidad preliminar y permite llegar al paso que calcula las escenas;
no se presenta como autorización de capacidad para todo el video.

Editor, muestras de estilo y cualquier aviso con cantidad conocida conservan
su conteo y mensajes. No cambia pipeline, vendor, SEA, Rust, auth, créditos,
referencias ni animation locks. No se genera ni instala nada en la QA abierta;
su formulario preparado, HMR, puertos, perfiles y datos permanecen intactos.

## Validación reproducible

Fixtures locales externas al commit en
`generation-controls/pending-image-count/validation/`, sobre la copia aislada.
Ejercitan el selector de proveedor y el aviso reales con React/Query y API en
memoria/prohibida. Los casos cubren audio propio con gema personal o del catálogo,
texto aún vacío, conteos fijos conocidos, estimaciones positivas, avisos numéricos
del editor/muestras y precedencia de errores, pausas, mínimo cinco y discrepancias.
El contraste usa la base e6832d84 y la fuente corregida, sin transporte nativo.

Resultado: **149/149** comprobaciones después, frente a **101/149** en la base
(48 negativos). Los snapshots del componente real muestran «Imágenes solicitadas»
y 1 antes, «Imágenes por calcular» y — después; la consulta preliminar permanece
con uno y la capacidad visible de la fixture se conserva. Se validan los tres
idiomas y la prioridad de todos los avisos, sin API, invoke o red.

`pnpm format`, `pnpm lint`, `pnpm build` y `pnpm check:locales`: exit 0, 2063 claves
alineadas. Los 51 hashes de fuentes/catálogos coinciden con el árbol final. Revisión
independiente sin bloqueos. Los fixtures no prueban generación real ni la fase
posterior de transcripción/reserva; su propósito es detectar el conteo y la
promesa de capacidad falsos en Crear.

## Pruebas manuales realizadas

Root reprodujo el aviso incorrecto en QA155422 después de importar una narración.
Esta sesión registra ese hallazgo y prepara el fix, pero no vuelve a operar la
app QA ni afirma aceptación nativa de la corrección. La prueba real de al menos
300 escenas permanece bajo Root y depende del audio/configuración de claves.
No se copian claves ni sesiones, no se consume saldo y no se inicia generación.
