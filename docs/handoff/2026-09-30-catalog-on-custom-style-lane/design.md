# Catálogo sobre el carril de Mi estilo: gemas por secciones, agente reconstructor y catálogo administrado

- **Fecha:** 2026-09-30
- **Ramas:** `feat/catalogo-estilos` (VIMO-TAURI) · ramas nuevas en `vimo-landing` por entrega
- **Estado:** diseño acordado con el dueño en conversación (2026-09-29 y 2026-09-30). Pendiente de
  su revisión escrita.
- **Retoma:** [ADR-0039](../../adr/ADR-0039-catalogo-sobre-el-carril-de-mi-estilo.md) (Propuesta),
  que pasa a Aceptada con la Entrega 2.
- **Relacionadas:** ADR-0006, ADR-0018, ADR-0019, ADR-0020, ADR-0021, ADR-0022, ADR-0028, ADR-0033,
  ADR-0036 y ADR-0038.

Este documento es el contrato que comparten todos los planes de implementación. Si un plan necesita
algo que contradice este diseño, se cambia primero este documento, con el dueño.

---

## 1. Qué se quiere lograr

Hoy Vimo tiene dos formas de redactar los prompts de escena (ADR-0039):

- **Catálogo:** biblia visual → reparto de presencia → director de escenas → una llamada al modelo
  por escena. Un video de 200 escenas hace unas 218 llamadas.
- **Mi estilo:** la gema del usuario viaja como `system` y los prompts salen en lotes de 20. El mismo
  video hace unas 10 llamadas.

Además, cada gema de Mi estilo tiene su propia estructura y el personaje se controla solo con
instrucciones: si una gema trae a su personaje escrito dentro del texto del estilo, elegir «sin
personaje» no lo borra.

El objetivo es:

1. **Un solo carril** para todos los estilos: el de Mi estilo.
2. **Una sola estructura** para todas las gemas: secciones fijas que arma un agente en el servidor de
   Vimo. Así el personaje y el dinamismo se aplican por código, igual para todos.
3. **Un catálogo administrado** por los admins desde la app y visible para todos los usuarios.

### Criterios de éxito

1. Los 5 estilos del catálogo, generados por el carril nuevo con los guiones de QA, reciben el visto
   bueno visual del dueño comparados con el catálogo actual.
2. En modo cinemático ninguna escena muestra al personaje del estilo. En modo «Mi personaje» el
   protagonista es siempre el del usuario. En modo genérico es el del estilo o, si el estilo no trae,
   uno diseñado desde el guion.
3. Cambiar el marco de Vimo cambia todos los videos nuevos sin reprocesar ninguna gema.
4. Editar una sección no llama al agente. Solo pasan por él una gema completa nueva y una gema vieja
   sin secciones.
5. Toda reconstrucción intentada queda registrada en Supabase con su resultado, sea éxito o error.
6. Un admin crea, edita, genera muestras, publica y oculta un estilo sin sacar versión de la app.
7. El carril viejo del catálogo se elimina a los 7 días de abrir el catálogo nuevo a todos.

---

## 2. Decisiones

| ID  | Decisión                                                                                                                                                                                                                                             | Origen                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| A1  | El catálogo arranca con 5 estilos: Realista (`normal`), POV Stickman (`pov_stickman`), Cartoon 2D (`cartoon`), Fantasía mágica (`fantasia`) y Terror (`terror`).                                                                                     | Recomendación aceptada          |
| A2  | Tres entregas en orden (sección 3.3) más el retiro del carril viejo.                                                                                                                                                                                 | Recomendación aceptada          |
| B1  | La gema se guarda por secciones fijas (sección 4). El marco de Vimo las envuelve al generar (sección 5).                                                                                                                                             | Dueño                           |
| B2  | El modal muestra una caja por sección. Editar una sección guarda directo, sin agente: la estructura sigue igual y no tiene sentido reescribirla. «Pegar gema nueva» manda el texto completo al agente.                                               | Dueño                           |
| B3  | El agente corre en el servidor de Vimo (`vimo-landing`), con la clave de Vimo.                                                                                                                                                                       | Dueño                           |
| B4  | El marco vive en el código de la app y llega a todos con la actualización.                                                                                                                                                                           | Recomendación aceptada          |
| B5  | Una gema guardada sin secciones se reconstruye sola la primera vez que se abre o se usa. Su texto original queda de respaldo.                                                                                                                        | Recomendación aceptada          |
| B6  | El agente conserva estilo visual, dinamismo y prohibiciones. Saca formato de salida, idioma, fases de conversación e instrucciones sobre el personaje (el personaje va a su sección). No inventa nada.                                               | Recomendación aceptada          |
| C1  | El alumno elige el modo de personaje en «Ver» y queda recordado por estilo. En Crear aparece el chip que abre «Ver».                                                                                                                                 | Recomendación aceptada          |
| C2  | Desaparece «¿Cada cuánto aparece tu personaje?». Manda el dinamismo de la gema.                                                                                                                                                                      | Recomendación aceptada          |
| C3  | Cinemático = sin protagonista recurrente. Pueden aparecer personas anónimas si la escena lo pide.                                                                                                                                                    | Recomendación aceptada          |
| C4  | Cada estilo del catálogo declara qué modos permite. Por defecto, los tres.                                                                                                                                                                           | Recomendación aceptada          |
| C5  | Un solo personaje por video en el catálogo nuevo.                                                                                                                                                                                                    | Dueño                           |
| C6  | El personaje funciona igual que hoy en Mi estilo: con texto se dibuja en el estilo; con foto conserva su aspecto (`APPEARANCE LOCK`).                                                                                                                | Dueño                           |
| D1  | Admin = correo en la tabla `admins` de vimo.click. `verificar-acceso` devuelve `admin`.                                                                                                                                                              | Recomendación aceptada          |
| D2  | Editar un estilo del catálogo guarda un borrador. «Publicar» lo hace visible. Un estilo nuevo arranca oculto.                                                                                                                                        | Recomendación aceptada          |
| D3  | El admin genera las muestras con sus propias claves y elige con qué modo de personaje salen.                                                                                                                                                         | Recomendación aceptada          |
| D4  | Nombre y descripción de cada estilo del catálogo en español, inglés y portugués.                                                                                                                                                                     | Recomendación aceptada          |
| D5  | «Ver» muestra solo las muestras y los interruptores de personaje. El alumno ve el texto del estilo recién después de «Pasar a mi estilo».                                                                                                            | Dueño (cambia la recomendación) |
| D6  | «Publicar en el catálogo» desde Mi estilo queda fuera de esta versión.                                                                                                                                                                               | Diferido                        |
| E1  | «Pasar a mi estilo» crea una copia independiente: secciones, muestras, modo elegido y filtro, con la etiqueta «basado en &lt;estilo&gt;». Si el admin mejora el original, la copia no cambia.                                                        | Recomendación aceptada          |
| F1  | Los proyectos viejos del catálogo siguen con el carril viejo hasta el retiro (7 días después de abrir el catálogo nuevo a todos). Después regeneran con la gema equivalente.                                                                         | Dueño (ajusta la recomendación) |
| F2  | Todo el catálogo corta por segundos por escena, como Mi estilo.                                                                                                                                                                                      | Recomendación aceptada          |
| F3  | El modelo que escribe los prompts es el de Ajustes, para todos los estilos.                                                                                                                                                                          | Recomendación aceptada          |
| F4  | Cada entrega se activa primero solo para admins y se abre a todos tras el visto bueno del dueño.                                                                                                                                                     | Recomendación aceptada          |
| F5  | El filtro de color es un preset del estilo, elegido de una lista: Natural, Fantasía (colores vivos) y Terror (blanco y negro).                                                                                                                       | Recomendación aceptada          |
| F6  | Hay dinamismo solo si el autor lo escribió. El agente lo junta completo y bien redactado en su sección. Cada escena viene etiquetada con su tratamiento para medir el reparto. La verificación por código se agrega solo si la QA muestra monotonía. | Dueño                           |
| G1  | El SQL de Supabase lo prepara Claude y lo aplica el dueño desde el panel. `vimo-landing` se trabaja en ramas nuevas, sin push ni deploy sin aprobación.                                                                                              | Dueño                           |
| G2  | Guiones y presupuesto de QA con claves reales.                                                                                                                                                                                                       | Pendiente (sección 15)          |
| L1  | Cada reconstrucción intentada deja una fila en Supabase, con éxito o con error (sección 6.5).                                                                                                                                                        | Dueño                           |

---

## 3. Arquitectura

### 3.1 Piezas y dónde viven

**App (`src/`)**

- `videos`: el modal por secciones, la pestaña Catálogo nueva, «Ver», «Pasar a mi estilo» y el chip
  del personaje en Crear.
- `auth`: `AccessStatus` suma `admin` y `features` (los interruptores de salida), con memoria sin red
  por correo, igual que `demo`.
- `common`: un cliente único para los endpoints de vimo.click que adjunta la sesión
  (`vimoServerFetch`). Lo usa `videos/api`. Es una enmienda a la ADR-0006, que hoy solo permite
  `fetch` directo y el SDK de Supabase en `auth/api` y `diagnostics/api`.

**Sidecar (`pipeline/`)**

- El marco de Vimo (`pipeline/prompts/template-frame.ts`, nuevo).
- El carril verbatim, con una rama nueva cuando el estilo trae secciones.
- El parser, que reconoce la etiqueta de tratamiento.
- `style-store` y `style-save`, que guardan secciones.
- `generate-style-samples`, que genera las muestras con el marco.
- `project-style.ts`, que aplica el filtro de color del estilo.
- Entrega 2: las gemas del catálogo empaquetadas, `catalog-list` y `catalog-copy-to-custom`.
- Entrega 3: `catalog-sync`, que descarga las muestras a `<carpeta raíz>/_catalog/`.

**Servidor (`vimo-landing/functions/`)**

- `_lib/acceso.ts`: validación de sesión y acceso, extraída de `verificar-acceso` sin cambiar su
  comportamiento.
- `api/estilos/reconstruir.ts`: el agente reconstructor.
- `api/verificar-acceso.ts`: suma `admin` y `features`.
- Entrega 3: `api/catalogo.ts` (lectura) y `api/admin/catalogo/*` (escritura solo admins).

**Supabase**

- `gem_rebuild_logs` (Entrega 1).
- `catalog_styles` y el bucket `catalog-samples` (Entrega 3).
- Todo con RLS activo y sin políticas: solo el service role, desde `vimo-landing`, como
  `demo_accesos`.

### 3.2 Flujo

**Crear o reemplazar una gema**

1. El autor pega su gema en el modal.
2. La app llama a `POST /api/estilos/reconstruir` con la sesión.
3. `vimo-landing` valida la sesión, el acceso y el cupo diario, llama al modelo, valida el JSON y
   registra la llamada en `gem_rebuild_logs`.
4. La app recibe las secciones y el modal las muestra en cajas.
5. Al cerrar el modal, `style-save` escribe `_styles/<id>/style.json` (Mi estilo) o el endpoint admin
   guarda el borrador (catálogo, Entrega 3).

**Generar un video**

1. En Crear, el usuario elige el estilo y el modo de personaje.
2. `create-video-project` guarda en `project.json` una copia de las secciones, el modo y el filtro
   (`options.customStyle`).
3. `run-video-pipeline` corre las seis fases. En `scene-prompts`, el carril verbatim arma el `system`
   con el marco.
4. `render` aplica el filtro de color del estilo.

### 3.3 Entregas

| Entrega | Contenido                                                                                                                                         | Depende de                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 1       | Gema por secciones, marco, agente reconstructor, registro en la DB, `admin` y `features` en el acceso, y la UI de Mi estilo.                      | —                          |
| 2       | Las 5 gemas del catálogo dentro de la app, la pestaña Catálogo nueva, «Ver», modos, «Pasar a mi estilo» y cortes por segundos. ADR-0039 Aceptada. | 1                          |
| 3       | Catálogo en Supabase, endpoints, edición, muestras y publicación por admins, sincronización y caché.                                              | 1 y 2                      |
| Retiro  | Eliminar el carril viejo del catálogo.                                                                                                            | 2 abierta a todos + 7 días |

Cada entrega tiene su propio plan, su QA y sus ADRs. Solo la Entrega 1 tiene plan detallado por
ahora. Los planes de la 2 y la 3 se detallan al cerrar la entrega anterior, porque dependen de lo que
esta deje resuelto.

---

## 4. La gema por secciones (capa 1)

### 4.1 Secciones

| Clave         | Título en la UI            | Obligatoria | Idioma       | Qué contiene                                                                                                                                                                                                        |
| ------------- | -------------------------- | ----------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `visualStyle` | Estilo visual              | Sí          | El del autor | Técnica, paleta, luz, textura y composición característica.                                                                                                                                                         |
| `character`   | Personaje del estilo       | No          | Inglés       | Solo si el estilo trae un protagonista fijo. Identidad física primero y, al final, una oración que empieza con «Outfit:» con la ropa base (el formato que ya exige la Fase 1). Es la única sección que lo describe. |
| `dynamism`    | Dinamismo                  | No          | El del autor | Cuándo sale el protagonista, cuándo una metáfora, un objeto o un lugar, y en qué proporción. Habla de «el protagonista», nunca de su descripción.                                                                   |
| `camera`      | Encuadres y cámara         | No          | El del autor | Planos, ángulos y reglas de variedad.                                                                                                                                                                               |
| `rules`       | Reglas y prohibiciones     | No          | El del autor | Lo que el estilo nunca hace.                                                                                                                                                                                        |
| `promptStart` | Inicio fijo de cada imagen | No          | Inglés       | Frase que Vimo antepone por código a cada prompt de imagen.                                                                                                                                                         |
| `promptEnd`   | Final fijo de cada imagen  | No          | Inglés       | Frase que Vimo agrega por código al final de cada prompt de imagen.                                                                                                                                                 |

Las tres secciones en inglés se pegan tal cual en el prompt de imagen, por eso no pueden depender de
que el modelo las traduzca. Las demás las lee el modelo, que ya traduce al inglés gracias a
`OUTPUT_LANGUAGE_RULE` (ADR-0019).

**Límites:** cada sección hasta 12 000 caracteres y la suma hasta 30 000, el tope de hoy
(`SYSTEM_PROMPT_CHAR_LIMIT`). `character` hasta 700, el tope de la identidad tejida
(`MAX_WOVEN_IDENTITY_CHARS`). `promptStart` y `promptEnd` hasta 600 cada una.

### 4.2 Datos

En `pipeline/types/styles.ts`:

```ts
export interface GemSections {
  visualStyle: string
  character?: string
  dynamism?: string
  camera?: string
  rules?: string
  promptStart?: string
  promptEnd?: string
}

export const GEM_TEMPLATE_VERSION = 1

export type ColorFilterId = 'none' | 'fantasy' | 'horror-bw'
```

`style.json` (y `CustomStyleSummary`) suma estos campos:

| Campo             | Qué es                                                                              |
| ----------------- | ----------------------------------------------------------------------------------- |
| `sections`        | Las secciones. Si existe, la gema es de plantilla.                                  |
| `templateVersion` | Versión de la plantilla con la que se armaron las secciones.                        |
| `sourcePrompt`    | El texto original que se mandó al agente. Solo respaldo: no se usa para generar.    |
| `colorFilter`     | Preset de color. Ausente = `none`.                                                  |
| `origin`          | Solo en copias de «Pasar a mi estilo»: `{ kind: 'catalog', catalogStyleId, name }`. |
| `updatedAt`       | Fecha de la última edición.                                                         |

`systemPrompt` pasa a ser opcional: solo lo tienen las gemas viejas. Una gema tiene `sections` o
`systemPrompt`, nunca los dos. Al reconstruir una gema vieja, su `systemPrompt` pasa a `sourcePrompt`.
`shots` se conserva para las gemas viejas. En las de plantilla lo reemplaza la sección `camera`.

`ProjectCustomStyle` (la copia que guarda el proyecto) suma `sections`, `templateVersion`,
`colorFilter` y `catalogStyleId`, y su `systemPrompt` pasa a ser opcional. `create-video-project`
exige exactamente uno de `sections` o `systemPrompt`.

### 4.3 Reglas de edición

- Editar una sección guarda directo con `style-save`. No llama al agente.
- «Pegar gema nueva» manda el texto completo al agente y reemplaza todas las secciones y el
  `sourcePrompt`. Si hay cambios sin guardar, pide confirmación.
- Un estilo nuevo pasa por el agente antes de su primer guardado: el modal de «Crear estilo» arranca
  con la caja para pegar la gema.
- Sin `visualStyle` no se guarda.
- Si `character`, `promptStart` o `promptEnd` no parecen estar en inglés, el modal avisa, pero no
  bloquea.

### 4.4 Gemas viejas (sin secciones)

- La primera vez que una gema vieja se abre en el modal o se elige en Crear, la app la manda al agente
  con `origin: 'migracion'` y muestra «Actualizando tu estilo a la plantilla de Vimo…».
- Si sale bien, guarda las secciones y el respaldo.
- Si falla, avisa con un botón para reintentar. Mientras tanto la gema sigue funcionando por el camino
  viejo, sin bloquear al usuario.

---

## 5. El marco de Vimo (capa 2)

### 5.1 Cómo se arma el `system`

`buildTemplateSystem(sections, mode, options)` en `pipeline/prompts/template-frame.ts` compone, en
este orden:

```
# VISUAL STYLE
<visualStyle>

# CAMERA AND FRAMING            (si hay camera)
<camera>

# DYNAMISM                      (si hay dynamism)
<dynamism>
<TREATMENT_TAG_RULE>

# STYLE RULES                   (si hay rules)
<rules>

<CONTENT_SAFETY_RULE>
<OUTPUT_FORMAT_RULE>
<FIXED_PHRASES_RULE>            (si hay promptStart o promptEnd)

+ las reglas que el carril ya suma hoy, en el mismo orden:
  SCENE_ID_RULE, architectureRuleFor(mode), OUTPUT_LANGUAGE_RULE,
  USER_PROTAGONIST_RULE (text | reference), SCENE_WITHOUT_PROTAGONIST_RULE (editor),
  SCENE_WARDROBE_RULE (mode ≠ none)
```

- La sección `character` nunca entra al `system` (sección 5.2).
- `OUTPUT_FORMAT_RULE` fija lo que hoy fija cada gema: un único bloque de código con un prompt por
  fragmento, separados por una línea en blanco, cada uno con su id `((n))`. El parser actual ya lo lee.
- `CONTENT_SAFETY_RULE` trae al carril la seguridad de contenido que hoy solo tiene el catálogo
  (`GLOBAL_RULES` y el bloque de Terror): sin gore, sin violencia explícita, sin nombres reales ni
  personajes con copyright.
- `FIXED_PHRASES_RULE` le dice al modelo que Vimo agrega el inicio y el final fijos, así que no debe
  escribirlos.

### 5.2 Modos de personaje

| Modo en la UI      | `character.mode` | Qué hace el marco                                                                                                                                                                                                                                                                          |
| ------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Personaje genérico | `generic`        | Con sección `character`: ese texto es el protagonista. Va como turno del retrato y se teje por código en cada escena que lo nombra. No hay llamada de Fase 1 y se guarda como `styleProtagonist` con `source: 'style-section'`. Sin sección: la Fase 1 lo diseña desde el guion, como hoy. |
| Mi personaje       | `own`            | `character` no viaja. Personaje del proyecto: con texto se teje y se dibuja en el estilo; con foto va como referencia con `APPEARANCE LOCK`, como hoy en Mi estilo.                                                                                                                        |
| Cinemático         | `none`           | `character` no viaja. Arquitectura sin `[subject]`. Si el dinamismo menciona al protagonista, el marco indica mostrar esa escena sin protagonista recurrente: entorno, objetos o personas anónimas.                                                                                        |

En el catálogo, la UI solo ofrece los modos que el estilo permite (`allowedModes`).

### 5.3 Dinamismo y etiquetas de tratamiento

- Con `dynamism`, `TREATMENT_TAG_RULE` pide que cada prompt empiece con `((n)) [T:<tratamiento>]`. El
  tratamiento es uno de `action`, `metaphor`, `object`, `place`, `group`, `memory`, `diagram` o
  `bubble` (el `SceneTreatment` que ya existe).
- El parser quita la etiqueta y guarda el valor en `scene.treatment`, un campo nuevo y opcional. Si la
  etiqueta falta o no es válida, el prompt igual vale: no se reintenta.
- Al cerrar la fase, un evento `log` informa el reparto: cuántas escenas de cada tratamiento y el
  porcentaje con protagonista.
- No hay verificación por código (F6). Se agrega solo si la QA muestra monotonía.
- Sin `dynamism` no se pide etiqueta: el estilo es estático.

### 5.4 Inicio y final fijos

- Con `promptStart` o `promptEnd`, después de tejer `[subject]`, el código arma
  `promptStart + ' ' + escena + ' ' + promptEnd`.
- Con `promptEnd`, `restoreStyleTail` no corre: el final ya es determinístico.
- `sanitizeFinalPrompt` protege las dos frases: si el prompt no entra en `MAX_PROMPT_CHARS`, cede
  primero el núcleo de la escena, después `promptEnd` y la identidad al final. `promptStart` no se
  corta.

> **Nota de implementación (2026-10-01).** El rescate de una escena que pierde su foto de referencia
> también sigue este orden (el plan del sidecar decía otro en su P5). Ver la ADR-0048.

### 5.5 Filtro de color

`pipeline/prompts/color-filters.ts` define los presets con los filtros que hoy viven en
`VISUAL_STYLES`:

| Preset      | UI                       | Filtro de FFmpeg                                                 |
| ----------- | ------------------------ | ---------------------------------------------------------------- |
| `none`      | Natural                  | `''`                                                             |
| `fantasy`   | Fantasía (colores vivos) | `eq=saturation=1.25:brightness=0.03:gamma=1.05`                  |
| `horror-bw` | Terror (blanco y negro)  | `format=gray,curves=master='0/0 0.4/0.3 1/0.95',eq=contrast=1.1` |

`resolveProjectStyle` toma `filterFinal` de `customStyle.colorFilter`. El modal de Mi estilo también
ofrece la lista.

### 5.6 Muestras

Para una gema de plantilla, `generate-style-samples` usa el mismo marco y el mismo modo de personaje
que el video: un lote verbatim con los 4 momentos fijos de hoy, escrito con el modelo de Ajustes (el
payload suma `promptModel`) y con el inicio y el final fijos agregados por código. Las gemas viejas
siguen por el camino actual.

> **Nota de implementación (2026-10-01).** Con foto, solo las muestras cuyo momento nombra al
> protagonista llevan la referencia, como en el video. Ver la ADR-0048.

### 5.6 bis «La gema como texto»

Hay usos que no generan escenas pero hoy reciben la gema como un texto entero: el diseño de un
personaje con el estilo (`design-style-character`), el retrato de un personaje de la biblioteca
(`generate-character-preview`) y el prompt de respaldo de imágenes. Para una gema de plantilla,
`composeGemText(sections)` arma ese texto con las secciones y sus títulos, sin las reglas de la
plataforma y **sin la sección `character`**, para que el personaje fijo del estilo no se cuele en otro
personaje. El retrato y el respaldo también llevan el inicio y el final fijos, porque son prompts de
imagen. `DesignStyleCharacterPayload` acepta `gem` o `sections`, nunca los dos, porque la app no puede
componer ese texto.

> **Nota de implementación (2026-10-01).** El diseño de un personaje y la Fase 1 reciben
> `composeGemText(sections, { fixedPhrases: false })`, sin el inicio ni el final fijos; el retrato y el
> respaldo los llevan y quitan antes la copia exacta que haya escrito el modelo. Ver la ADR-0048.

### 5.7 Lo que no cambia

- Un `customStyle` sin `sections` sigue por `buildVerbatimSystem(gema)` byte por byte: proyectos
  viejos, gemas todavía no reconstruidas y usuarios sin el interruptor encendido.
- Lotes de 20, escalera [20, 5, 1], ronda de rescate, parser, tejido de `[subject]`, vestuario por
  escena, regla de idioma, E34, vigilancia del modelo (ADR-0028) y `styleProtagonist` en
  `project.json`.

---

## 6. Agente reconstructor (servidor)

### 6.1 Endpoint

`POST https://vimo.click/api/estilos/reconstruir`, con `Authorization: Bearer <access_token>`.

Pedido:

```json
{
  "text": "<gema completa, 1 a 30000 caracteres>",
  "origin": "mi-estilo",
  "appVersion": "0.9.0",
  "locale": "es"
}
```

`origin` es `mi-estilo`, `catalogo` o `migracion`. `locale` es el idioma de la app (`es`, `en` o
`pt`): el agente escribe los `warnings` en ese idioma.

Respuesta 200:

```json
{
  "templateVersion": 1,
  "sections": {
    "visualStyle": "…",
    "character": "…",
    "dynamism": "…",
    "camera": "…",
    "rules": "…",
    "promptStart": "…",
    "promptEnd": "…"
  },
  "suggestions": {
    "allowedModes": ["generic", "own", "none"],
    "characterMode": "generic"
  },
  "warnings": [
    "La gema pedía escribir en español: se quitó, Vimo escribe siempre en inglés."
  ]
}
```

Errores, con `{ "code": "…" }` en el cuerpo:

| HTTP | `code`                | Cuándo                                                                                           |
| ---- | --------------------- | ------------------------------------------------------------------------------------------------ |
| 401  | `sin-token`           | Falta la sesión.                                                                                 |
| 401  | `token-invalido`      | Supabase rechaza el JWT.                                                                         |
| 403  | `sin-acceso`          | El usuario no pasa las reglas de `verificar-acceso`.                                             |
| 403  | `funcion-desactivada` | `features.gemTemplate` está apagado para ese usuario, o pide `origin: "catalogo"` sin ser admin. |
| 400  | `pedido-invalido`     | JSON roto, o `origin`, `locale` o `appVersion` inválidos.                                        |
| 400  | `texto-invalido`      | Texto vacío o de más de 30 000 caracteres.                                                       |
| 422  | `sin-estilo-visual`   | El texto no dice cómo se ven las imágenes (un guion, una lista de temas). No gasta cupo.         |
| 429  | `cupo-agotado`        | Superó el cupo diario (sección 6.4). Trae `retryAfterSeconds`.                                   |
| 500  | `error-interno`       | Falla interna del servidor: Supabase caído, configuración faltante o una excepción inesperada.   |
| 502  | `modelo-fallo`        | El modelo falló, cortó la respuesta por largo o devolvió algo inválido después del reintento.    |
| 504  | `modelo-timeout`      | El modelo no respondió a tiempo.                                                                 |

El servidor no confía en la app: aunque la UI solo llame con el interruptor encendido, el endpoint lo
vuelve a comprobar.

La app traduce cada `code` con su clave de i18n. Los endpoints nuevos usan claves en inglés;
`verificar-acceso` conserva las suyas.

### 6.2 Reglas del agente

Las instrucciones del agente viven versionadas en `vimo-landing/functions/_lib/reconstructor/`:

1. Conservar todo lo que la gema dice del estilo visual, sin perder nada, redactado de forma clara y
   profesional.
2. Llevar toda descripción de un protagonista fijo a `character`, en inglés y con hasta 700
   caracteres: primero la identidad física y al final una oración que empieza con «Outfit:» con todo
   lo que lleva puesto o en la mano. Si no hay protagonista fijo, no incluir la sección.
3. Incluir `dynamism` solo si la gema define cuándo mostrar qué. Juntarlo ahí completo, hablando de «el
   protagonista» y nunca de su descripción. No inventar.
4. Incluir `camera` y `rules` solo si la gema los trae.
5. Incluir `promptStart` y `promptEnd` solo si la gema define frases fijas para abrir o cerrar cada
   prompt. Escribirlas en inglés.
6. Descartar el formato de salida, las instrucciones de idioma, las fases de conversación y las
   instrucciones para el usuario. Los ejemplos de salida se absorben en `visualStyle` si describen el
   estilo.
7. Escribir las secciones descriptivas en el idioma de la gema.
8. Devolver solo JSON con el esquema de la sección 6.1.
9. Listar en `warnings` lo que se descartó o era ambiguo.
10. Si el texto no dice nada de cómo se ven las imágenes (un guion, una lista de temas, solo
    instrucciones de formato), no inventar un estilo: responder `{ "noVisualStyle": true, "reason" }`.
    Basta una oración sobre las imágenes para que cuente como gema. El servidor responde 422
    `sin-estilo-visual` y la app explica qué tiene que tener una gema (pedido del dueño, 2026-10-01).

El servidor valida la respuesta con zod (límites de la sección 4.1 y `visualStyle` obligatorio). Si no
pasa, reintenta una vez con el error de validación. Si vuelve a fallar, responde `modelo-fallo`.

### 6.3 Modelo y proveedor

- Cliente de Chat Completions compatible con OpenAI, configurado por variables de entorno:
  `RECONSTRUCTOR_API_URL`, `RECONSTRUCTOR_API_KEY` y `RECONSTRUCTOR_MODEL`. Sirve para CometAPI y
  para DeepInfra, que el ecosistema ya usa.
- El modelo se elige con una comparación sobre 10 gemas (las 5 del catálogo y 5 gemas reales de Mi
  estilo) entre 2 o 3 candidatos de primera línea. El dueño juzga: estilo conservado, personaje bien
  separado y dinamismo completo.
- El cuerpo base es `{ model, messages, response_format }`. Los parámetros que cambian según el modelo
  (temperatura, tope de tokens, nivel de razonamiento) van en `RECONSTRUCTOR_EXTRA_BODY`, un JSON
  opcional que se mezcla al final. La comparación de modelos deja escrita la configuración de cada
  uno. Por ejemplo, la familia `gpt-5*` por CometAPI no acepta otra temperatura.
- Timeout de 120 s y un reintento ante 429 o 5xx. Una respuesta cortada por largo
  (`finish_reason: "length"`) es `modelo-fallo` y no se reintenta igual.

### 6.4 Cupo diario

Hasta 30 reconstrucciones exitosas por usuario por día, contadas en `gem_rebuild_logs`. Los admins no
tienen cupo.

### 6.5 Registro en la DB

Cada reconstrucción intentada deja una fila, sea éxito, error o rechazo por cupo. Cuenta como intentada
toda llamada que pasó la autenticación y la validación del cuerpo, incluida la que se rechaza con
`funcion-desactivada`. Los 401 y 400 no tienen usuario o cuerpo válido para registrar, así que quedan
solo en el log de la función.

```sql
create table public.gem_rebuild_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null,
  user_email text not null,
  origin text not null check (origin in ('mi-estilo', 'catalogo', 'migracion')),
  status text not null check (status in ('ok', 'error', 'quota')),
  error_code text,
  error_detail text,
  provider text,
  model text,
  template_version int,
  input_chars int not null,
  output_chars int,
  duration_ms int,
  tokens_in int,
  tokens_out int,
  input_text text,
  output_json jsonb,
  warnings jsonb,
  app_version text
);

alter table public.gem_rebuild_logs enable row level security;
-- Sin políticas: solo el service role, desde vimo-landing.

create index gem_rebuild_logs_user_created_idx
  on public.gem_rebuild_logs (user_id, created_at desc);

-- Retención de 30 días con pg_cron, igual que diagnostic_logs (ADR-0038).
```

- Se guardan el texto de entrada y el JSON de salida para poder diagnosticar. Es una excepción
  deliberada a la ADR-0038, que no sube el texto de las gemas; la retención de 30 días la acota.
- Si falla la escritura del registro, el usuario igual recibe su respuesta y el error queda en el log
  de la función.

### 6.6 Autenticación compartida

- `functions/_lib/acceso.ts` extrae de `verificar-acceso.ts` la validación del JWT y las reglas de
  acceso (admins, `allowlist_beta`, `usuarios_acceso` y revocaciones).
- `verificar-acceso` la usa sin cambiar su respuesta ni sus efectos. Antes de extraer se escriben tests
  de caracterización con vitest.
- `reconstruir` la usa para el 403 `sin-acceso`.

---

## 7. Entrega 1: Mi estilo con plantilla

**Servidor**

- `_lib/acceso.ts`, `api/estilos/reconstruir.ts`, el registro en `gem_rebuild_logs` y el cupo.
- `verificar-acceso` suma `admin: true` para admins y `features: { gemTemplate, newCatalog }`.
  - Cada interruptor sale de una variable de entorno (`VIMO_FLAG_GEM_TEMPLATE` y
    `VIMO_FLAG_NEW_CATALOG`) con valor `off`, `admins` o `all`.
  - Arrancan en `admins`.

**App (`auth` y `common`)**

- `VerifyAccessResponse` y `AccessStatus` suman `admin` y `features`.
- Se recuerdan sin red por correo, como `demo`.
- `vimoServerFetch` en `common`, con la sesión de Supabase.

**Sidecar**

- Tipos de la sección 4.2 y validación en `style-save` y `create-video-project`.
- Marco (sección 5), ramas del carril verbatim, parser con etiqueta, inicio y final fijos, filtro de
  color y muestras con el marco.
- Guards puros de todo lo anterior.

**UI de Mi estilo** (solo con `features.gemTemplate`; sin él, todo queda como hoy)

- «Crear estilo» abre el modal en «Pega tu gema»: una caja grande y el botón «Preparar con IA». Al
  terminar, muestra las cajas por sección y los avisos del agente.
- Una gema de plantilla abre con sus cajas.
  - `visualStyle` va abierta. Las secciones opcionales vacías aparecen como «Agregar sección».
  - La acción secundaria «Pegar gema nueva» reemplaza todo, con confirmación.
- Una gema vieja se actualiza como dice la sección 4.4.
- El bloque «¿Tu estilo lleva personaje?» no cambia. La caja «Personaje del estilo» explica que se usa
  en el modo genérico.
- Selector de filtro de color. «Planos permitidos» desaparece en las gemas de plantilla.
- Todos los textos nuevos en `es`, `en` y `pt`.

---

## 8. Entrega 2: catálogo nuevo para el alumno

**Las 5 gemas**

- Se escriben como gemas de plantilla (secciones, `allowedModes`, `colorFilter` y modo de las
  muestras). Viven en `pipeline/prompts/catalog-gems/`, un archivo por estilo.
- Hasta la Entrega 3 usan sus muestras actuales (`public/style-references/<id>_1..4.jpg`).
- Se arman pasando por el agente el texto actual de cada estilo junto con las reglas del director y del
  reparto de presencia, y después se ajustan a mano.
- El dinamismo de cada una traduce el contrato del director:
  - El menú de tratamientos del estilo. Realista no usa `diagram` ni `bubble`.
  - Al menos 1 de cada 3 escenas explicativa o alusiva, intercaladas.
  - Nunca 3 tratamientos ni 3 lugares iguales seguidos.
  - El protagonista en alrededor del 50 % de las escenas.
- Terror lleva su seguridad de contenido en `rules` y `colorFilter: horror-bw`. Fantasía lleva
  `colorFilter: fantasy`.
- Stickman lleva al muñeco en `character`, sus reglas de muñeco en `rules` y los tres modos
  permitidos. La QA confirma qué modos funcionan y el admin los ajusta.
- Cada estilo × modo pasa la QA de la sección 12.

**Sidecar**

- `catalog-list` devuelve las gemas del catálogo con sus muestras.
- `catalog-copy-to-custom` crea la copia de «Pasar a mi estilo».
- Los ids del catálogo son los 5 heredados. Los ids nuevos siguen `STYLE_ID_PATTERN`.
- `generate-character-preview` acepta ids del catálogo nuevo con el marco. Los previews ya generados
  siguen valiendo como referencia (regla E20).

**UI** (solo con `features.newCatalog`)

- La pestaña Catálogo muestra tarjetas como las de Mi estilo, con el menú «Usar en este video»,
  «Ver» y «Pasar a mi estilo».
- «Ver» muestra el carrusel de muestras y los interruptores de modo: Personaje genérico, Mi personaje
  (con selector de un personaje) y Cinemático, solo los permitidos. No muestra texto.
  - La elección se guarda en `localStorage` (`vimo:catalog:character:v1`, por estilo).
  - Si el admin deja de permitir el modo elegido, se usa el primero permitido.
  - El modo por defecto es genérico.
- En Crear, con un estilo del catálogo:
  - El chip del personaje abre «Ver».
  - Desaparecen la frecuencia, la cantidad de escenas y la casilla «Confirmar escenas».
  - Aparecen los segundos por escena y el modelo de prompts, como en Mi estilo.
  - Hay un personaje como máximo.
- Payload:
  - `options.customStyle` lleva el id del estilo como `styleId` y `catalogStyleId`, más `name`,
    `sections`, `templateVersion`, `character`, `colorFilter`.
  - `options.styleId` es el id del estilo si es uno de los 5 heredados; si no, `normal`.
- «Pasar a mi estilo» crea `_styles/st-…` con las secciones, las muestras, el modo elegido, el filtro
  y el `origin`. La app avisa «Copiado a Mi estilo» y la copia aparece en esa pestaña.

**Proyectos viejos**

- Un proyecto sin `customStyle` sigue por el carril viejo, intacto, hasta el retiro.

---

## 9. Entrega 3: catálogo remoto administrado

**Supabase**

```sql
create table public.catalog_styles (
  -- Los ids nuevos siguen STYLE_ID_PATTERN (sin guion bajo); los 5 heredados conservan el suyo.
  id text primary key check (
    id ~ '^[a-z0-9][a-z0-9-]{0,39}$'
    or id in ('normal', 'pov_stickman', 'cartoon', 'fantasia', 'terror')
  ),
  position int not null default 0,
  status text not null default 'hidden' check (status in ('hidden', 'published')),
  draft jsonb not null,
  published jsonb,
  published_version int not null default 0,
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.catalog_styles enable row level security;
-- Sin políticas: solo el service role, desde vimo-landing.
```

`draft` y `published` tienen la misma forma: `{ name: {es, en, pt}, description: {es, en, pt},
sections, templateVersion, allowedModes, sampleMode, colorFilter, samples }`.

**Operaciones sobre un estilo**

- **Publicar:** copia `draft` a `published`, sube `published_version` y deja `status = 'published'`.
- **Ocultar:** deja `status = 'hidden'`. Los proyectos no se ven afectados, porque guardan su copia.
- **Eliminar:** borra la fila y sus muestras.

**Bucket `catalog-samples`**

- Lectura pública.
- Las muestras publicadas van en `<id>/v<version>/sample-<n>.jpg`. Son inmutables, así la caché es
  segura.
- Los borradores van en `<id>/draft/sample-<n>.jpg`.

**Endpoints** (Pages Functions de `vimo-landing`)

| Método y ruta                           | Quién                    | Qué hace                                                            |
| --------------------------------------- | ------------------------ | ------------------------------------------------------------------- |
| `GET /api/catalogo`                     | Usuario con acceso       | Estilos publicados, con URLs de muestras y la versión del catálogo. |
| `GET /api/admin/catalogo`               | Admin (`verificarAdmin`) | Todos los estilos, con borrador y estado.                           |
| `POST /api/admin/catalogo`              | Admin                    | Crea un estilo oculto con su borrador.                              |
| `PATCH /api/admin/catalogo/:id`         | Admin                    | Actualiza el borrador o la posición.                                |
| `POST /api/admin/catalogo/:id/muestras` | Admin                    | Devuelve URLs firmadas para subir las 4 muestras del borrador.      |
| `POST /api/admin/catalogo/:id/publicar` | Admin                    | Publica el borrador.                                                |
| `POST /api/admin/catalogo/:id/ocultar`  | Admin                    | Oculta el estilo.                                                   |
| `DELETE /api/admin/catalogo/:id`        | Admin                    | Elimina el estilo y sus muestras.                                   |

**Sincronización en la app**

- La app pide `GET /api/catalogo` con la sesión.
- Si la versión cambió, le pasa el manifiesto al sidecar (`catalog-sync`). El sidecar descarga las
  muestras a `<carpeta raíz>/_catalog/<id>/v<version>/` y escribe `_catalog/catalog.json` de forma
  atómica. `_catalog` se suma a `RESERVED_ROOT_DIRECTORIES`.
- `catalog-list` devuelve el catálogo sincronizado. Si nunca se sincronizó, devuelve las 5 gemas
  empaquetadas.
- Sin red, sirve el último catálogo sincronizado.

**UI de admin** (con `admin` y conexión)

- En la pestaña Catálogo, el admin ve también los estilos ocultos y en borrador, con su distintivo.
- La tarjeta «Crear estilo» abre el mismo modal por secciones. Suma nombre y descripción en tres
  idiomas, modos permitidos, modo de las muestras y filtro.
- El menú del admin ofrece Editar, Generar muestras, Publicar, Ocultar y Eliminar.
  - «Generar muestras» las crea el sidecar con las claves del admin y después se suben al borrador.
  - La posición se edita con un número.

**Semilla**

- Un SQL inserta las 5 gemas como publicadas, con sus muestras subidas, para que los admins puedan
  editarlas.

---

## 10. Interruptores y salida

- `features.gemTemplate` enciende la Entrega 1. `features.newCatalog` enciende las Entregas 2 y 3.
  Los valores salen de variables de entorno de `vimo-landing` (`off`, `admins` o `all`), así que abrir
  o volver atrás no requiere sacar versión de la app.
- Los dos arrancan en `admins`. Pasan a `all` con el visto bueno visual del dueño.
- Sin red, la app usa los últimos valores conocidos para ese correo.
- **Retiro del carril viejo:** 7 días después de poner `newCatalog` en `all`, un PR elimina la biblia
  visual, el reparto de presencia, el director, el redactor por escena, `identity-lock`,
  `catalog-llm`, los `systemPrompt` de `VISUAL_STYLES` y sus guards. En el mismo PR, un proyecto viejo
  pasa a resolver su `options.styleId` con la gema del catálogo equivalente. Sus prompts e imágenes no
  se tocan; solo sus regeneraciones usan el carril nuevo.

---

## 11. Errores

| Caso                                             | Qué pasa                                                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| El agente falla, tarda o no hay red              | El modal muestra el error traducido y un botón para reintentar. El texto pegado no se pierde. No se guarda nada a medias. |
| Cupo agotado                                     | Mensaje con la hora en que vuelve a haber cupo.                                                                           |
| El agente devuelve algo inválido                 | El servidor reintenta una vez. Si sigue mal, responde `modelo-fallo` y queda el registro con el detalle.                  |
| El servidor tiene el interruptor apagado         | Responde `funcion-desactivada`. El modal avisa que la función no está disponible para la cuenta y no reintenta.           |
| Gema vieja que no se pudo reconstruir            | Sigue funcionando por el camino viejo, con aviso y reintento (sección 4.4).                                               |
| La sincronización del catálogo falla (Entrega 3) | Se usa la caché; si no hay, las 5 gemas empaquetadas. Se intenta de nuevo en la próxima apertura de Crear.                |
| Falla una escritura del admin (Entrega 3)        | El modal queda abierto con el error. Publicar es atómico: no hay publicaciones a medias.                                  |
| Generación con una gema de plantilla             | Mismo manejo que el carril verbatim de hoy: `llm_prompt_language`, vigilancia del modelo, E34 y lotes persistidos.        |

---

## 12. Pruebas y QA

**Guards puros** (`scripts/test/`, `node --test`)

- Composición del marco por modo, comparada byte a byte.
- Camino viejo idéntico a hoy cuando no hay secciones.
- Etiqueta de tratamiento.
- Inicio y final fijos con el sanitizado.
- Presets de color.
- Validación de secciones y conservación de campos en `style-save`.
- Validación de la copia en `create-video-project`.
- Entrega 2: `catalog-list` y la copia a Mi estilo.
- Entrega 3: `catalog-sync` contra un servidor HTTP local, como `check-demo`.

**`vimo-landing`** (vitest, con Supabase y el modelo simulados)

- Caracterización de `evaluarAcceso`.
- `reconstruir`: sesión, acceso, cupo, validación, reintento y registro.
- Entrega 3: endpoints del admin.

**En cada commit**

- `pnpm format`, `pnpm lint`, `pnpm build` y `pnpm check:locales` en VIMO-TAURI.
- `pnpm test`, `pnpm lint` y `pnpm build` en `vimo-landing`.

**Con claves reales**

- Entrega 1: comparación de modelos del agente (sección 6.3) y prueba del flujo completo con gemas
  reales.
- Entrega 2: guiones de QA × 5 estilos × 3 modos, contra el catálogo actual. También se mide el costo
  y el tiempo de la fase de prompts (criterios de la ADR-0039). El dueño aprueba.

---

## 13. Documentación que viaja con el código

- **ADR-0048** (gemas por secciones, marco y agente reconstructor): Entrega 1.
- **Enmienda a la ADR-0006** (cliente de vimo.click en `common`): Entrega 1.
- **Nota en la ADR-0038** sobre `gem_rebuild_logs` y su excepción de texto: Entrega 1.
- **ADR-0039** pasa a Aceptada, con lo resuelto: Entrega 2.
- **ADR-0049** (catálogo remoto administrado): Entrega 3.
- **`docs/ARCHITECTURE.md`**: la frontera del sistema (piezas en el servidor) y las secciones 4, 5 y 6,
  en cada entrega.
- **`vimo-landing`**: las variables de entorno nuevas en su README o setup.
- **Vault** (reglas globales):
  - `Recursos/APIs y Servicios Externos.md` (proveedor del agente)
  - `Variables de Entorno.md` (`RECONSTRUCTOR_API_URL`, `RECONSTRUCTOR_API_KEY`,
    `RECONSTRUCTOR_MODEL`, `RECONSTRUCTOR_EXTRA_BODY`, `VIMO_FLAG_*`)
  - `Costos Operativos Mensuales.md` (costo del agente)
  - `Supabase Schema Completo.md` (tablas nuevas)
  - Nota de ADR en `Proyectos/VIMO-TAURI/`

---

## 14. Fuera de alcance

- «Publicar en el catálogo» desde Mi estilo (D6).
- Verificación del dinamismo por código (F6), salvo que la QA la pida.
- Dos personajes en el carril verbatim.
- Un panel web en `vimo-landing` para ver `gem_rebuild_logs` o editar el catálogo. Por ahora los
  registros se consultan en Supabase y el catálogo se edita desde la app.
- Traducción automática de nombres y descripciones del catálogo.
- Historial de versiones publicadas más allá de «Ocultar».

---

## 15. Preguntas abiertas

1. **Proveedor del agente:** ¿CometAPI o DeepInfra con una clave de Vimo, o Anthropic directo con
   cuenta nueva? El cliente sirve para los dos primeros sin cambios. La elección de modelo sale de la
   comparación de la sección 6.3.
2. **QA con claves reales (G2):** qué guiones se usan y cuál es el presupuesto máximo.
3. **Cupo diario:** ¿30 reconstrucciones por usuario alcanzan?
