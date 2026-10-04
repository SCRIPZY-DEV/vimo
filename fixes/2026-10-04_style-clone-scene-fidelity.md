# Fix: las escenas de prueba de una clonación no eran fieles a su original

- **Fecha:** 2026-10-04
- **Rama:** feat/creador-estilo-ia-sobre-catalogo (la corrección vive en `vimo-landing`: commits
  `084223b` y `94a88ce`, PR #15, publicada en `main` @ `50e3d33` el 2026-10-04)

## Causa

Pedido del dueño después del arreglo de los collages
(`2026-10-04_style-clone-collage-scenes.md`): la clonación tiene que ser fiel a su original. Si el
fotograma no tiene personas, la clonación tampoco; si el fotograma es una sola escena, una sola
escena; y si el fotograma ya es un collage o una pantalla dividida en el video, la clonación
también.

Tres cosas lo impedían, las tres en el servidor:

1. **La ficha de estilo sumaba personas.** En las clonaciones de la mañana, una cinta de monedas y
   el diagrama de una jeringa (dos fotogramas sin personas) salieron con monigotes, y el cerebro
   del diagrama con brazos y piernas. La ficha, que Vimo pega al final de cada prompt (`promptEnd`,
   ADR-0050), describía el cuerpo de las personas como un hecho de la imagen («Anatomy: oversized
   round heads, … thin stick-figure legs … Every single person and creature is drawn with this
   exact same anatomy») y el generador lo dibujaba. Es el mismo mecanismo de los collages. La frase
   «No people in the scene.» que se había sumado a la escena no alcanzaba.
2. **La regla de las escenas esquivaba los fotogramas divididos.** «UNA ESCENA, UNA IMAGEN» pedía
   elegir solo fotogramas de una sola escena, y la orden de composición del estilo final decía
   «never a collage». Un video que usa pantallas divididas nunca las mostraba en sus pruebas.
3. **Un prompt escrito en varios párrafos se partía.** Cuando el modelo separa con líneas en
   blanco la escena, el «Style: …» y la oración del texto, el servidor tomaba cada párrafo como un
   prompt: entregaba como «4 escenas» una escena sin estilo, el estilo solo, la oración sola y la
   escena siguiente. Lo destapó una corrida real de esta validación; el defecto ya estaba
   publicado.

## Corrección

En el servidor (`vimo-landing`), no en este repo:

- **La anatomía de la ficha va en condicional** (`maestro.ts`, punto 3 de la ficha): el bloque
  empieza con «People, only when the scene names them, have this anatomy:» y termina con «any
  person the scene names is drawn with this exact same anatomy and style; never add people or
  characters the scene does not name; no realistic humans anywhere». Una red (`anatomiaSinCondicion`
  en `respuesta.ts`) reconoce una ficha que describe cuerpos sin esa condición: el turno la reclama
  una vez, en el mismo mensaje que la variedad del canal si las dos están, y al aprobar se corrige
  como un error de validación. Nunca hace fallar un turno.
- **Fidelidad al fotograma** (`maestro.ts`, REGLA 7): cada prueba recrea su fotograma con la misma
  composición y la misma cantidad de personas. Una sola escena sale como una sola imagen; un
  fotograma dividido se recrea con esa misma división, escrita dentro de la escena y nunca en la
  ficha, y ya no se esquiva al elegir. Si el usuario pide otro tipo de escena, el modelo busca un
  fotograma que ya sea así en vez de retocar el que tenía. En el estilo final, `rules` divide el
  cuadro solo para el tipo de contenido en que el canal lo hace.
- **Un bloque, un prompt** (`leerPruebas` en `respuesta.ts`): un bloque de código es un solo prompt
  aunque llegue en varios párrafos, y se entrega en un solo párrafo. Solo se separa si más de un
  párrafo trae su propio «Style:».

En este repo no hubo que tocar el sidecar, la app ni el contrato con el servidor. La ADR-0050 y el
documento de diseño dicen ahora qué puede llevar la ficha y cómo se recrea cada fotograma.

## Límites deliberados

- **Las proporciones del cuerpo siguen variando.** En el original los personajes tienen piernas
  cortas; en algunas clonaciones salen más largas. Depende de cuánto detalla la ficha esas
  proporciones en cada corrida y de cómo las lee el generador. Es otro trabajo, con sus propias
  mediciones.
- **Lo que no se alcanza a ver en un mosaico no se recrea.** Cada celda mide 320 × 180: el modelo
  puede contar mal las personas chicas de un panel o cambiar un color.
- La red de la anatomía reconoce palabras en inglés (`anatomy`, `heads`, `limbs`, `legs`, `arms`,
  `torso`, `hands`, `fingers`, `skin`, `stick-figure`). Una ficha que describa cuerpos con otras
  palabras solo la frena el instructivo.
- Una sesión empezada antes de publicar esto trae la ficha sin la condición: se le reclama en su
  próximo turno o al aprobar (una llamada más al modelo, unos 10 centavos de dólar).
- No se arregla pegando una frase por código al final de la ficha: se midió y no sirve (6 de 6
  dibujos con una persona de más). Lo que funciona es el encabezado del bloque, y lo escribe el
  modelo.

## Validación reproducible

Con el mismo generador (Evolink, calidad baja) y las dos escenas sin personas de la clonación de la
mañana, cambiando una sola cosa por vez:

| Qué cambia                                                            | Dibujos con una persona de más |
| --------------------------------------------------------------------- | ------------------------------ |
| Nada: la ficha como llegó                                             | 2 de 2                         |
| «No people in the scene.» al final de la escena                       | 2 de 4                         |
| «Never add people or characters…» sumado al final de la ficha         | 6 de 6                         |
| Solo el cierre del bloque de anatomía                                 | 3 de 6                         |
| Solo el encabezado condicional                                        | 0 de 6                         |
| Encabezado y cierre, sin ninguna frase en la escena                   | 0 de 6                         |
| Encabezado, cierre y «No people in the scene.»                        | 0 de 6                         |
| Encabezado, cierre y dos frases más fuertes en la escena              | 0 de 6                         |
| Solo las dos frases más fuertes en la escena, con la ficha como llegó | 0 de 6                         |

Las escenas con personas se siguieron dibujando igual con la anatomía en condicional (4 de 4).

Después, con el instructivo corregido, clonaciones reales del mismo video (por `ejecutarTurno`, el
código del endpoint), mirando cada escena al lado de su original:

- **Qué se corrió:** cuatro clonaciones (tres sin personaje, cada una con un turno de ajuste que
  pedía «una pantalla dividida, dos sin personas y una con varias personas», y una con personaje de
  identidad de prompt). 28 escenas en total.
- **La ficha** salió con el encabezado condicional en el primer intento en las cuatro, sin ningún
  reclamo.
- **Sin personas:** los diagramas de la jeringa, del cerebro y de las neuronas y la cinta de monedas
  (los que a la mañana habían salido con monigotes) salieron sin ninguna persona de más: 7 de 7.
- **Pantallas divididas:** el modelo eligió por su cuenta fotogramas divididos del video, y los 6
  salieron divididos igual que su original (una línea vertical, mitad y mitad). Uno, con el
  personaje en una de las mitades.
- **Una sola escena:** ninguna salió como collage.
- **Cantidad de personas:** los grupos de 5 salieron con 5. Dos fallos de lectura en celdas chicas:
  un grupo de 4 salió con 3, y un panel con 3 figuras chicas salió con 1 o 2.
- **Pedidos del usuario:** en dos corridas, para cumplir «un objeto sin personas», el modelo tomó
  la pila de billetes y sacó al hombre que está al lado. Con el recordatorio en el mensaje del
  ajuste eligió fotogramas que ya eran así (la cinta de monedas); medido en una corrida.
- Una quinta corrida trajo los prompts en varios párrafos y destapó el tercer defecto de arriba.
- **Costo de toda la validación,** a precio de lista: 1,46 USD de Gemini y 0,32 USD de imágenes.

En `vimo-landing`: `pnpm test` (810 tests). Los del arreglo son
`tests/functions/creadorEstiloAnatomia.test.ts` y los casos nuevos de `creadorEstiloTurno`,
`creadorEstiloMaestro`, `creadorEstiloMensajes` y `creadorEstiloRespuesta`, con los prompts y la
respuesta reales copiados en `creadorEstiloFichasMedidas.ts`.

Las imágenes de la validación son locales y no se suben. Para regenerarlas: clonar el mismo video
desde la app, o correr el servidor en local contra el material del video como explica
`SETUP_CREADOR_ESTILO_IA.md` de `vimo-landing`.

## Pruebas manuales

- Las clonaciones reales de arriba, mirando cada escena al lado de su original.
- Servidor publicado el 2026-10-04 a las 11:54 (despliegue `002db2ea`): el endpoint sin sesión
  responde 401, como antes.
- Pendiente del dueño: repetir la clonación desde la app.
