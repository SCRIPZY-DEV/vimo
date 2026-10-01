# Entrega 1: estado de la implementación y traspaso

Implementación de la Entrega 1 de [design.md](design.md) según [plan.md](plan.md), hecha el
2026-09-30 y el 2026-10-01 con agentes en paralelo (sidecar, servidor y app). Cada tarea pasó una
revisión propia y todo el conjunto, una revisión final de las dos ramas.

## Ramas

| Repo           | Rama                       | Estado                                                                                                      |
| -------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| VIMO-TAURI     | `feat/catalogo-estilos`    | Local, sin push. Sobre `dev` `c007e008` (PR #91), con rebase aprobado por el dueño. 2 commits de plan + 25. |
| `vimo-landing` | `feat/reconstructor-gemas` | En `origin` (push aprobado por el dueño), sin PR. 14 commits sobre `origin/main` `cf728fb`.                 |

## Qué quedó

- **Sidecar:** contrato de gemas por secciones, almacén con límites, presets de color, el marco de
  Vimo (`buildTemplateSystem`, `composeGemText`), el carril verbatim con secciones (protagonista de la
  sección `character` sin Fase 1), etiquetas de tratamiento, inicio y final fijos, muestras con el
  marco, validación del proyecto y la gema como texto para el preview, el respaldo de imágenes y
  «Crear personaje con mi estilo».
- **Servidor:** `admin` y `features` en `verificar-acceso` (interruptores `VIMO_FLAG_*`), el agente
  reconstructor `POST /api/estilos/reconstruir` (esquema, instrucciones, cliente del modelo, registro
  en `gem_rebuild_logs` y cupo diario) y `SETUP_RECONSTRUCTOR_GEMAS.md`.
- **App:** interruptores en el acceso, cliente común de vimo.click, llamada al agente, modal y
  galería por secciones detrás de `features.gemTemplate`, migración de gemas viejas (con aviso de
  revisión y el texto original visible), payload del proyecto por secciones y «Crear personaje con
  mi estilo» con una gema de plantilla.
- **Docs:** ADR-0048 (con las correcciones de la implementación), notas en ADR-0006, ADR-0020 y
  ADR-0038, ARCHITECTURE y `scripts/test/README.md`.

Las gemas viejas producen la misma conversación y los mismos prompts que antes: lo fijan las huellas
SHA-256 de `check-gem-verbatim-lane.mjs`, tomadas del código de `dev`.

## Verificación

- VIMO-TAURI, sobre una copia limpia del HEAD final: `pnpm format:check`, `pnpm lint`, `pnpm build` y
  `pnpm check:locales` en verde; los 16 guards nuevos (`check-gem-*` y `check-app-*`) dan 228 de 228.
- La batería del carril queda igual que en `dev`: 4 guards en verde y 3 que fallan desde el PR #91
  (`check-style-character-video`, `check-editor-character-selection`, `check-silent-scene-images`,
  33 tests) porque no simulan al juez de alineación narrativa. Mismos 33 nombres antes y después.
- `vimo-landing`: 15 archivos y 592 tests en verde, lint igual a la base, build en verde y el bundle
  de wrangler compila.

## Pasos del dueño (Ola 3)

1. Aplicar en Supabase el SQL de `gem_rebuild_logs` de `vimo-landing/SETUP_RECONSTRUCTOR_GEMAS.md`.
2. Cargar en Cloudflare Pages las variables `RECONSTRUCTOR_*` y poner `VIMO_FLAG_GEM_TEMPLATE` en
   `admins` (`VIMO_FLAG_NEW_CATALOG` sigue en `off`: es de las Entregas 2 y 3).
3. Desplegar `vimo-landing` (merge o deploy de la rama, con aprobación).
4. Recompilar el sidecar de la app con esta rama (`pnpm build:sidecar`): un sidecar viejo rechaza un
   pedido de «Crear personaje con mi estilo» que solo trae `sections`.
5. Comparar modelos del agente con 10 gemas, incluidas 2 o 3 largas (25 000 a 30 000 caracteres): el
   cliente llama al modelo sin streaming con 120 s de plazo, y los errores conocidos registran cortes
   de conexión cerca de los 120 s y primeros bytes lentos en CometAPI con prompts grandes. Revisar en
   especial el estilo POV Stickman (regla de figura y frase fija con el protagonista).
6. QA manual en `pnpm tauri dev` (pasos A a F de [plan-e1-app.md](plan-e1-app.md), «QA manual»). Para
   encender el interruptor sin servidor, en la consola del webview:
   `localStorage.setItem('vimo:demo:access:v1', JSON.stringify({ email: '<correo de la sesión>', demo: false, admin: true, features: { gemTemplate: true, newCatalog: false } }))`,
   cortar la red y recargar.
7. Aprobar el push de `feat/catalogo-estilos` y el PR a `dev`.

## Compuertas antes de `VIMO_FLAG_GEM_TEMPLATE=all`

De la revisión final (ninguna bloquea el merge a `dev`, porque el interruptor arranca en `admins`):

- **Costo:** el cupo cuenta solo las filas `ok`; pedidos concurrentes pasan juntos el chequeo y los
  intentos fallidos (hasta 4 llamadas al proveedor cada uno) no tienen tope. Falta decidir un tope
  de fallos o un pedido en vuelo por usuario.
- **Texto sin estilo visual:** un texto pegado que no es una gema termina en `modelo-fallo` (502) y
  la app dice «Reintentá». Falta decidir un código y un mensaje propios.
- **Privacidad:** la página de privacidad de vimo.click no menciona que `gem_rebuild_logs` guarda el
  texto de las gemas 30 días.
- **Guards rojos de `dev`:** arreglarlos en `dev` (simular al juez) y volver a correrlos sobre esta
  rama: cubren justo los modos de personaje que cambió el carril.
- **QA con claves:** etiquetas `[T:…]` fuera del frente del prompt, la sección `character` sin la
  limpieza de la Fase 1, el preámbulo del lote frente a la regla del tratamiento sin protagonista,
  el CPU del Worker en el plan gratuito (un error 1102 llega sin CORS).

## Decisiones tomadas durante la implementación

Las más importantes, con su costo si fueran equivocadas (el detalle completo quedó en los cuerpos de
los commits):

- La ADR de la entrega es la ADR-0048 (no la 0041): `dev` ya usaba de la 0041 a la 0047.
- Los 3 guards rojos de `dev` no se arreglan en esta rama (el dueño detuvo ese arreglo); la
  regresión se midió como «ningún test nuevo en rojo» contra la base de `dev`.
- El rescate sin referencia sigue el orden del spec §5.4 y no el del plan (P5).
- La Fase 1, el diseño de personajes y el retrato de las muestras reciben la gema sin las frases
  fijas; el preview y el respaldo las pegan después de quitar la copia del modelo.
- Con dinamismo, una escena cuyo tratamiento no incluye al protagonista va sin `[subject]`.
- Las muestras con foto llevan la referencia solo donde aparece el protagonista, como el video.
- Las instrucciones del agente mueven (no descartan) las reglas del protagonista; un «N/A» del
  modelo cuenta como sección vacía; la gema se trata como dato (anti-inyección).
- El cliente de vimo.click decide el timeout por la señal (WebKit aborta con otro error) y la
  mutación del agente usa `networkMode: 'always'` (sin red falla en vez de quedar en pausa y
  dispararse sola).
- La migración relee la gema antes de guardar (borrar una gema mientras migraba la hacía volver).
- No se reescribió historia: los mensajes de commit con algún dato viejo quedaron así y se anotaron.

## Pendientes menores

Quedaron anotados en la revisión final como seguimiento, sin riesgo para el usuario con el
interruptor en `admins`: consolidar dos lecturas del filtro de color, endurecer los guards con
literales, un `Object.hasOwn` en `isCharacterStyleId` (lookup heredado de `dev`), avisar al cerrar
«Pegar gema nueva» sobre una gema con secciones, mostrar «Texto original» también con el interruptor
apagado, y el texto de algunas etiquetas.
