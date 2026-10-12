import { cn } from '@/modules/common/utilities/cn'
import type { AvatarDeleteMenuVariant } from '@/modules/avatars/types/deleteMenu'

// Las clases del menú de eliminar un avatar (`AvatarDeleteMenu`) en sus tres
// variantes. El comportamiento vive en el componente; acá, solo cómo se ve.

interface TriggerState {
  open: boolean
  deleting: boolean
  disabled: boolean
}

// Una opción neutra («Eliminar de la lista», «Cancelar») o en rojo («Eliminar
// permanentemente de HeyGen» / «Seguro»).
type OptionTone = 'neutral' | 'danger'

// El botón en «Mis avatares» lleva sus propias clases (sin variante del kit);
// en la biblioteca, un ícono fantasma; en el panel, con su texto.
export function triggerVariant(variant: AvatarDeleteMenuVariant) {
  if (variant === 'stock') return null

  return 'ghost'
}

export function triggerSize(variant: AvatarDeleteMenuVariant) {
  if (variant === 'stock') return null
  if (variant === 'library') return 'icon'

  return 'sm'
}

export function triggerClassName(
  variant: AvatarDeleteMenuVariant,
  { open, deleting, disabled }: TriggerState,
) {
  const blocked = disabled && !deleting
  if (variant === 'stock') {
    // `transform-gpu`: en su capa, encima de la imagen que hace zoom
    // (ERRORES-CONOCIDOS: webkit-capa-compuesta-tapa-hermanos-con-z-index-en-
    // overflow-hidden-redondeado); `z-10`, encima de las opciones.
    return cn(
      'absolute left-2.5 top-2.5 z-10 flex h-8 max-w-[calc(100%-1.25rem)] transform-gpu items-center justify-center gap-1.5 rounded-full font-display text-xs font-bold backdrop-blur-md transition focus-visible:ring-white focus-visible:ring-offset-0',
      deleting && 'bg-destructive px-3 text-destructive-foreground',
      !deleting && 'w-8 text-white',
      !deleting && open && 'bg-black/60',
      !deleting &&
        !open &&
        'bg-black/35 opacity-0 hover:bg-black/55 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100',
      blocked && 'cursor-not-allowed hover:bg-black/35 [&>svg]:opacity-50',
    )
  }
  if (variant === 'library') {
    return cn(
      'h-8 w-8 rounded-lg',
      deleting
        ? 'text-destructive-text'
        : 'text-muted-foreground hover:text-destructive-text',
      open && 'bg-accent text-foreground',
      blocked && 'cursor-not-allowed opacity-50',
    )
  }

  return cn(
    '-ml-3 rounded-xl font-display text-muted-foreground hover:text-foreground',
    (open || deleting) && 'text-foreground',
    open && 'bg-accent',
    blocked && 'cursor-not-allowed opacity-50',
  )
}

// Sobre la imagen, un velo oscuro con las opciones (se desvanece al abrir); en
// el panel, una caja debajo del botón (cerrada, `hidden`). En «Mis avatares»
// (`stock`) el velo llena la tarjeta y las opciones se apoyan abajo. En la
// biblioteca cubre la imagen entera y las opciones van centradas, en una
// grilla de tres filas: la de arriba aloja la advertencia, pegada a las
// opciones y creciendo hacia arriba sin moverlas; la del medio, las opciones;
// la de abajo, el aire que las centra (`minmax(0, 1fr)`: la advertencia nunca
// empuja la fila del medio). El velo de la biblioteca lleva ancho explícito
// (`w-full`): con `inset-x-0` y `aspect-ratio`, sin ancho, WebKit (la app de
// Tauri) toma como ancho el espacio que queda menos el relleno horizontal
// (`p-3`: 24 px) y la altura sale del 4:5 de ese ancho, así que el velo quedaba
// corto a la derecha y abajo; Chrome lo estira bien y no deja ver el error.
export function panelClassName(
  variant: AvatarDeleteMenuVariant,
  open: boolean,
) {
  if (variant === 'panel')
    return 'space-y-3 rounded-xl border border-border bg-muted/40 p-3'

  return cn(
    'absolute z-[5] transform-gpu bg-black/75 p-3 transition-opacity duration-200',
    variant === 'stock'
      ? 'inset-0 flex flex-col justify-end gap-2 pt-12'
      : 'left-0 top-0 grid aspect-[4/5] w-full grid-rows-[minmax(0,1fr)_auto_minmax(0,1fr)]',
    open ? 'visible opacity-100' : 'invisible opacity-0',
  )
}

// La advertencia de «Seguro»: en blanco sobre el velo y del color del texto en
// el panel. En «Mis avatares» va en el flujo, arriba de las opciones. En la
// biblioteca ocupa la fila de arriba de la grilla del velo, apoyada en las
// opciones (`self-end`), y si es larga crece hacia arriba, sin salirse del
// velo: con las opciones centradas, en la tarjeta de 164 px de la ventana
// mínima solo hay lugar para tres líneas encima de ellas, y a 12 px el texto
// en inglés con una fuente más ancha que la de la app (medido con Verdana)
// pasaba a cuatro y perdía la primera por arriba; a 11 px entra en tres líneas
// en los tres idiomas, con las dos fuentes.
export function warningClassName(variant: AvatarDeleteMenuVariant) {
  if (variant === 'panel')
    return 'font-body text-sm leading-snug text-foreground'
  if (variant === 'stock') return 'font-body text-xs leading-snug text-white'

  return 'row-start-1 self-end pb-2 font-body text-[11px] leading-snug text-white'
}

// Las opciones, en lugares que no se cruzan al pedir «Seguro». En «Mis
// avatares», una columna que se apoya abajo (el velo la empuja con
// `justify-end`): «Seguro», de una línea, queda al pie, dentro del lugar que
// tenía «Eliminar permanentemente de HeyGen», y la advertencia crece hacia
// arriba. En la biblioteca, una columna en la fila del medio del velo: queda
// centrada, y al pedir «Seguro» la columna se achica alrededor de su centro,
// así que «Seguro» (una línea) queda centrado dentro del lugar de «Eliminar
// permanentemente de HeyGen» (dos o tres líneas) y «Cancelar», sobre el de la
// lista, sin que ninguno toque el lugar del otro. En el panel, dos celdas
// iguales: «Seguro» en la de HeyGen y «Cancelar» en la de la lista (la
// advertencia puede mover la fila entera, nunca cruzarlas).
export function optionsClassName(variant: AvatarDeleteMenuVariant) {
  if (variant === 'panel') return 'grid grid-cols-2 gap-2'
  if (variant === 'stock') return 'flex flex-col gap-2'

  return 'row-start-2 flex flex-col gap-2'
}

// Las clases de una opción. Sobre la imagen, píldoras a todo el ancho que
// parten el texto largo en dos líneas; en el panel, cada una llena su celda.
export function optionClassName(
  variant: AvatarDeleteMenuVariant,
  tone: OptionTone,
) {
  if (variant === 'panel') return 'rounded-xl font-display font-bold'

  return cn(
    'h-auto min-h-8 w-full whitespace-normal rounded-full px-3 py-1.5 text-center font-display text-xs font-bold leading-tight focus-visible:ring-white focus-visible:ring-offset-0',
    tone === 'danger'
      ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
      : 'border border-white/25 bg-white/15 text-white backdrop-blur-md hover:bg-white/25',
  )
}
