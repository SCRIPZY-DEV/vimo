# QA del dueño — entrega 2d

Lista de la app de prueba `0.9.3-editor.9`. Los puntos **HR** generan un video con avatar y gastan
saldo de HeyGen (unos 0,12 USD por aparición corta): mirá el saldo antes y después. El punto
**IRREVERSIBLE** borra un avatar de tu cuenta de HeyGen para siempre: hacelo con uno que no quieras.
Todo lo demás es gratis.

Esta lista reemplaza los puntos 2 a 5 y 7 de la QA de la 2c (`execution-e2c/qa-2c.md`), los del
borrado. El resto de esa lista sigue vigente.

## Crear (gratis hasta generar)

1. **El look se mira en el reproductor.** Encendé «Avatar presentador», abrí «Look» y tocá un look:
   se abre el mismo reproductor de Avatares y el avatar arranca solo. Si no suena, el botón dice
   «Activar el sonido». Abajo, «Usar».
2. **«Usar» lo elige.** «Usar» deja ese look en la tarjeta, cierra el reproductor y la grilla, y el
   foco vuelve al botón «Look». Cerrar con la X o Escape no cambia nada.
3. **Un look que no sirve dice por qué.** Un look de otro formato, o uno que no se pudo generar, abre
   igual, dice por qué con una frase y no tiene «Usar».
4. **Mínimo de 5 s.** Los segundos por aparición aceptan desde 5.

## Avatares

5. **El reproductor arranca solo** también en «Ver looks» del stock y en el panel de un avatar.
6. **Sin HeyGen en los avisos.** En Avatares, Crear, la pantalla de progreso y el editor ningún aviso
   nombra a HeyGen. La píldora del saldo dice «Saldo · US$…» y el diálogo del stock se titula
   «Agregar un avatar». Solo las opciones y la confirmación del borrado en HeyGen, y Claves API,
   nombran a HeyGen.

## Eliminar un avatar

7. **Dos opciones ahí mismo.** En la tarjeta de la biblioteca, el botón de eliminar despliega
   «Eliminar de la lista» y, si el avatar es tuyo, «Eliminar permanentemente de HeyGen».
8. **«Eliminar de la lista».** Sale de tu biblioteca sin otro paso y avisa «… salió de tu lista.».
   Sigue en HeyGen: lo podés volver a agregar gratis desde «Agregar un avatar» → «Mis avatares».
9. **«Eliminar permanentemente de HeyGen» (IRREVERSIBLE).** Con un avatar tuyo que no quieras: la
   opción se convierte en «Seguro» en el mismo lugar, con «Este avatar se eliminará también de
   HeyGen. ¿Seguro?», y en el lugar de la lista aparece «Cancelar». Recién «Seguro» lo borra: sale
   de tu biblioteca y de «Mis avatares». Confirmalo en el panel de HeyGen.
10. **Equivocarse no borra.** Tocá «Eliminar permanentemente de HeyGen» y después donde estaba
    «Eliminar de la lista»: cae en «Cancelar». Un doble clic rápido sobre la opción de HeyGen
    tampoco borra.
11. **Teclado y mouse iguales.** Al abrir el menú, el foco entra a la primera opción y las opciones
    quedan a la vista, también llegando con Tab a una tarjeta cortada abajo. Escape cierra el menú y
    no la ventana de atrás. Salir de la tarjeta lo cancela. Con una tarjeta cortada abajo en «Mis
    avatares», tocar «Eliminar permanentemente de HeyGen» no mueve la grilla.
12. **«Mis avatares» y el panel.** El mismo menú está en «Mis avatares», donde «Eliminar de la lista»
    aparece solo si el avatar está en tu biblioteca, y en el panel del avatar.

## El video y el editor

13. **Una aparición que falla no frena el video (HR).** Si HeyGen falla en una aparición, el video sale
    igual: esa aparición muestra la imagen fija del look. Arriba del editor aparece el aviso con
    «Regenerarlas (N)».
14. **Regenerar desde el editor (HR).** En el editor, tocá una escena de avatar: el panel ofrece
    «Generar avatar» (planeada) o «Regenerar avatar» (fallida o desactualizada) con su costo. La
    confirmación muestra la cantidad, el costo y tu saldo; con saldo corto, el botón queda apagado.
    Al confirmar, el bloque muestra el avance; al terminar, el clip nuevo. Exportá el video para
    verlo en el archivo final.
15. **Reanudar no cobra lo desactualizado.** Reemplazá la narración de un proyecto con avatar: los
    bloques quedan «Desactualizado» y reanudar no cobra nada de avatar. Se regeneran desde el
    editor, viendo el costo antes.

## Lo que no se pudo probar sin la app

- Todo se midió en Chrome sin pantalla. En la app (WebKit) faltan: el sonido al arrancar el
  reproductor, el foco del menú de borrado con el mouse y la geometría de «Seguro» con la fuente real.
- Un clip ya pagado que solo hay que volver a bajar se muestra con su precio completo en el editor,
  aunque recuperarlo es gratis. Es un techo seguro; marcarlo «recuperable sin costo» queda para la
  entrega 3.
