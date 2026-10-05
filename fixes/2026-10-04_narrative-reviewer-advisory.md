# Fix: el revisor narrativo vuelve como asesor, con juez de respaldo, y nunca frena un video

- **Fecha:** 2026-10-04
- **Rama:** fix/remove-narrative-reviewer (desde `origin/dev` @ `7cf81422`, la versión 0.9.1)

## Causa

Desde la tarde del 2026-10-04, en Vimo 0.9.1 ningún video llegaba a imágenes: la corrida se
detenía en «Validando prompts», en el Catálogo y en Mi estilo. Reintentar, cambiar de modelo,
cancelar o cerrar la app no lo destrababa.

La revisión narrativa de la ADR-0043 le pasaba cada prompt a un segundo modelo, fijo y que el
usuario no elige: `deepseek-ai/DeepSeek-V4-Pro` en DeepInfra. Ese modelo empezó a devolver una copia
de su entrada (`{"candidates": [...]}`) en vez de su veredicto (`{"scenes": [...]}`): llegaba al tope
de 3 000 tokens con el JSON cortado, el intento de reparación hacía lo mismo y el lote terminaba en
`scene_prompt_alignment_failed`. Reproducido con un proyecto real del dueño, por la etapa real de
prompts y con su clave: el modelo copió la entrada en 11 llamadas de 11 (lotes de 6, de 2 y de 1
escena, con modo JSON y sin él, y un pedido mínimo de 100 caracteres).

Tres defectos de diseño hacían que una falla del juez tumbara todo:

- un solo modelo, fijo, que el usuario no elige, a temperatura 0: el reintento devolvía lo mismo;
- fallo cerrado: sin veredicto, la fase se detenía (en el Catálogo, con más de cinco escenas así la
  corrida terminaba en `catalog_prompts_incomplete`);
- un juez exigente podía dejar una escena sin prompt (tres rechazos en el Catálogo), y cada rechazo
  se contaba como falla del redactor (`narrative alignment rejected` en `verbatim-writer.ts`): la app
  mostraba «DeepSeek V4.1 Flash está devolviendo errores» y lo bloqueaba una hora aunque respondía
  bien.

Ese mismo día se probó retirar la revisión: tres proyectos del dueño rehechos sin ella (50 escenas,
con DeepSeek V4.1 Flash y Claude Haiku 4.5) no mostraron imágenes de otro momento del relato. El
dueño pidió entonces ver si la revisión ayudaba, cambiarle el modelo y que, si ese modelo falla, use
otro que funcione. Esta corrección es esa versión.

## Corrección

- **`pipeline/stages/scene-prompts/narrative-alignment.ts`:** vuelve la revisión de `dev` (misma
  instrucción, evidencias numeradas, cuatro comprobaciones, lotes de seis) con estos cambios:
  - **Jueces en orden:** DeepSeek V4.1 Flash y, de respaldo, DeepSeek V3.2. Una respuesta sin el
    contrato (como la copia de la entrada) o un fallo del proveedor, incluidos saldo y clave, pasa
    al siguiente juez. Cada juez tiene un minuto por lote.
  - **Corte por video:** un juez que falla dos veces en un video no se vuelve a llamar en ese video.
    El estado vive por la señal del job: la fase de imágenes arma otro cliente y hereda los jueces
    caídos.
  - **Nunca frena:** si ningún juez responde, el lote sigue sin revisión y el log lo dice («the
    remaining prompts go on without narrative review»). Solo la cancelación corta.
  - **Una objeción por escena y por video:** la escena objetada no se vuelve a mandar al juez; su
    reescritura pasa.
- **`pipeline/stages/scene-prompts/prompt-writer.ts` (Catálogo):** una objeción en el último intento
  deja el prompt igual, en el camino normal y en la reescritura por política de contenido. Antes
  dejaba la escena sin prompt.
- **`pipeline/stages/scene-prompts/verbatim/verbatim-writer.ts` (Mi estilo):** la objeción del juez
  (`narrative alignment rejected`) ya no cuenta para «el modelo está devolviendo errores».
- **`pipeline/stages/images/images.ts`:** el rescate sin foto ya no pide revisión. Ahí no hay
  redactor que pueda corregir: el juez solo podía frenar la compra.
- **Docs:** ADR-0043 («Revisión asesora con respaldo», que reemplaza el contrato de Fallo de la
  decisión original), índices de ADR e índice de guards.

## Límites deliberados

- **El juez es probabilístico.** En la comparación atrapó 2 de 3 errores conocidos sin rechazar
  escenas buenas. Ningún juez de texto ve lo que inventa el generador de imágenes: con GPT-OSS 120B,
  «ciudades e inventos» salió con aviones y cohetes, y el prompt era correcto.
- **Cuesta tiempo y dinero del usuario:** con 10 escenas, los prompts tardaron 24 a 35 s contra 14 s
  sin revisión. El juez cuesta unos 0,08 USD por video de 200 escenas con la clave de DeepInfra del
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
- **Toda la suite** (`node --test scripts/test/check-*.mjs`): 254 de 259. Los 5 que fallan fallan
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

La escena 3 sale con fútbol en todas: tiene la descripción manual del dueño «el muñeco jugando
fútbol», y el juez la aprueba como pedido del usuario.

Costo: 6,7 créditos de Evolink (20 imágenes) y menos de 5 centavos de DeepInfra. Los scripts y las
hojas quedaron fuera del repo.

Pendiente del dueño: crear un video desde la app con esta versión, en el Catálogo y en Mi estilo.
