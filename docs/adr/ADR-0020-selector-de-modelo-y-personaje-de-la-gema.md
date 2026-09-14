# ADR-0020 — Selector de modelo, simulador de costos y personaje de la gema

- **Estado:** Aceptada
- **Fecha:** 2026-09-02
- **Área:** pipeline / app
- **Parte de:** [ADR-0016](ADR-0016-adopcion-del-rediseno-de-vimo-dev-por-ramas.md)
  (rama 11, la última del roadmap); **cierra las deudas** de
  [ADR-0019](ADR-0019-carril-verbatim-y-segundos-por-escena.md) (selector de
  modelo, personaje declarado por la gema).

## Problema

El carril verbatim de ADR-0019 dejó el catálogo LLM y el cliente listos, pero
sin tres cosas que el origen (`vimo_dev`) ya tenía:

1. **El usuario no elige con qué modelo se escriben sus prompts ni sabe cuánto
   le costará.** `VerbatimWriterOptions.modelId` existía sin nadie que lo
   llenara, y el costo NO es proporcional a las escenas (la gema y el guion
   completo viajan en cada lote): estimar «lo que costó un video de 15, por 40»
   da cualquier cosa a 600 escenas.
2. **La gema no declara qué hace con su protagonista.** El modo lo decidía el
   proyecto (`verbatimCharacterFor`), así que un estilo pensado «sin
   personaje» igual recibía uno, y uno pensado con un personaje fijo obligaba
   a elegirlo cada vez.
3. **No se puede diseñar un personaje con el estilo del usuario.** En portable
   los personajes solo se crean en la vista Personajes, sin guion ni gema a
   mano.

## Decisión

1. **Catálogo por subcomando, sin filtro de clave.** `list-prompt-models`
   (`commands/styles/`) devuelve `offeredModels()` (`inUi && !retired`) con la
   invariante del origen (el de la casa siempre está) y `batchSize`. No
   filtra por clave a propósito: todos los perfiles son DeepInfra y Create ya
   exige esa clave — filtrar acá escondería la lista sin decir por qué.
2. **`options.promptModel` permisivo.** Solo con `customStyle`, string no
   vacío ≤ 200; **sin whitelist** contra el catálogo: un id retirado o
   desconocido se degrada al de la casa con aviso (`resolveVerbatimModel`),
   así un proyecto viejo sigue generando. Lo que escribió de verdad queda en
   `project.json` como `promptModelUsed {id,label}` — **solo auditoría**, sin UI.
3. **El default es la última elección** (`vimo:create:promptModel`, patrón de
   `secondsPerScene`); las tarjetas siempre visibles. NO se porta el switch
   «usar en todos mis videos» ni el modo colapsado v1.23.0 ni su entrada en
   Ajustes (decisión del usuario, 2026-09-02).
   **Reemplazada por [ADR-0022](ADR-0022-modelo-de-prompts-como-preferencia.md)
   (2026-09-04): el modelo pasó a ser una preferencia de Ajustes y la última
   elección ya no se recuerda.** El resto de esta ADR sigue vigente.
4. **Simulador sin imports** (`utilities/promptCost.ts`): port de
   `costoPrompts.ts` con sus constantes calibradas y sus comentarios de
   medición; bandas económico/medio/alto con la MISMA cuenta que la cifra
   (200 escenas, cortes 0,03/0,10 USD) para que título y número nunca se
   contradigan. `PriceCell` sube a `common` (lo usan costs y videos).
5. **La gema declara su personaje.** `style.json` gana
   `character { mode: own | generic | none; defaultCharacterId? }` con dos
   reglas: **ausente = generic** (las gemas ya guardadas siguen igual) y
   **guard de conservación** en `style-save` (una escritura sin el bloque lo
   conserva; «volver a genérico» viaja como `{mode:'generic'}`, nunca como
   ausencia — v1.19.2 del origen). El bloque viaja inline en
   `ProjectCustomStyle` (snapshot, E20) y el carril lo honra: `none` → sin
   protagonista pase lo que pase; `generic` → la Fase 1 diseña uno e ignora
   los personajes del proyecto (con aviso); `own` → manda el proyecto; **un
   proyecto sin bloque conserva el comportamiento previo** (el proyecto
   manda). En Create: con `generic`/`none` la sección de personaje desaparece;
   con `own` es obligatoria (`characterRequired`) y, si la gema trae uno fijo,
   se ofrece sembrado y sin «Cambiar». El puntero es a la biblioteca a
   propósito: editar el personaje se propaga; borrado → aviso y bloqueo.
6. **`design-style-character`**: la consigna del origen (v1.21.0,
   byte-idéntica) como **`system`** y la gema como **contexto en el turno
   user** — al revés del carril de generación (E34), porque medido con la
   gema como system el pedido de ficha neutra perdió 5/5. Una llamada por el
   cliente verbatim con el modelo del proyecto, dos intentos, poda con la
   MISMA regex que `suggest-character-profile`, campos tipeados respetados.
7. **Creación inline desde Create.** `CharacterPickerModal` ofrece «Crear
   personaje con mi estilo» y **se reemplaza** por `CharacterModal` (nunca dos
   modales apilados) con `styleContext {gem, script, promptModel}`; al guardar
   vuelve al picker con el nuevo ya elegido. El import
   `videos → characters/components/CharacterModal` es una **excepción
   cross-módulo** (precedente: `useRequiredApiKeys` de api-keys); la
   alternativa — mover el modal y sus cuatro dependencias a `common` — no
   justificaba el radio del cambio.
8. **El formulario muestra la decisión de la gema como chip y abre su editor**
   (port de v1.19.4–v1.31.2 del origen, 2026-09-11). Con «Mi estilo» activo
   la sección de personaje cuenta qué decidió la gema EN USO con un cartel:
   el fijo (carita + «Este estilo ya trae su personaje»), el fijo borrado de
   la biblioteca (rojo; `fixedCharacterMissing` bloquea el envío con su
   propio motivo), «genérico»/«sin personaje» (turquesa) y el recibo del
   retiro (amarillo). Tocar cualquiera abre el editor de ESA gema con el
   bloque «¿Tu estilo lleva personaje?» arriba. Quién está abierto vive en un
   store fuera de React (`useCustomStyleEditor`, patrón de `useCreateTask`)
   porque la sección y la galería son hermanas y una ref imperativa obligaría
   al formulario a intermediar; con uno abierto, abrir es no-op (nunca dos
   modales). La derivación (`useStyleCharacter`) es una sola para el chip y
   para `formBlockers`. Elegir una gema que escribe el protagonista **retira**
   los personajes elegidos (`withdrawnCharacters`, no viaja en el payload) y
   los devuelve solos cuando un estilo vuelve a aceptarlos; el fijo sembrado
   no cuenta como elección. El predeterminado se guarda al toque en el
   selector (v1.19.3), no solo al cerrar. Sin gema con texto el chip es un
   cartel (`div role="status"`), nunca un botón muerto. Sin equivalente en
   Rust ni en el sidecar.

## Qué NO cambia

### Adenda 2026-09-13 — la selección explícita del editor manda al regenerar

La declaración de la gema sigue gobernando Create. En una regeneración selectiva
de un proyecto con personajes, manda `charactersPresent`: `[]` activa la regla
existente sin protagonista; los índices elegidos determinan identidad y referencias.
El puente conserva esa selección, no la reemplaza por la inferida por el escritor.
Se agrupa por reparto dentro del mismo carril, conservando la gema y sin campos
nuevos en scenes.json. Respuestas contradictorias se reintentan con el rescate
existente; si no se resuelven, no se solicitan imágenes de relleno. La elección se
aplica tras guardar; un cambio real invalida el prompt, no la imagen pagada.
Ver [causa, implementación y QA](../fixes/2026-09-13-fix-custom-style-editor-character-selection/custom-style-editor-character-selection.md).

- Un proyecto **sin** `customStyle` recorre el carril de la casa byte por
  byte: `promptModel` ni siquiera se acepta.
- Un proyecto custom **previo** (sin `promptModel`, sin `character`) escribe
  con el modelo de la casa y decide el personaje como hasta ahora.
- `suggest-character-profile` (biblioteca sin gema) queda intacto.

## Alternativas consideradas

- **Whitelist estricta de `promptModel`** — rechazada: rompería proyectos
  guardados con un id que después se retira; el catálogo ya está escrito para
  degradar con aviso.
- **Filtrar el catálogo por clave presente (como el origen)** — rechazada:
  única familia de proveedor y la clave ya se exige antes.
- **«Modelo de siempre» + tarjeta única (v1.23.0)** — rechazada por el
  usuario: recordar la última elección alcanza y evita el switch de Radix
  dentro del `<form>` (E39 del origen).
- **Personaje fijo por segundo modal** — rechazada: regla «un modal a la
  vez»; un `LabeledSelect` con la biblioteca resuelve lo mismo.

## Consecuencias

- (+) Costo visible antes de generar, con la curva real (no lineal).
- (+) Una gema «sin personaje» o «con personaje fijo» funciona sin pedir nada.
- (−) `PromptModelSection` monta una query más en Create (catálogo estático,
  `staleTime: Infinity`).
- (−) Hay un import cross-módulo declarado; si aparece un segundo, el modal
  de personaje debe subir a `common`.

## Verificación de cumplimiento

- `pnpm format && pnpm lint && pnpm build && pnpm check:locales` en verde.
- Aserción pura (Node type-stripping) `promptCost` vs. `costoPrompts.ts` del
  origen: 240 combinaciones (5 largos × 3 gemas × 2 fases × 8 perfiles) con
  tokens, costo y banda **idénticos**; con la gema de 5 722 chars hay modelos
  en las tres bandas.
- Harness sin claves: `list-prompt-models` (6 ofrecidos, `defaultId`,
  `batchSize 20`); `create-video-project` rechaza `promptModel` sin
  `customStyle` y vacío, acepta un id retirado (se degrada al escribir);
  `style-save` con bloque → lo guarda, sin bloque → lo **conserva**, con
  `generic` → lo reemplaza, modo inválido / id fuera de `own` →
  `invalid_payload`; `design-style-character` sin guion / sin gema →
  `invalid_payload`, sin clave → `missing_api_key` sin gastar.
- Aserción pura de `verbatimCharacterFor` para ausente/own/generic/none
  (7 casos) y de la consigna byte-idéntica a `CONSIGNA_FICHA_NEUTRA`.
- Con claves reales (pendiente conocido del proyecto): video verbatim con
  modelo elegido y `promptModelUsed` en `project.json`; gema `none` sin
  protagonista; «Crear personaje con mi estilo» desde Create.
- Chips del estilo (punto 8; sin runner de tests todavía, a mano en la app
  instalada): gema `own` con fijo en la biblioteca → chip con carita y nombre,
  tocarlo abre el editor de esa gema; fijo borrado → chip rojo y el paso
  `fixedCharacterMissing` en la lista de bloqueos; gema `generic`/`none` →
  chip turquesa con su texto e ícono, `div` sin clic cuando la gema no tiene
  texto; elegir una gema `generic` con un personaje elegido → recibo amarillo
  con su nombre y, al volver a una gema `own` sin fijo o al catálogo, el
  personaje vuelve solo; con catálogo no hay ningún chip; elegir el
  predeterminado en el selector del editor guarda la gema sin esperar «Listo».

## Referencias

- Origen: `costoPrompts.ts`, `SelectorModeloPrompts.tsx`,
  `BloquePersonajeDeEstilo.tsx`, `rutas/estilos.ts` (`/modelos`,
  `/personaje`), `util/estilosPropios.ts`, `verbatim/modelos.ts`
  (`resolverModelo`), `pipelineProyecto.ts` (`personajeParaElMotor`).
- Doctrinas v1.10.0/v1.14.0/v1.16.0 (simulador), v1.19.0–v1.19.2 (personaje
  de la gema), v1.21.0 (consigna como system), E34/E39/E47/E49.
