# QA del dueño — entrega 2c

Lista de la app de prueba `0.9.3-editor.6`. Los puntos **HR** generan un video con avatar y gastan
saldo de HeyGen (unos 0,12 USD por una aparición corta): mirá el saldo antes y después. El punto
**IRREVERSIBLE** borra un avatar de tu cuenta de HeyGen para siempre: hacelo con uno que no quieras.
Todo lo demás es gratis.

## Avatares → «Agregar de stock» → «Mis avatares»

1. **La pestaña se llama «Mis avatares».** Ya no dice «en HeyGen».
2. **Eliminar de HeyGen (IRREVERSIBLE).** Pasá el mouse por un avatar tuyo que no quieras: arriba a
   la izquierda aparece el tacho «Eliminar de HeyGen». Primer clic: el botón se pone rojo y dice
   «¿Eliminar para siempre?», con la explicación en la tarjeta. Segundo clic: «Eliminando…», la
   tarjeta se apaga, sale el aviso y la tarjeta desaparece. Si el avatar estaba en tu biblioteca,
   también sale de ahí. Confirmalo en el panel de HeyGen: ya no está.
3. **Arrepentirse no borra nada.** Hacé el primer clic y sacá el mouse de la tarjeta, o pasá a otra
   con Tab: vuelve el tacho. Un doble clic rápido sobre el tacho tampoco borra, ni dejar apretado
   Enter: hace falta un segundo clic aparte.
4. **La ventana espera al borrado.** Mientras dice «Eliminando…», ni Escape, ni la X, ni un clic
   afuera cierran la ventana.
5. **En «De stock» no hay tacho.** Solo está el corazón de favoritos.

## Avatares → la biblioteca

6. **El formato de cada look.** En «Ver looks» del stock, en el panel de un avatar de tu biblioteca
   y en el reproductor, cada look dice su formato: 9:16, 16:9, 1:1, 4:5 o 5:4. Si HeyGen no informa
   ni la forma ni las medidas, ese look no lleva chip.
7. **«Quitar» con doble clic.** El «Quitar» de una tarjeta de la biblioteca y el del panel piden
   confirmación. Un doble clic rápido no la confirma.

## Crear (gratis hasta generar)

8. **La tarjeta tiene el formato del video.** Encendé «Avatar presentador» con un video 16:9: las
   tarjetas de la fila son horizontales. Cambiá a 9:16: pasan a verticales. Adentro, abajo y en
   blanco, van el nombre del look y «+N looks» con los demás.
9. **Movimiento al pasar el mouse.** Quedate un instante sobre una tarjeta: se mueve con el video de
   su look.
10. **El botón «Look».** Debajo de la fila, «Look» abre una grilla con todos los looks del avatar.
    Cada uno muestra su imagen y su formato, el principal dice «Principal» y el elegido va marcado.
    Los de otro formato se ven apagados y dicen por qué. Elegí uno: queda en la tarjeta, la grilla
    se cierra y el foco vuelve al botón. Con Tab se llega a todos los looks, también a los que no
    se pueden elegir, y Enter elige uno.
11. **El look principal va por defecto.** Marcá otro look como principal en la biblioteca y volvé a
    Crear: aparece ese.
12. **Avatar sin look para el formato.** Un avatar sin look del formato del video muestra su cara
    recortada y el motivo. Fijate si se le ve bien la cara: con una foto vertical en una tarjeta
    16:9 puede verse solo la parte de arriba de la cabeza.

## Colores en tema claro

13. **Avisos coral legibles.** En tema claro, los avisos en coral se leen bien, por ejemplo el de la
    clave de HeyGen que falta o el error de una escena. En tema oscuro se ven como antes.
14. **Botones rojos.** En tema claro, los botones y toasts rojos son un poco más oscuros para que el
    texto blanco se lea. La etiqueta de error de una clonación de estilo va en rojo vino, como el
    «Error» de la Biblioteca. En tema oscuro no cambian.

## Título del render en HeyGen (HR)

15. **El nombre del video en HeyGen.** Creá un video con avatar cuyo nombre tenga un acento y un emoji
    y pase los 80 caracteres. En el panel de HeyGen cada render se llama «nombre del video · vimo:…»,
    con el nombre cortado en 80 caracteres.
16. **Avisame después de ese primer render.** Con el render listo corro dos consultas gratis a HeyGen,
    una por la marca y otra por el título exacto. Confirman que Vimo encuentra el render si una
    generación se corta. Es lo único que no se pudo probar sin pagar un render.
17. **Retomar sin pagar dos veces.** Cerrá la app mientras HeyGen renderiza una aparición, volvé a
    abrirla y retomá ese proyecto: la aparición se recupera y el saldo baja una sola vez.
