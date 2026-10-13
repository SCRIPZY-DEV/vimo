# QA del dueño — entrega 2g

Lista de la app de prueba `0.9.3-editor.14`. Los puntos **HR** generan un video, un clip o un escenario con
HeyGen y gastan saldo: mirá el saldo antes y después. Lo demás es gratis. Siguen vigentes las listas de la
2d, la 2e y la 2f (`execution-e2d/qa-2d.md`, `execution-e2e/qa-2e.md`, `execution-e2f/qa-2f.md`), salvo el
punto 4 de la 2f (el aviso de V sin gemelo digital): con V ya no hay interruptor de «Movimiento más
expresivo», así que no hay nada que avisar.

Los videos hechos antes de la 2g conservan sus cortes. Para ver cómo corta ahora, creá un video nuevo.

## Crear (gratis hasta generar)

1. **«Movimiento más expresivo» solo con Avatar IV.** Prendé el avatar presentador y elegí «Jardineria». Con
   Avatar V y con Avatar III no aparece el interruptor, ni apagado ni con un aviso. Con Avatar IV y un look de
   foto aparece. Con IV y un look de gemelo digital o de estudio aparece apagado y dice por qué.
2. **La línea del movimiento.** Con Avatar V y un avatar del stock (Dante o Hayes), debajo del motor dice que
   Vimo escribe el movimiento de cada aparición. Con V y «Jardineria», que no tiene gemelo digital, esa línea
   no está.
3. **«3 veces en 2 minutos» dice 32 s.** Prendé la casilla y poné 60 s por aparición: el aviso dice que las
   tres primeras duran hasta 32 s (antes decía 35).

## La biblioteca de avatares

4. **«Escenario principal».** En el detalle de un avatar la etiqueta dice «Escenario principal»; al elegir
   otro sale «Escenario principal actualizado.»; en el reproductor de un look dice «Es el escenario principal
   de este avatar.» En ninguna pantalla debería quedar «look principal». La pastilla «N looks» sí sigue.
5. **El precio de «Crear escenario» (HR).** Con «Jardineria», la ficha «Crear escenario» muestra 1,00 US$
   debajo del título, y el diálogo lo muestra como «1,00 US$ por escenario · se descuenta de tu saldo de
   avatares» (la 2g decía 0,93; el 2026-10-13 el dueño confirmó que cuesta 1 US$). Mirá tu saldo, creá un
   escenario de prueba y mirá el saldo otra vez: tiene que bajar 1 US$. Si
   baja otra cifra, decime cuál: es una constante. En un avatar del stock la ficha está apagada y no muestra
   precio.
6. **El velo de «Eliminar» (no confirmes nada).** En una tarjeta de la biblioteca abrí «Eliminar» y elegí
   «Eliminar permanentemente de HeyGen» (pide «Seguro»). El velo oscuro tiene que cubrir la imagen entera,
   de borde a borde, sin corte a la derecha ni abajo, con las opciones en el centro y la advertencia justo
   arriba de ellas; «Seguro» queda en el mismo lugar que «Eliminar permanentemente…». Miralo con la ventana
   grande y con la mínima, y tocá «Cancelar».

## El video (HR)

7. **La aparición dura lo que elegís.** Creá un video nuevo con Avatar III (el más barato), 3 apariciones de
   5 s y «Empieza con el avatar». Cada aparición tiene que durar entre 4,5 y 5,5 s (antes salían de 6 a 13 s),
   terminar en una pausa y no partir ninguna palabra. Repetilo con 10 s: entre 9,5 y 10,5 s. Si tenés la
   narración de «Video-3-avatar» (subí su audio en Crear), la apertura de 5 s termina en 4,7 s, justo en
   «…durante una hora.»
8. **«3 veces en 2 minutos».** Con una narración de más de 3 minutos, la casilla y «Empieza con el avatar»,
   el avatar abre el video y sale dos veces más antes del minuto 2; las tres primeras duran hasta 32 s.
9. **El costo.** La tarjeta de Crear estima el costo con los segundos elegidos. Compará esa cifra con lo que
   bajó el saldo de HeyGen: ahora tienen que estar mucho más cerca que antes. Si hay un silencio largo en la
   narración, una aparición puede quedar más corta que lo elegido y costar menos que lo estimado.

## El editor, en el panel de la escena

10. **«Duración».** Abrí el video de arriba en el editor y elegí una escena de avatar. Hay un selector con «−»,
    el valor (por ejemplo «10 s») y «+», y debajo «Ahora dura 10,2 s.» con la duración real. El «?» explica que
    termina en la pausa más cercana, sin cortar una palabra. Tocá «+» hasta el tope: dice «Acá puede durar de
    5 a N s.» y el botón se apaga.
11. **Recortar (gratis).** Bajá la duración 3 s con «−»: el botón pasa a «Recortar a N s» y debajo dice
    «Gratis: se recorta el clip que ya tenés.» Tocalo. No pide confirmación ni mira el saldo, y avisa «El
    avatar ahora dura N,N s.» La escena queda más corta, la imagen que sigue empieza antes y el video queda
    desactualizado (exportalo de nuevo para verlo). Mirá el saldo: no cambia. El clip tiene que terminar en una
    pausa, sin cortar una palabra.
12. **Alargar (HR).** Subí la duración 4 s con «+»: debajo dice «Toma más narración, hasta 1:23, y se genera
    de nuevo.» y el botón dice «Generar avatar» o «Regenerar avatar», con el costo de la duración nueva. Al
    tocarlo, la confirmación dice «¿Generar el avatar?», «Duración nueva: 14 s (ahora dura 10,2 s).» y, si
    el avatar pasa por encima de imágenes, «Tapa 1 escena de imagen.» (o «Tapa N escenas de imagen.»), con el
    costo y el saldo. Confirmá. Mientras se genera sigue el clip anterior; si falla, no cambia nada. Al
    terminar, la escena dura lo nuevo, la imagen tapada ya no está en la lista y la que sigue empieza donde
    termina el avatar. El saldo tiene que bajar más o menos lo que dijo la confirmación.
13. **Los números de escena saltan.** Después de alargar, la galería y el visor dicen «Escena 2», «Escena 4»…
    sin la 3. Es lo esperado: las escenas tapadas salen del video y las demás conservan su número. Sus
    imágenes quedan guardadas en la carpeta del proyecto.
14. **Lo que no se puede cambiar.** Si la escena que sigue al avatar tiene una animación, la duración no se mueve y
    dice «La duración no se puede cambiar: la escena que sigue está animada.» Si el avatar es la última escena
    del video, dice «Es el final del video: su duración no puede cambiar.»
15. **«Movimiento», más compacto.** Con V: sin la caja grande ni el párrafo del motor (el nombre del motor,
    subrayado con puntos, explica qué hace al pasar el mouse), el prompt en tres renglones con su contador,
    «Usar el automático» como enlace, sin «Movimiento más expresivo» y «Qué podés pedir» como un botón que
    abre un globo (Escape lo cierra). Con IV y un look de foto, el interruptor va en una línea.
16. **Una narración con una pausa al principio (crear y alargar son HR).** En Crear subí un audio que diga una
    palabra corta («Hola.»), calle unos 3 s y siga hablando, con «Empieza con el avatar» y 10 s. La apertura
    carga ese silencio y dura cerca de 10 s. En el editor recortala a 8 s (gratis): tiene que quedar cerca de
    8 s, nunca por debajo de 4,5. Después subila a 12 y generala: tiene que entrar y durar cerca de 12 s. Hasta
    esta versión, el recorte la dejaba en menos de 3 s y ninguna duración la recuperaba.

## La vista ampliada de imágenes

17. **La tarjeta del avatar, plegada.** Abrí «Vista ampliada de imágenes». Las apariciones del avatar se ven
    como las de imagen (mismo borde, sin el morado que las hacía parecer elegidas), con su clip, su estado,
    «Reproducir», número, tramo y texto, y sin acciones salvo «Ajustar avatar».
18. **Desplegarla.** Tocá «Ajustar avatar» o la tarjeta: ocupa la fila entera, con el clip a la izquierda y, a
    la derecha, «Cerrar», «Duración», «Movimiento» y las acciones en dos columnas. No tiene que haber scroll
    propio, ni con la ventana mínima (1024 × 640) ni con la grande. Abrí otra tarjeta: la primera se pliega.
    «Cerrar» la pliega. Con el teclado, el foco va al «−» de la duración al desplegar y vuelve a «Ajustar
    avatar» al plegar. Si un clip se está reproduciendo, plegar y desplegar no lo corta.
19. **Recortar y alargar desde ahí (alargar es HR).** Es lo mismo que los puntos 11 y 12, dentro de la tarjeta.
    Al terminar un render el foco vuelve a la tarjeta.

## Para después

- **Subtítulos de una aparición que termina a mitad de frase.** Los subtítulos de una escena de avatar siguen
  yendo por frases enteras: si la aparición termina a mitad de frase, pueden repetir o saltear palabras en el
  borde con la escena vecina. Lo pediste así («luego lo cuadraremos»); anotá lo que veas.

## Lo que no se pudo probar sin la app o sin saldo

- Todo se probó con HeyGen simulado, en Chrome sin pantalla y en un `WKWebView` real (el motor de la app), sin
  gastar saldo. En la app real faltan: cuánto cobra HeyGen por el trozo nuevo de una aparición alargada y que
  el clip nuevo siga la narración con la misma voz; el recorte con un clip real de HeyGen; y el precio de
  «Crear escenario», que sale de una medición tuya (10,60 a 9,67 US$) y no de una tarifa publicada.
- Las apariciones con tu narración real. En las tuyas de «Jardineria» la diferencia con lo elegido es de 0,1 s
  de mediana y nunca más de 0,5 s; en narraciones simuladas, las tres primeras de «3 veces en 2 minutos» con
  tope de 32 s arrancan dentro de los 2 minutos en el 99,7 % de los casos o más.
- La tarjeta desplegada con las fuentes reales: se midió con la fuente de reserva y el peor caso (la escena que
  toma más narración, con el texto más largo, a 1024 × 640) mide 410 px en un área de 410. Con las fuentes de la
  app puede variar unos píxeles; lo peor que pasa es que la galería scrollee un poco, nunca la tarjeta.
- El velo de «Eliminar» en la app empaquetada: se midió en un `WKWebView` con el CSS real, a 450, 228 y 164 px
  de tarjeta.
- El foco con el teclado y el globo de «Qué podés pedir» sobre WebKit, en la app empaquetada.
