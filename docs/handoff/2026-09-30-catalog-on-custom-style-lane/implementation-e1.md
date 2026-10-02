# Entrega 1: estado de la implementación y traspaso

Implementación de la Entrega 1 de [design.md](design.md) según [plan.md](plan.md), hecha el
2026-09-30 y el 2026-10-01 con agentes en paralelo (sidecar, servidor y app). Cada tarea pasó una
revisión propia y todo el conjunto, una revisión final de las dos ramas.

## Ramas

| Repo           | Rama                       | Estado                                                                                                                                                    |
| -------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VIMO-TAURI     | `feat/catalogo-estilos`    | Local, sin push hasta que el dueño pruebe todo. Sobre `dev` `c007e008` (PR #91), con rebase aprobado por el dueño.                                        |
| `vimo-landing` | `feat/reconstructor-gemas` | Mergeada a `main` sin PR el 2026-10-01 (`61d7e9e`, aprobado por el dueño) y desplegada en vimo.click: 20 commits sobre `cf728fb`, 6 de ellos de la Ola 3. |

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

## Ola 3

El 2026-10-01 el dueño le pidió a Claude los pasos de esta ola y respondió las preguntas abiertas.

**Decisiones del dueño:**

- **Agente:** CometAPI con `gpt-5.4-nano` y reintentos ante fallos. Después el dueño pidió probar Gemini
  y otros más baratos y elegir el mejor para esto: sigue nano, pedido con su id con fecha (spec §6.3).
- **Gemas largas:** una gema admite hasta 100 000 caracteres (eran 30 000). La suma de las secciones
  sigue en 30 000 y el agente condensa.
- **Adaptación en segundo plano (2026-10-02):** «Preparar con IA» guarda la gema pegada tal cual y la
  adapta fuera del modal. Mientras tanto se muestra «Generando adaptación a ficha de Vimo manteniendo
  tu gema…», se puede cerrar el modal y las secciones se guardan solas. «Pegar gema nueva» reemplaza
  al tocar el botón. Detalle en la nota del 2026-10-02 de la ADR-0048.
- **Texto sin estilo visual:** con código y mensaje propios.
- **Registro de reconstrucciones:** `gem_rebuild_logs` guarda 60 días (es solo un registro) y la página
  de privacidad lo dice.
- **QA con claves:** presupuesto de 5 USD.
- **Catálogo inicial:** las 34 gemas de Imperio Pro de `estilos/` son sus estilos iniciales.
- **Esta rama:** queda local hasta que el dueño pruebe todo.

**Estado de cada paso:**

1. **SQL de `gem_rebuild_logs`:** aplicado el 2026-10-01 a las 19:30, con 60 días, por la Management
   API de Supabase con la sesión del CLI del dueño (el CLI instalado no trae el binario de
   `db query`). Verificado:
   - RLS activo y sin políticas;
   - el job `gem-rebuild-logs-retention` activo;
   - PostgREST ve la tabla.
2. **Variables en Cloudflare Pages:** cargadas en Production el 2026-10-01, como secretos:
   - `RECONSTRUCTOR_API_URL=https://api.cometapi.com/v1`;
   - `RECONSTRUCTOR_MODEL=gpt-5.4-nano-2026-03-17`: el id con fecha desde las 20:05; antes era el
     alias, que CometAPI llegó a atender con `gpt-5.4-mini`;
   - `RECONSTRUCTOR_EXTRA_BODY={"reasoning_effort":"medium"}`;
   - `VIMO_FLAG_GEM_TEMPLATE=admins` y `VIMO_FLAG_NEW_CATALOG=off`;
   - una `RECONSTRUCTOR_API_KEY` provisoria, la de FLUJO-VIANI, que se reemplaza por la de Vimo.
3. **Deploy de `vimo-landing`:** hecho el 2026-10-01. El merge `61d7e9e` llegó a `main` sin PR, como
   aprobó el dueño, y vimo.click lo sirve desde las 20:10. Suma 6 commits de esta ola:
   - `3177bad`: código `sin-estilo-visual`;
   - `9ff0188`: dos reintentos;
   - `f2080cc`: 60 días y la política de privacidad;
   - `1fc21c5`: gemas de hasta 100 000 caracteres;
   - `2f7a5a4`: el modelo que respondió, en el registro;
   - `6b5666b`: el modelo elegido, en el SETUP.

   Prueba contra la foto de antes del deploy:
   - `verificar-acceso` responde idéntico: 401 `sin-token` o `token-invalido` y OPTIONS 204, con CORS;
   - `reconstruir` da 401 sin sesión o con un token inválido, y OPTIONS 204, con CORS;
   - la política de privacidad publicada trae el texto nuevo.

4. **Sidecar:** recompilado con esta rama y el Node oficial.
5. **Comparación de modelos:** dos rondas (spec §6.3), con un gasto de hasta 2,2 USD de los 5 del
   presupuesto: menos de 1,05 la primera y 1,11 la segunda.
   - La segunda probó Gemini 3, 3.1 y 3.5 Flash y Flash-Lite, Grok 4.1 Fast, Claude Haiku 4.5 y otros,
     con 2 gemas más de 44 735 y 94 054 caracteres.
   - Dos revisores a ciegas compararon las 8 gemas reales contra 105 reglas de estilo: nano `medium`
     perdió 6 y los Gemini, de 22 a 27.
   - Nano cuesta unos 0,39 centavos de dólar por reconstrucción y tarda de 15 a 36 s en una gema
     real, y 29 s en la de 94 054.
6. **QA manual:** la hace el dueño en `pnpm tauri dev`; el deploy ya está arriba (pasos A a F de
   [plan-e1-app.md](plan-e1-app.md), «QA manual»). Con su correo en la tabla `admins` y el interruptor
   en `admins`, no hace falta el truco del `localStorage`.
7. **Push de `feat/catalogo-estilos` y PR a `dev`:** cuando el dueño lo diga.

## Compuertas antes de `VIMO_FLAG_GEM_TEMPLATE=all`

De la revisión final (ninguna bloquea el merge a `dev`, porque el interruptor arranca en `admins`):

- **Costo:** el cupo cuenta solo las filas `ok`; pedidos concurrentes pasan juntos el chequeo y los
  intentos fallidos (hasta 6 llamadas al proveedor cada uno, unos 0,39 centavos de dólar por
  reconstrucción) no tienen tope. Falta decidir un tope de fallos o un pedido en vuelo por usuario.
- **Texto sin estilo visual:** resuelto el 2026-10-01. El servidor responde 422
  `sin-estilo-visual` y la app muestra un mensaje propio, sin «Reintentar».
- **Privacidad:** resuelto en `vimo-landing` (`f2080cc`): la política dice que el texto se guarda 60
  días. Sale con el deploy.
- **Guards rojos de `dev`:** arreglarlos en `dev` (simular al juez) y volver a correrlos sobre esta
  rama: cubren justo los modos de personaje que cambió el carril.
- **POV Stickman** (comparación de modelos): el agente deja «A simple stickman doll character
  drawing.» como `promptStart` sin avisar del recorte, y pierde de `visualStyle` la regla «los demás
  personajes son muñecos iguales». Revisarlo en la QA antes de usar el agente con el catálogo.
- **Sección `character` sin la limpieza de la Fase 1**, con evidencia de la comparación de modelos.
  - Qué pasó: en la gema 05 (stickman cinemático), nano copió a `character` los marcadores literales
    `[TIPO DE PERSONAJE]` y `[ROPA]` y «full-body … in a neutral pose».
  - Por qué llega a las imágenes: `protagonistFromSection` (`subject-weaver.ts`) usa la sección tal
    cual, sin pasar por `portraitStateMark`, y la pega en cada escena después de «must look exactly
    like this». Congela al protagonista.
  - Arreglo pendiente: filtrar en `protagonistFromSection`, prohibir en las instrucciones del agente
    los marcadores y la pose, o las dos cosas.
- **QA con claves:** etiquetas `[T:…]` fuera del frente del prompt, el preámbulo del lote frente a la regla del tratamiento sin protagonista,
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
