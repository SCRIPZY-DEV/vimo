# QA del dueño — entrega 2f

Lista de la app de prueba `0.9.3-editor.13`. Los puntos **HR** generan un video o un clip con avatar y
gastan saldo de HeyGen: mirá el saldo antes y después. Lo demás es gratis. Siguen vigentes las listas de
la 2d y la 2e (`execution-e2d/qa-2d.md`, `execution-e2e/qa-2e.md`).

## El error de Avatar V

1. **Tu video con Avatar V (HR).** Abrí `video-2avatar` en el editor y tocá «Regenerarlas (4)». La
   confirmación muestra el costo antes de cobrar. Las cuatro apariciones salen con el movimiento propio de
   V: tu avatar «Jardineria» es de foto propio, sin gemelo digital, y con él V no acepta un prompt de
   movimiento. En el panel de cada escena, la nota lo dice arriba del campo de movimiento.
2. **V con Dante o Hayes (HR).** Con un avatar del stock, V acepta el prompt de movimiento: el avatar mueve
   la cara y las manos según lo que dice.

## Crear (gratis hasta generar)

3. **«3 veces en 2 minutos».** Debajo de «Empieza con el avatar» hay una casilla nueva con su «?».
   Prendida con 1 o 2 apariciones, dice que salen al menos 3; con más de 35 s por aparición, dice que las
   tres primeras duran hasta 35 s. El costo de la tarjeta cambia en consecuencia.
4. **El aviso de V sin gemelo digital.** Con «Jardineria» y Avatar V, «Movimiento más expresivo» queda
   apagado y dice que con Avatar V ese look usa su propio movimiento. Con Dante o Hayes, no.

## El video (HR)

5. **Tres en los primeros 2 minutos.** Generá un video de más de 3 minutos con la casilla prendida y
   «Empieza con el avatar»: el avatar abre el video y sale dos veces más antes del minuto 2; el resto de
   las apariciones se reparte después.
6. **«Empieza con el avatar».** Con la casilla prendida, el video siempre abre con el avatar.

## La vista ampliada del editor

7. **El avatar en la galería.** Abrí «Vista ampliada de imágenes»: las apariciones del avatar están en su
   lugar del video, con el clip (se reproduce sin sonido: el clip del avatar no trae la voz), su estado y
   las mismas acciones del panel («Regenerar avatar» con su costo y, con V o IV, el movimiento). No se
   pueden seleccionar para las acciones en lote de imágenes.

## Lo que no se pudo probar sin la app o sin saldo

- Todo se probó con el proveedor simulado y en Chrome sin pantalla, salvo las sondas gratis del rechazo de
  V. En la app real faltan: los renders de V e IV, cuánto cobra V con un look de foto y el reparto de las
  tres primeras apariciones con tu narración (en narraciones simuladas, las tres entran en los 2 minutos
  en el 99,95 % de los casos o más).
