# Fix: el revisor narrativo vuelve como asesor, con juez de respaldo, y nunca frena un video

- **Fecha:** 2026-10-04
- **Rama:** fix/remove-narrative-reviewer (desde `origin/dev` @ `7cf81422`, la versión 0.9.1)

## Causa

Esa tarde el juez fijo del revisor narrativo (DeepSeek V4 Pro en DeepInfra) empezó a devolver una
copia de su entrada en vez de su veredicto. Como la revisión de la ADR-0043 frenaba la fase cuando no
podía verificar, ningún video de 0.9.1 pasaba de «Validando prompts» (informe
`fixes/2026-10-04_retire-narrative-reviewer.md`). Primero se retiró la revisión. Después el dueño
pidió ver si la revisión ayudaba en algo, cambiarle el modelo y que, si ese modelo falla, use otro
que funcione.

Tres defectos de diseño hacían que una falla del juez tumbara todo:

- un solo modelo, fijo, que el usuario no elige;
- fallo cerrado: sin veredicto, la fase se detenía;
- un juez exigente podía dejar una escena sin prompt (tres rechazos en el Catálogo), y cada rechazo
  se contaba como falla del redactor: la app bloqueaba una hora a un modelo que respondía bien.

## Corrección

- **`pipeline/stages/scene-prompts/narrative-alignment.ts`:** vuelve la revisión de `dev` (misma
  instrucción, evidencias numeradas, cuatro comprobaciones, lotes de seis) con estos cambios:
  - **Jueces en orden:** DeepSeek V4.1 Flash y, de respaldo, DeepSeek V3.2. Una respuesta sin el
    contrato (como la copia de la entrada) o un fallo del proveedor, incluidos saldo y clave, pasa
    al siguiente juez. Cada juez tiene un minuto y medio por lote.
  - **Corte por video:** un juez que falla dos veces seguidas en un video no se vuelve a llamar en ese video;
    una respuesta buena borra sus fallas (fallas sueltas no lo apagan).
    El estado vive por la señal del job: la fase de imágenes arma otro cliente y hereda los jueces
    caídos.
  - **Nunca frena:** si ningún juez responde, el lote sigue sin revisión y el log lo dice («the
    remaining prompts go on without narrative review»). Solo la cancelación corta.
  - **Lotes parejos de hasta seis, hasta 12 a la vez:** 20 escenas van como 5+5+5+5 (V4.1 Flash devolvía
    sin formato 4 de 12 lotes de dos escenas y ninguno de 38 de seis); un video largo del Catálogo
    manda varios lotes al mismo tiempo.
  - **Una objeción por escena y por video:** la escena objetada no se vuelve a mandar al juez; su
    reescritura pasa. Si la reescritura no sale, la escena se queda con el prompt objetado (el original)
    y recibe su imagen, en el Catálogo y en Mi estilo.
- **`pipeline/stages/scene-prompts/prompt-writer.ts` (Catálogo):** escribe todas las escenas, las
  revisa juntas en lotes paralelos y reescribe una vez, en paralelo, las objetadas; si la reescritura
  no sale, queda el prompt original. Antes revisaba escena por escena ocupando el turno del redactor
  y una objeción podía dejar la escena sin prompt. En la reescritura por política de contenido (pocas
  escenas) la revisión sigue en el momento, con el mismo respaldo. `scene-prompts.ts` cuenta una vez
  en la barra la escena reescrita.
- **`pipeline/stages/scene-prompts/verbatim/verbatim-writer.ts` (Mi estilo):** la objeción del juez
  (`narrative alignment rejected`) ya no cuenta para «el modelo está devolviendo errores».
- **`pipeline/stages/images/images.ts`:** el rescate sin foto ya no pide revisión. Ahí no hay
  redactor que pueda corregir: el juez solo podía frenar la compra.
- **Docs:** ADR-0043 («Revisión asesora con respaldo», que reemplaza la retirada y el contrato de
  Fallo), nota en la ADR-0044, índices de ADR, índice de guards y aviso en el informe del retiro.

## Límites deliberados

- **El juez es probabilístico.** En la comparación atrapó 2 de 3 errores conocidos sin rechazar
  escenas buenas. Ningún juez de texto ve lo que inventa el generador de imágenes: con GPT-OSS 120B,
  «ciudades e inventos» salió con aviones y cohetes, y el prompt era correcto.
- **Cuesta tiempo y dinero del usuario:** con 10 escenas, los prompts tardaron 24 a 35 s contra 14 s
  sin revisión; con 126 escenas, Mi estilo 53 s contra 36 s y el Catálogo 298 s contra 267 s. El juez cuesta unos 0,08 USD por video de 200 escenas con la clave de DeepInfra del
  usuario (con V4 Pro eran unos 0,50). El simulador de costos de la app no lo suma.
- **No cambia qué pasa con una escena que el redactor no logra escribir.** En Mi estilo sigue
  cortando la corrida (desde el PR #91); la rama `fix/reviewer` de jdgonzalez03 propone apartarla.
- **Proyectos viejos:** la corrección que el Catálogo siembra desde un `promptFailure` con
  `source: 'reviewer'` queda igual.

## Validación reproducible

Guards (sin red), vistos fallar antes del cambio:

```
node --test scripts/test/check-narrative-review.mjs scripts/test/check-catalog-prompts.mjs \
  scripts/test/check-verbatim-prompt-persistence.mjs scripts/test/check-style-character-video.mjs \
  scripts/test/check-editor-character-selection.mjs scripts/test/check-silent-scene-images.mjs
```

- **`check-narrative-review.mjs` (nuevo, 10 casos):** pregunta a V4.1 Flash; la copia de la
  entrada y un 500 pasan a V3.2; sin jueces, los prompts pasan con aviso; saldo o clave del juez no
  frenan; un juez que falló dos veces no se vuelve a llamar, ni desde otro cliente del mismo video, y
  sí en otro video; una objeción por escena; la cancelación sí corta.
- **Catálogo:** una escena que el revisor rechaza siempre se reescribe una vez con la objeción y
  conserva el prompt; una primera objeción en el último intento no deja la escena vacía; con los
  jueces devolviendo su entrada, todas las escenas reciben prompt e imagen.
- **Mi estilo:** una escena objetada se reescribe una vez; la objeción no culpa al redactor aunque
  otra escena caiga por la red; con los jueces caídos se escriben todos los prompts.
- **Rescate sin foto:** compra las imágenes sin llamar a ningún modelo.
- **Simuladores:** `check-editor-character-selection.mjs` y `check-silent-scene-images.mjs` le
  contestan al juez con `narrative-review-fixture.mjs`. Con el revisor de `dev` fallan 21 casos de
  esos dos guards.
- **Toda la suite** (`node --test scripts/test/check-*.mjs`): 258 de 263. Los 5 que fallan fallan
  igual en `origin/dev`: `check-api-key-ui`, `check-editor-character-ui`, `check-export-header-ui`,
  `check-packaged-editor` y el caso de la escena muda que hace 9 llamadas al redactor.
- `pnpm format`, `pnpm lint` y `pnpm build` pasan.

## Pruebas manuales

Con las etapas reales de prompts e imágenes, las claves del dueño y su proyecto «ESTILO COMIC» (Mi
estilo, las primeras 10 escenas, DeepSeek V4.1 Flash, Evolink en calidad baja y 16:9):

| Corrida         | Juez                                 | Resultado                                                                                                                     |
| --------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Con revisión, 1 | 2 llamadas a V4.1 Flash, contrato ok | Objetó la escena 9 (el personaje en un archivo y a la vez en una plaza); la reescritura quedó en la plaza. 10 de 10 imágenes. |
| Con revisión, 2 | 2 llamadas a V4.1 Flash, contrato ok | Sin objeciones. 10 de 10 imágenes.                                                                                            |
| Solo prompts    | 2 llamadas a V4.1 Flash, contrato ok | Sin objeciones.                                                                                                               |

Velocidad con 126 escenas (las 14 de ese video repetidas 9 veces; solo prompts, sin imágenes; juez
real). «Antes» es la versión anterior de esta rama: el Catálogo revisaba escena por escena y Mi
estilo partía cada lote de 20 en 6+6+6+2:

| Carril    | Sin revisión | Antes                | Revisión en lotes (esta versión)             |
| --------- | ------------ | -------------------- | -------------------------------------------- |
| Mi estilo | 36 s         | 56 a 61 s            | 53 s (25 llamadas al juez, ninguna fallida)  |
| Catálogo  | 267 s        | 487 s (129 llamadas) | 298 s (21 llamadas en 21 s y 3 reescrituras) |

La escena 3 sale con fútbol en todas: tiene la descripción manual del dueño «el muñeco jugando
fútbol», y el juez la aprueba como pedido del usuario.

Costo: 6,7 créditos de Evolink (20 imágenes) y menos de 5 centavos de DeepInfra. Los scripts y las
hojas quedaron fuera del repo.

Pendiente del dueño: crear un video desde la app con esta versión, en el Catálogo y en Mi estilo.
