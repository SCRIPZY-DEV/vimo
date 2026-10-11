# QA del dueño — entrega 2b

Lista de la app de prueba `0.9.3-editor.5`. Los puntos marcados **HR** generan un video con avatar y gastan saldo de HeyGen: mirá el saldo antes y después. Todo lo demás es gratis.

## Avatares → «Agregar de stock»

1. **Filtros por categoría.** En «De stock» aparecen Todos, Profesional, Estilo de vida, Comunidad y Favoritos. La primera vez dice «Clasificando los avatares de HeyGen…» unos 20 s; después es instantáneo (dura 24 h). Profesional = avatares de estudio, Comunidad = gemelos digitales, Estilo de vida = los de foto (Dante, Brody, Hayes…). «UGC» no está: la API de HeyGen no lo distingue.
2. **Favoritos.** Marcá dos avatares con el corazón, elegí «Favoritos», cerrá y abrí la app: siguen marcados. Si «Favoritos» muestra «Buscando más avatares…», al terminar tus favoritos siguen ahí (Vimo nunca los borra solo).
3. **Movimiento al pasar el mouse.** Quedate un instante sobre Dante, Brody o Hayes: la tarjeta se mueve con el video de su look de portada. Cruzar la grilla rápido no carga nada (espera de 250 ms).
4. **Looks del mismo tamaño y reproductor.** En «Ver looks», todas las fichas miden lo mismo aunque haya looks verticales. Clic en una: se abre el reproductor (play con sonido, línea de tiempo, velocidad, silencio y pantalla completa si aparece). Si entrás en pantalla completa, Escape la cierra sin cerrar el reproductor. «Cargar a la biblioteca» agrega el avatar con ese look como principal y abre su panel.
5. **Avatar ya agregado.** Con el avatar en la biblioteca, el reproductor ofrece «Abrir en tu biblioteca».

## Avatares → la biblioteca

6. **Tarjeta compacta.** Sin el espacio blanco; quitar está en la fila del nombre; las tarjetas de una fila miden lo mismo.
7. **Cada imagen se mueve.** Pasá el mouse por cada una de las tres imágenes de la tarjeta: cada una reproduce su propio look.
8. **Panel del avatar.** Clic en un look: el reproductor con «Usar como principal» (o «Es el look principal de este avatar.»).
9. **Capas en la app real.** El corazón y la barra del reproductor se ven encima del video, no tapados.

## Crear (gratis hasta generar)

10. **Look como desplegable.** Encendé «Avatar presentador»: viene el look principal de tu biblioteca. El desplegable «Look» lista solo los looks del formato del video, con «Look principal de tu biblioteca» en el principal. Al lado, la vista previa con video al pasar el mouse, también en looks sin imagen guardada.
11. **Aviso de moderación** destacado, con su título.
12. **El formulario no se pierde.** Llená nombre, guion, estilo y avatar, entrá a «Crear escenario» o «Administrar avatares» y volvé: todo sigue. Generá, pulsá «Crear otro», salí y volvé: sigue el formulario anterior.

## Planificador (HR)

13. **Silencios.** Usá una narración con un silencio de 5 s o más después de una frase dentro de una aparición. El avatar termina unos 2 s después de la última palabra y lo que sigue es una imagen.
14. **Subtítulos.** Las palabras de la última frase de una aparición salen sobre el avatar.
15. **Nunca más de 60 s.** Con apariciones de 60 s y una narración que termina en una frase corta, la pausa de escenas no muestra ninguna aparición de más de 1:00, tampoco la última.

## Correcciones

16. **Textos de error legibles.** Un texto de error en rojo (por ejemplo, una clave inválida en Claves API) se lee bien en tema oscuro y en claro. Los botones rojos no cambian.
17. **Escenas mudas.** En un proyecto con una pausa larga, la imagen de la pausa sostiene el momento anterior en vez de inventar una transición.
