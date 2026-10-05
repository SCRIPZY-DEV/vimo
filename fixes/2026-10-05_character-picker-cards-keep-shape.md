# Fix: las tarjetas del selector de personajes se deformaban con muchos personajes

- **Fecha:** 2026-10-05
- **Rama:** feat/catalogo-estilos

## Causa

En «Elegir personajes» y «Elegir el personaje predeterminado» (`CharacterPickerModal`), la grilla
de tarjetas era a la vez el contenedor que scrollea: ocupaba el alto que le dejaba el modal
(`max-h-[85vh]`) y lo repartía entre sus filas. La clase `auto-rows-fr` de Tailwind es
`grid-auto-rows: minmax(0, 1fr)`, sin mínimo, así que con muchas filas cada una medía una fracción
del alto visible y no lo que mide una tarjeta.

Con 8 personajes sin foto (9 tarjetas en 3 filas) las filas quedaban en unos 135 px:

- las tarjetas de personaje recortan lo que no entra, así que mostraban solo la parte de arriba
  del retrato y perdían el nombre y la descripción;
- la tarjeta «Crear personaje con mi estilo» tiene un alto mínimo de 192 px (`min-h-48`), así que
  se salía de su fila y quedaba tapada por la tarjeta de abajo.

Con pocos personajes no pasaba: la grilla entraba entera y cada fila medía lo que su tarjeta. El
componente es igual en `dev`, así que el error también está en la versión publicada.

## Corrección

`src/modules/videos/components/CharacterPickerModal.tsx`: el scroll pasa a un envoltorio
(`min-h-0 flex-1 overflow-y-auto`) y la grilla queda adentro con su alto natural. Así
`auto-rows-fr` iguala todas las filas a la tarjeta más alta (retrato cuadrado más dos renglones) y
la tarjeta de crear mide lo mismo que las demás, haya 8 o 100 personajes. Lo que no entra se ve
scrolleando dentro del modal, como antes.

## Límites deliberados

- No cambia el diseño de las tarjetas ni cuántas entran por fila (2, 3 o 4 según el ancho).
- La tarjeta de crear conserva su alto mínimo, para cuando no hay ningún personaje.

## Validación reproducible

No hay framework de tests para `src/`. La validación es una copia estática del selector con el CSS
compilado de la app (`pnpm build`), dibujada con Chrome headless:

1. Armar un HTML con el marcado del modal (diálogo `flex max-h-[85vh] … flex-col`, pestañas,
   grilla y pie) y 9 tarjetas: la de crear y 8 de personaje, con las mismas clases del componente.
2. Con la grilla que scrollea (código anterior), a 1440×900: las filas miden unos 135 px, los
   retratos se cortan sin nombre ni descripción y la tarjeta de crear se mete debajo de la segunda
   fila, igual que en la captura del dueño.
3. Con el envoltorio (código nuevo): todas las tarjetas muestran el retrato cuadrado, el nombre y
   dos renglones, y la de crear iguala a las demás. Con 100 tarjetas a 900×700 (3 columnas) y el
   scroll al final, la última fila también está completa.

`pnpm format`, `pnpm lint` y `pnpm build` pasan.

## Pruebas manuales

Pendiente del dueño en la próxima app de prueba: abrir «Elegir el personaje predeterminado» (desde
«Ver» de un estilo, con «Mi personaje») en la pestaña «Personajes sin foto», con sus 8 personajes.
Cada tarjeta tiene que verse entera (retrato, nombre y descripción), la de «Crear personaje con mi
estilo» del mismo tamaño que las demás, y el resto se ve scrolleando dentro del modal.
