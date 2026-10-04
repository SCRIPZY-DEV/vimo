# Fix: las escenas de prueba de una clonación salían como collages

- **Fecha:** 2026-10-04
- **Rama:** feat/creador-estilo-ia-sobre-catalogo (la corrección de fondo vive en `vimo-landing`,
  rama `fix/creador-estilo-analizador`, commits `0ece251` y `98e3f47`)

## Causa

En la primera clonación hecha desde la app (video «POV: Eres el COCINERO del Cartel», sin personaje)
las 4 escenas de prueba «Clonación» salieron como collages de varios paneles, al lado de originales
que eran una sola escena. Con el mismo video, Imperio Pro nunca lo hizo.

No era el dibujo ni una imagen de referencia: el sidecar manda el prompt que le llega, tal cual. Era
la **ficha de estilo** que escribió el modelo, que Vimo pega al final de cada prompt de imagen
(`promptEnd`, ADR-0050). Traía la variedad del video entero:

```
Rotates between: solid pale cream/beige for isolated concepts, sterile light gray/blue laboratories,
warm brown offices, fiery orange/red action scenes. […] Mix of plain cream backgrounds and fully
illustrated detailed environments. Composition includes floating diagrams, visual metaphors, split
screens.
```

El generador de imágenes lee esa ficha como la descripción de la imagen que tiene que dibujar, y
dibujó todo junto: la escena pedida en el centro y, alrededor, paneles con un laboratorio, una
oficina, diagramas y pantallas divididas.

El instructivo del servidor pedía esas listas dentro de la ficha (así es en Imperio Pro, donde la
lee un redactor de prompts). Con el tope de 850 caracteres del 2026-10-03 el modelo las comprimió en
frases que un generador dibuja literal.

## Corrección

En el servidor (`vimo-landing`), no en este repo:

- **El instructivo** (`functions/_lib/creador-estilo/maestro.ts`): la ficha describe una sola imagen.
  Solo dice lo que es verdad en todos los fotogramas (técnica, trazo, anatomía, tratamiento del color,
  detalle, sombreado, textura y negaciones). Los mundos de color, el reparto de fondos y los tipos de
  escena se siguen midiendo, pero van en una línea aparte del análisis («VARIEDAD DEL CANAL:») y, en
  el estilo final, en `visualStyle` y `rules`, que son las secciones que lee el redactor de prompts.
  Cada escena de prueba recrea el fotograma de su origen y nada más; si ese fotograma no tiene
  personas, lo dice (esa frase sola no alcanzó: ver `2026-10-04_style-clone-scene-fidelity.md`).
- **Una red** (`variedadEnElEstilo` en `respuesta.ts`): si la ficha igual llega con esas frases, el
  turno se las reclama al modelo una vez y entrega lo que vuelva. Nunca hace fallar un turno.

En este repo no hubo que tocar el sidecar ni el contrato con el servidor. La ADR-0050 y el documento
de diseño dicen ahora qué puede llevar la ficha.

## Límites deliberados

- La red reconoce frases en inglés conocidas (`rotates`, `alternates`, `mix of`, `composition
includes`, `scene types`, `split screen`, `collage`, varios paneles, `mosaic`, `storyboard`). Una
  ficha que cuente la variedad con otras palabras solo la frena el instructivo.
- Si el modelo insiste después del reclamo, se entregan esas pruebas igual: el usuario las ve y puede
  pedir un ajuste. Un reclamo cuesta una llamada más al modelo (unos 10 centavos de dólar).
- Un estilo cuyo original es de verdad una página de viñetas no se resolvía acá: la escena podía
  decir «split screen» en su descripción, la ficha no. Lo resuelve el fix siguiente
  (`2026-10-04_style-clone-scene-fidelity.md`): un fotograma dividido se recrea con su misma
  división.
- No se cambió la calidad de la ficha en lo demás (por ejemplo, cuánto detalla las proporciones del
  cuerpo): eso varía de una corrida a otra y es otro trabajo.

## Validación reproducible

Con el mismo generador (Evolink) y la escena 3 de esa clonación, cambiando solo la ficha:

| Ficha                                                           | Resultado                   |
| --------------------------------------------------------------- | --------------------------- |
| Tal cual llegó                                                  | La escena y paneles sueltos |
| Sin la frase «Composition includes … split screens.»            | Una sola escena             |
| Sin las tres frases (mundos de color, fondos y tipos de escena) | Una sola escena             |

Después, con el instructivo corregido, dos clonaciones reales del mismo video (2026-10-04, por
`ejecutarTurno`, el código del endpoint): sin personaje y con personaje de identidad de prompt. En
las dos, las 4 escenas salieron como una sola imagen, la ficha no trae la variedad, la línea
«VARIEDAD DEL CANAL:» sí, y no hizo falta ningún reclamo.

En `vimo-landing`: `pnpm test` (780 tests). Los del arreglo son
`tests/functions/creadorEstiloVariedad.test.ts` (con la ficha real, copiada de la respuesta guardada
en `creadorEstiloFichasMedidas.ts`) y los casos «la ficha describe una sola imagen» de
`creadorEstiloTurno.test.ts` y `creadorEstiloMaestro.test.ts`.

Las imágenes de la validación son locales y no se suben. Para regenerarlas: clonar el mismo video
desde la app, o correr el servidor en local contra el material del video como explica
`SETUP_CREADOR_ESTILO_IA.md` de `vimo-landing`.

## Pruebas manuales

- Las dos clonaciones reales de arriba, mirando cada escena al lado de su original.
- Pendiente del dueño: repetir la clonación desde la app una vez publicado el servidor.
