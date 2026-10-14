# QA del dueño — entrega 2h

Lista de la app de prueba de la 2h, `0.10.1-editor.16` (en `Vimo-builds`). Los puntos **HR** generan un video o un
clip con HeyGen y gastan saldo de avatares: mirá el saldo antes y después; cada uno dice más o menos cuánto
cuesta. Lo demás no toca ese saldo (las voces y las imágenes cuestan lo de siempre). Siguen vigentes las listas
de la 2d a la 2g (`execution-e2d/qa-2d.md`, `execution-e2e/qa-2e.md`, `execution-e2f/qa-2f.md`,
`execution-e2g/qa-2g.md`).

Para los puntos HR usá Avatar III, el más barato: con 5 s por aparición sale entre 0,05 y 0,10 US$ cada una
(Crear muestra el costo exacto antes de generar). Todos los HR juntos gastan unos 1,5 US$, más el escenario de
1 US$ del punto 10. Los videos hechos antes de la 2h no cambian: para ver las dos fases a la vez, creá uno nuevo.

## Crear (gratis hasta generar)

1. **Cuándo se cobra.** Prendé el avatar presentador. Al final de la tarjeta del costo, debajo del costo estimado,
   el total y la tarifa, dice «El avatar se genera al mismo tiempo que las imágenes y se cobra apenas empieza.»
   Una sola vez. Con el avatar apagado (o sin la clave de HeyGen) la tarjeta no está y la línea tampoco.

## El video (HR)

2. **Las imágenes y el avatar, a la vez (HR, unos 0,25 US$).** Creá un video con avatar presentador: Avatar III,
   3 apariciones de 5 s y un guion de 2 a 3 minutos. Cuando termina «Generando prompts con IA», en la lista de
   fases giran las dos filas juntas: «Generando imágenes» y «Generando el avatar». A la derecha, la grilla de
   imágenes trae las tarjetas del avatar (borde y fondo morados): cada una dice «Generando» con su porcentaje
   (0 % y sube) apenas arranca su aparición, y «En espera» solo mientras todavía no arrancó. Cuando las imágenes
   terminan y el avatar sigue, la derecha pasa al panel del avatar («Avatar 1/3», con la fase y el tiempo de
   cada render). Pueden terminar en cualquier orden: si el avatar termina primero, su panel aparece cuando
   terminan las imágenes. Al final, el video sale con las imágenes y las tres apariciones. Dejá este video: se
   usa en el punto 7.
3. **Diez apariciones a la vez (HR, entre 0,5 y 0,85 US$).** Con una narración de 4 minutos o más (para que
   entren las diez), creá un video con 10 apariciones de 5 s y Avatar III. Las diez tarjetas del avatar pasan a
   «Generando» casi juntas, no de a tres, y en HeyGen se ven los diez renders corriendo a la vez. Cronometrá
   cuánto tarda el avatar en terminar y compará con un video anterior con varias apariciones: antes eran cuatro
   tandas de a tres, de medio minuto a cuatro minutos cada una; ahora tiene que acercarse al render más lento.
   La app tiene que seguir fluida mientras corren las imágenes y el avatar (el ffmpeg local va de a pocos: como
   mucho 4 a la vez y nunca más que la mitad de los núcleos). Si no entraron las diez, la pantalla lo dice («N
   apariciones no entraron en la narración»): usá una narración más larga.

## Cancelar con apariciones ya cobradas

Una aparición está cobrada desde que HeyGen aceptó su render. En el panel del avatar es cuando dice «El servicio
de avatares está generando el avatar»; antes («Preparando la voz», «Subiendo la voz al servicio de avatares»)
todavía no se cobró nada. Mientras corren las imágenes ese texto no se ve (las tarjetas del avatar solo muestran
«Generando» y su porcentaje): contá unos 20 a 30 segundos desde que arranca «Generando el avatar», que es lo que
tardan el audio en subir y HeyGen en aceptar los pedidos.

4. **El aviso al cancelar (HR, unos 0,25 US$).** Creá un video con avatar de 3 apariciones de 5 s. Pasados unos 20
   a 30 segundos desde que arranca «Generando el avatar» (o más tarde, con el panel del avatar ya a la vista),
   tocá «Cancelar». En vez del «¿Seguro? Cancelar» sale «¿Cancelar la generación?» con «Ya se mandaron a generar
   N apariciones del avatar: se cobran de tu saldo de avatares aunque canceles. No se pierden: quedan guardadas y
   se usan cuando sigas con este video, sin pagar de nuevo.», con el foco en «Seguir generando».
   - Escape o «Seguir generando» no cancelan, y el foco vuelve al botón «Cancelar» (con Tab o Enter seguís desde
     ahí). Mantener Enter apretado sobre «Seguir generando» no reabre el aviso ni cancela nada.
   - Con el aviso abierto, mientras las apariciones van terminando de a una, el número no baja y el aviso no se va
     solo: se va cuando elegís o cuando termina la generación. Si se cobran más con el aviso abierto, el número
     sube.
   - «Cancelar igual» corta la generación una sola vez, aunque lo toques dos veces. Mirá el saldo: bajó por lo ya
     aceptado.
   - Para comprobar que no se cobra dos veces, reanudá ese proyecto desde la Biblioteca: el saldo de avatares no
     tiene que bajar otra vez por esas apariciones.
   - Con VoiceOver se leen el título y la descripción al abrir el aviso. En la app instalada un clic no enfoca un
     botón (WebKit): comprobá que el foco no se pierde al cerrar.
5. **Sin nada cobrado, como siempre.** Creá un video con avatar y tocá «Cancelar» enseguida, mientras dice
   «Sintetizando voz» o «Dividiendo en escenas»: pide el segundo clic de «¿Seguro? Cancelar» y no sale el aviso.
   El saldo de avatares no cambia.
6. **«Crear otro» (HR, unos 0,08 US$).** Creá un video con 1 aparición de 5 s. Pasados unos 20 a 30 segundos desde
   que arranca «Generando el avatar», tocá «Crear otro»: sale el mismo aviso, con «Ya se mandó a generar 1
   aparición del avatar…» (en singular). «Seguir generando» deja todo como estaba y el foco vuelve a «Crear otro»;
   «Cancelar igual» vuelve al formulario y corta la generación una sola vez. En la pantalla de progreso de la
   Biblioteca el botón de volver solo navega: no avisa ni corta, la generación sigue.

## El editor

7. **Cancelar el avatar en el editor (HR, unos 0,08 US$).** Abrí el video del punto 2, elegí una escena de avatar
   y tocá «Regenerar avatar» (confirmá el costo).
   - Si tocás «Cancelar» en los primeros segundos, antes de que HeyGen acepte el pedido, corta directo: sin aviso
     y sin cobrar.
   - Repetilo y esperá unos 15 segundos: «Cancelar» abre «¿Cancelar el avatar?» con «Ya se mandó a generar 1
     aparición: se cobra de tu saldo de avatares aunque canceles. No se pierde: queda guardada y se usa cuando la
     vuelvas a generar, sin pagar de nuevo.» «Seguir generando» y Escape no cortan y el foco vuelve a
     «Cancelar»; «Cancelar igual» corta.
   - Si volvés a pedir «Regenerar avatar» de esa escena, la confirmación puede seguir mostrando el costo, pero el
     saldo no tiene que bajar otra vez por esa toma.
   - Lo mismo vale en la tarjeta desplegada de la vista ampliada de imágenes: Escape cierra solo el aviso y la
     galería sigue abierta. Con varias escenas generándose, la cuenta del aviso es la de todas las cobradas, no
     solo la de la escena que miraste.

## Cuando algo falla

8. **La tarjeta del fallo con lo cobrado (HR, unos 0,17 US$).** La forma segura de verla: creá un video con 2
   apariciones de 5 s y, pasados unos 20 a 30 segundos desde que arranca «Generando el avatar», cerrá la app
   (Cmd+Q) y abrila de nuevo. La generación queda interrumpida («La generación se interrumpió al cerrar la app.
   Reanudá: lo hecho se conserva.») y debajo dice «Las 2 apariciones del avatar que ya se mandaron a generar
   están pagadas y quedan guardadas: al reintentar se usan sin pagar de nuevo.» Tocá «Reanudar»: el saldo no baja
   otra vez por esas apariciones.
   - Para un error de verdad: poné una clave de imágenes equivocada en Claves API y creá un video con avatar. Las
     imágenes fallan y cortan el avatar. Si HeyGen alcanzó a aceptar alguna aparición, la tarjeta del error trae
     esa línea con la cuenta; si no alcanzó (las imágenes pueden fallar antes del primer render aceptado), no
     tiene que aparecer ninguna línea. Las dos cosas son correctas. Después, volvé a poner la clave buena.
   - Con una pausa por saldo agotado, la línea va debajo de la tarjeta de saldo.
9. **La cuenta llena (opcional, sin costo extra).** Solo si tenés otro trabajo corriendo en HeyGen desde su sitio
   (por ejemplo un video que estés generando ahí) mientras Vimo manda diez apariciones, como en el punto 3: la
   que no entra recibe un rechazo de la cuenta llena y Vimo espera y la repite sola, hasta 10 minutos. Esa
   aparición dice «Subiendo la voz al servicio de avatares» todo ese rato (no avisa que la cuenta está llena: es
   lo esperado en esta versión) y arranca cuando se libera un lugar. Pasados 10 minutos sin lugar, sale con la
   imagen fija del look y un aviso. Mientras espera no está cobrada: el aviso de cancelar solo cuenta las que ya
   empezaron.

## Lo que ya estaba y sigue vigente

10. **El precio de «Crear escenario» (HR, 1 US$).** Es el punto 5 de la 2g: la ficha y el diálogo dicen
    «1,00 US$»; mirá tu saldo, creá un escenario de prueba y mirá el saldo otra vez: tiene que bajar 1 US$. Si
    baja otra cifra, decime cuál: es una constante.
11. **«Exportar para editar» con su X (gratis).** En el editor de un video con varias escenas (para que dé
    tiempo), tocá «Exportar para editar»: el botón pasa a una píldora «Exportando… N %» con una X («Cancelar
    exportación»). Tocá la X: la exportación se corta, el botón vuelve a «Exportar para editar» y no sale el
    aviso rojo de «Generación cancelada. Podés reanudarla…» ni se abre la carpeta. En la carpeta del proyecto no
    tiene que quedar una carpeta `clips/` a medias. Un segundo clic en la X no hace nada más.

## Lo que vino de `dev` 0.10.1 (humo)

12. **Un video sin avatar, de punta a punta.** Creá un video corto sin avatar presentador: no aparece la fila
    «Generando el avatar», las fases van en orden, termina y se reproduce, igual que antes. Es el caso que más
    cambió por debajo (el corredor ahora arma grupos de fases), así que es el primero que tiene que andar.
13. **La exportación rápida.** Exportá ese video: tarda bastante menos que antes y el movimiento lento de las
    imágenes no tiembla.
14. **Cambiar la voz tras un fallo (solo si usás ai33).** Provocá un fallo de la voz (por ejemplo, una clave de
    ai33 equivocada) y comprobá que la tarjeta del fallo ofrece «Reintentar» y «Cambiar voz», con el aviso previo
    para revisar el historial del proveedor. Elegí otro proveedor y otra voz: el video sigue desde la narración,
    no empieza de cero, y el panel de la voz se va al terminarla.

## Lo que no se pudo probar sin la app o sin saldo

- Todo se probó con HeyGen simulado, con la pantalla y el store reales de la app en Chrome sin pantalla, sin
  gastar saldo. En la app real faltan: que tu cuenta acepte diez renders a la vez sin un rechazo y cuánto se
  acorta el total; que la fase `render` (la de «cobrada») coincida con el momento en que baja el saldo; la
  ventana de menos de un segundo entre el pedido a HeyGen y su respuesta, en la que un «Cancelar» corta sin aviso
  aunque HeyGen ya haya aceptado el render; y la espera de la cuenta llena, que no se anuncia.
- El foco con el teclado y VoiceOver sobre WebKit, en la app empaquetada.
- El registro de diagnósticos con dos fases en curso (`failed_stage`) solo se probó con tests de Rust: para verlo
  en la práctica hace falta un fallo real y mirar la fila de soporte.
- Con apariciones que fallan después de cobradas (la descarga falla o vence el plazo), la línea de «ya se
  mandaron a generar» puede contar menos de las que HeyGen cobró: nunca más.
