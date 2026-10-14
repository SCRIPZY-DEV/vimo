# QA del dueño — entrega 2e

Lista de la app de prueba `0.9.3-editor.11`. Los puntos **HR** generan un video o un clip con avatar y
gastan saldo de HeyGen: mirá el saldo antes y después de cada uno y anotá cuánto bajó. Todo lo demás es
gratis. La lista de la 2d (`execution-e2d/qa-2d.md`) sigue vigente.

Si algo de esta entrega rompe lo que ya andaba, el estado anterior quedó marcado con la etiqueta local
`avatar-2d-funcional` (`550e7f14`).

## Crear (gratis hasta generar)

1. **El motor.** Encendé «Avatar presentador» y elegí un avatar y un look. Aparece «Motor» con Avatar V,
   IV y III, en ese orden, cada uno con su descripción y el costo de este video. Por defecto, Avatar III.
   Con Dante o Hayes (looks de foto), los tres están disponibles.
2. **Un motor que el look no admite** queda apagado y dice «Este look no admite …». Si elegiste V y
   cambiás a un look sin V, el video sale con el primero que admite (III, IV, V) sin tocar tu elección.
3. **«Movimiento más expresivo».** Con V o IV aparece el interruptor con su «?»; el tooltip dice qué hace y
   «No suma costo». Con III no aparece. Debajo: «Vimo escribe el movimiento de cada aparición…».
4. **El costo cambia con el motor.** Con un look de foto y 3 apariciones de 10 s: III ≈ US$ 0,50, IV
   ≈ US$ 1,16 y V ≈ US$ 3,60. El chequeo de saldo y la pausa de confirmación de escenas usan el mismo motor.

## Biblioteca (gratis)

5. **Motores en las fichas.** Las fichas de looks, la tarjeta y el panel de cada avatar muestran una
   pastilla por motor admitido («Avatar V», «Avatar IV», «Avatar III»). Un look que solo admite IV o V
   ahora sirve como principal.

## Progreso (HR)

6. **El porcentaje de cada aparición.** En «Generando el avatar», junto al tiempo de cada aparición, un
   spinner y el porcentaje, sin barra: llega a 90 % a los 2 minutos y nunca dice 100 %; al terminar, «Lista».
7. **La tarjeta del avatar en la grilla.** En «Imágenes», las escenas del avatar son tarjetas moradas con
   el ícono del avatar, su número, su tramo y su estado (en espera, generando con el porcentaje, lista,
   con la imagen fija o desactualizada), sin «Ampliar». El conteo «Imágenes (n/m)» ya no las cuenta.
8. **Avatar V con movimiento (HR).** Generá un video corto con V y un look de foto. Mirá que la cara y las
   manos acompañen lo que dice, sin exagerar. **Anotá cuánto bajó el saldo:** Vimo estima V con look de
   foto a US$ 7,20 por minuto como techo, porque HeyGen no publica esa tarifa.
9. **Avatar IV con «más expresivo» (HR).** Lo mismo con IV y el interruptor prendido: más energía en los
   gestos que con el interruptor apagado. Anotá si cobró igual que sin él (Vimo supone que no suma costo).
10. **Avatar III (HR, opcional).** Mirá si el cuerpo acompaña. La API no tiene la opción «movimiento de
    cuerpo entero» del estudio de HeyGen: se usa la de por defecto.

## Editor

11. **Regenerar una escena que salió bien.** Tocá un bloque de avatar listo: el panel ofrece «Regenerar
    avatar» con su costo al motor de esa escena. La confirmación dice «¿Regenerar el avatar?» y que el clip
    actual queda hasta que el nuevo esté listo.
12. **Movimiento (V, o IV con un look de foto).** El panel muestra «Movimiento»: el motor con su
    descripción, el prompt que escribió Vimo (en inglés), el contador, «Usar el automático» si lo cambiás,
    «Movimiento más expresivo» con su «?» y «Qué podés pedir», que despliega lo que se controla y lo que
    no. Con III no aparece. Enter no agrega saltos de línea. Si el proveedor rechazó el movimiento de una
    escena, una nota lo dice arriba del campo, que sigue editable: con otro prompt se vuelve a intentar.
13. **El ajuste viaja (HR).** Cambiá el prompt de una escena (por ejemplo, «Smiles warmly and nods on the
    key point.»), regenerá y mirá el clip nuevo: misma parte de la narración y misma voz. El prompt
    editado queda guardado en la escena.
14. **Si falla, queda el anterior.** Si una regeneración falla, el aviso dice «No se pudo regenerar el
    avatar: … Quedó el clip anterior.» y el bloque sigue con su clip. (Difícil de forzar; se probó con el
    proveedor simulado.)

## Lo que no se pudo probar sin la app o sin saldo

- Todo se probó con el proveedor y el LLM simulados, en Chrome sin pantalla. En la app real faltan: el
  movimiento de verdad con V y IV, lo que cobra V con un look de foto, si «más expresivo» suma costo, cuánto
  texto acepta HeyGen en `motion_prompt` (si rechaza uno largo, Vimo lo toma como «este look no admite
  movimiento» y genera sin él) y el Enter sostenido sobre «Usar el automático» en WebKit.
- Cambiar el movimiento de una escena que todavía tiene un render en camino en HeyGen (por ejemplo, uno
  que venció el plazo) paga un render nuevo. Avisarlo en el editor queda para la entrega 3.
