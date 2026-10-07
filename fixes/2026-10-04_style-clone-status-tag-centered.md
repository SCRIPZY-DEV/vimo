# Fix: el estado de una clonación en curso no se distinguía en su tarjeta

- **Fecha:** 2026-10-04
- **Rama:** feat/creador-estilo-ia-sobre-catalogo

## Causa

La tarjeta de una clonación en curso (Mi estilo) mostraba su estado («Preparando», «Analizando»,
«Dibujando pruebas», «Guardando»…) en una etiqueta chica, arriba a la izquierda, sobre la portada
apenas aclarada. Con una portada clara la etiqueta blanca se perdía, y había que buscarla para
saber en qué fase iba. Solo «Respondé para continuar» iba más grande (commit `7e34c31c`).

Pedido del dueño: la etiqueta en el centro, con el fondo de la tarjeta un poco opaco, para ver cada
fase de un vistazo.

## Corrección

- **`StyleCloneSessionCard.tsx`:** un velo (`bg-black/45`) apaga la portada en todos los estados y
  la etiqueta va centrada encima. Antes la portada solo se aclaraba mientras la sesión trabajaba.
  La tarjeta que todavía no tiene portada ya no dibuja el ícono de relleno, que quedaba debajo de
  la etiqueta.
- **`StyleCloneStatusTag.tsx`:** un solo tamaño para todos los estados (14 px) y colores fijos,
  porque la etiqueta va siempre sobre el velo oscuro: blanca mientras trabaja, saffron con borde
  cuando espera una respuesta y coral si se detuvo. En una tarjeta angosta un texto largo baja a
  dos líneas en vez de cortarse con puntos suspensivos, y el separador « · » se queda con la
  primera parte, así la segunda línea no empieza con el punto.

No hay textos nuevos.

## Límites deliberados

- El velo va en todos los estados, también cuando la sesión espera una respuesta o falló: la
  etiqueta está en el mismo lugar y se lee igual en cualquiera.
- En portugués, «Sem saldo · Recarregue e continue» ocupa tres líneas en la tarjeta más angosta
  (ventana mínima). Se lee entero.
- La barra de avance del modal y los textos de cada estado no cambian.

## Validación reproducible

No hay framework de tests del frontend. Se dibujó `StyleCloneSessionCard` (el componente real) en
Chrome, en la grilla de Mi estilo, con una sesión por cada estado, y se miró la captura (script
local, fuera del repo):

| Caso                                         | Resultado                                              |
| -------------------------------------------- | ------------------------------------------------------ |
| Tarjeta de 272 px (ventana de 1280), español | Los 8 estados en una línea, centrados                  |
| Tarjeta de 207 px (ventana mínima), español  | Los tres textos largos en dos líneas; el resto, en una |
| Tarjeta de 207 px, portugués                 | El más largo en tres líneas; ninguno cortado           |
| Tarjeta de 272 px, inglés                    | «No balance · Top up and continue» en dos líneas       |
| Tema claro y tema oscuro                     | La etiqueta se distingue sobre el velo en los dos      |
| Sesión sin portada (recién empezada)         | La etiqueta centrada sobre el fondo, sin ícono debajo  |

`pnpm format`, `pnpm lint` y `pnpm build` pasan.

## Pruebas manuales

- Las capturas de arriba, mirando cada estado.
- Pendiente del dueño: verlo en la app con el build de prueba nuevo.
