import { useEffect, useId, useLayoutEffect } from 'react'
import type { FocusEvent, MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { cn } from '@/modules/common/utilities/cn'
import type { AvatarDeleteMenuState } from '@/modules/avatars/hooks/useAvatarDeleteMenu'
import type { AvatarDeleteMenuVariant } from '@/modules/avatars/types/deleteMenu'
import {
  optionClassName,
  optionsClassName,
  panelClassName,
  triggerClassName,
  triggerSize,
  triggerVariant,
  warningClassName,
} from '@/modules/avatars/utilities/avatarDeleteMenuClasses'
import {
  ignoreHeldKey,
  isSecondClickOfDoubleClick,
} from '@/modules/avatars/utilities/twoStepConfirmGuards'

interface AvatarDeleteMenuProps {
  menu: AvatarDeleteMenuState
  variant: AvatarDeleteMenuVariant
  // El nombre del avatar: nombra el botón y las opciones (hay uno por
  // tarjeta) y describe el botón mientras elimina.
  name: string
  // «Eliminar de la lista»: lo saca de la biblioteca de Vimo sin otro paso
  // (sigue en HeyGen). Sin él, no se ofrece.
  onRemoveFromList?: () => void
  // «Eliminar permanentemente de HeyGen», ya confirmado con «Seguro». Solo en
  // avatares propios: sin él, no se ofrece.
  onDeleteFromHeyGen?: () => void
  // El borrado en HeyGen de este avatar está en vuelo: el botón dice
  // «Eliminando…».
  deleting?: boolean
  // Otra operación en vuelo: el botón no hace nada (`aria-disabled`, sigue
  // enfocable).
  disabled?: boolean
}

// El botón de eliminar un avatar con sus dos opciones (entrega 2d, diseño
// §20), el mismo en la tarjeta y el panel de la biblioteca y en «Mis
// avatares». Es un botón de menú: al abrir, el foco pasa a la primera opción
// (también con el mouse: en WebKit, la app de Tauri, un clic no enfoca el
// botón) y las opciones se traen a la vista; el mousedown nunca mueve el foco
// y, al cerrar, vuelve al botón.
// «Seguro» es el mismo botón que «Eliminar permanentemente de HeyGen», en su
// mismo lugar (`optionsClassName`), y ningún botón actúa con una tecla
// sostenida ni con el segundo clic de un doble clic. Ninguna opción entra o
// sale del DOM: dentro de un diálogo, un nodo que se va en el blur hace que
// Radix devuelva el foco a su caja (ERRORES-CONOCIDOS: radix-focusscope-
// devuelve-el-foco-al-dialogo-si-se-desmonta-un-nodo-durante-el-blur). Lo que
// se hace al elegir, y adónde va el foco si la tarjeta desaparece, es de quien
// lo monta.
export function AvatarDeleteMenu({
  menu,
  variant,
  name,
  onRemoveFromList,
  onDeleteFromHeyGen,
  deleting = false,
  disabled = false,
}: AvatarDeleteMenuProps) {
  const { t } = useTranslation()
  const panelId = useId()
  const nameId = useId()
  const warningId = useId()
  const { open, confirming, close, triggerRef, panelRef } = menu
  const busy = deleting || disabled
  const overImage = variant !== 'panel'
  const listHidden = !onRemoveFromList || confirming
  const heyGenHidden = !onDeleteFromHeyGen

  // Al abrir, el foco pasa a la primera opción a la vista, también con el
  // mouse: así el menú se comporta igual en WebKit y en Chrome, y sacarle el
  // foco lo cierra en los dos. De layout: el foco se mueve en el mismo commit,
  // antes de la próxima tecla, y las repeticiones de una tecla sostenida caen
  // en la opción, que las ignora. Después, las opciones se traen a la vista,
  // lo justo (`block: 'nearest'`): con el teclado, la opción enfocada podía
  // quedar debajo del pie de la grilla, y Enter actuaba sin que se viera. Es
  // el único desplazamiento del menú y pasa antes de elegir nada: armar
  // «Seguro» y cerrar enfocan sin desplazar (`preventScroll`), así «Seguro»
  // nunca cae donde estaba otra opción.
  useLayoutEffect(() => {
    if (!open) return

    panelRef.current
      ?.querySelector<HTMLElement>('button:not([hidden])')
      ?.focus({ preventScroll: true })
    panelRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [open, panelRef])

  // Mientras el menú está abierto, Escape lo cierra a él y no al diálogo de
  // atrás (el del stock o el panel del avatar). Radix escucha Escape en
  // `document`, en captura, antes que React: el menú llega antes, en
  // `window`, y lo marca (`preventDefault`) para que Radix no cierre el
  // diálogo; es lo mismo que interceptar su `onEscapeKeyDown`, sin que cada
  // diálogo tenga que saber de los menús de sus tarjetas.
  useEffect(() => {
    if (!open) return

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      event.preventDefault()
      close()
    }
    window.addEventListener('keydown', closeOnEscape, true)

    return () => window.removeEventListener('keydown', closeOnEscape, true)
  }, [open, close])

  // Cada clic del menú se queda en el menú: en una tarjeta de «Mis avatares»,
  // si subiera, la tarjeta abriría los looks.
  const toggle = (event: MouseEvent) => {
    event.stopPropagation()
    if (busy || isSecondClickOfDoubleClick(event)) return

    menu.toggle()
  }

  const removeFromList = (event: MouseEvent) => {
    event.stopPropagation()
    if (busy || isSecondClickOfDoubleClick(event)) return

    close()
    onRemoveFromList?.()
  }

  // Primer clic: pide «Seguro»; el segundo (el mismo botón) elimina. Al
  // pedirlo, el foco pasa a este botón (con el mouse, el mousedown no lo
  // movió): «Eliminar de la lista», que lo tenía, se oculta. Sin desplazar
  // nada: si la opción estaba a medias a la vista, el navegador la traería
  // entera calculando con su alto de dos o tres líneas, y «Seguro», de una y
  // apoyado al pie, caería donde estaba «Eliminar de la lista».
  const deleteFromHeyGen = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (busy || isSecondClickOfDoubleClick(event)) return
    if (!confirming) {
      event.currentTarget.focus({ preventScroll: true })
      menu.askConfirmation()
      return
    }

    close()
    onDeleteFromHeyGen?.()
  }

  // «Cancelar» y el velo tampoco hacen nada con el segundo clic de un doble
  // clic: sobre la imagen, «Seguro» (una línea) es más bajo que «Eliminar
  // permanentemente…» (dos o tres), así que un doble clic que empieza cerca
  // del borde de arriba de esa opción termina en «Cancelar» o entre las dos,
  // y no tiene que abrir y cerrar la confirmación.
  const cancel = (event: MouseEvent) => {
    event.stopPropagation()
    if (isSecondClickOfDoubleClick(event)) return

    close()
  }

  // Sacarle el foco lo cierra; moverlo entre el botón y las opciones, no.
  const closeOnFocusLeave = (event: FocusEvent) => {
    if (!open || event.currentTarget.contains(event.relatedTarget)) return

    close()
  }

  // El mousedown no mueve el foco dentro del menú, en ningún motor: si la
  // opción que lo tiene lo perdiera, su blur cerraría el menú antes del clic
  // (y en un diálogo el foco caería en su caja). Sobre la imagen, un clic
  // fuera de las opciones (sobre el velo) lo cierra; como todo clic del menú,
  // no sube a la tarjeta (que, con el menú abierto, también lo cerraría, sin
  // mirar si es el segundo clic de un doble clic).
  const keepFocus = (event: MouseEvent) => event.preventDefault()
  const closeFromVeil = (event: MouseEvent) => {
    event.stopPropagation()
    if (!overImage || isSecondClickOfDoubleClick(event)) return

    close()
  }

  return (
    <div
      onBlur={closeOnFocusLeave}
      onMouseDown={keepFocus}
      className={overImage ? 'contents' : 'space-y-3'}
    >
      {/* Un ícono en las tarjetas y «Eliminar» en el panel; mientras elimina
          de HeyGen, «Eliminando…» (su nombre es ese texto y lo describe el
          avatar). En la tarjeta de la biblioteca el botón sigue del tamaño
          del ícono y el texto queda para el lector de pantalla: en la fila
          del nombre, una pastilla ancha dejaba el nombre en cero. */}
      <Button
        ref={triggerRef}
        type="button"
        data-avatar-delete
        variant={triggerVariant(variant)}
        size={triggerSize(variant)}
        aria-label={
          deleting ? undefined : t('avatars.eliminar.botonAria', { name })
        }
        aria-expanded={open}
        aria-controls={panelId}
        aria-disabled={busy}
        aria-describedby={deleting ? nameId : undefined}
        onClick={toggle}
        onKeyDown={ignoreHeldKey}
        className={triggerClassName(variant, { open, deleting, disabled })}
      >
        <Trash2
          aria-hidden
          className={cn('h-4 w-4 shrink-0', deleting && 'hidden')}
        />
        <Loader2
          aria-hidden
          className={cn('h-4 w-4 shrink-0 animate-spin', !deleting && 'hidden')}
        />
        <span
          hidden={overImage && !deleting}
          className={variant === 'library' ? 'sr-only' : 'min-w-0 truncate'}
        >
          {deleting
            ? t('avatars.eliminar.eliminando')
            : t('avatars.eliminar.boton')}
        </span>
      </Button>
      <span id={nameId} hidden>
        {name}
      </span>

      {/* Lo que no está a la vista lleva el atributo `hidden` (y el velo
          cerrado, `inert`): fuera del orden del Tab y del lector de pantalla
          también sin CSS. Los botones del kit llevan además la clase
          `hidden`, que le gana a su `inline-flex` (el `[hidden]` de Tailwind
          no). */}
      <div
        ref={panelRef}
        id={panelId}
        role="group"
        aria-label={t('avatars.eliminar.opcionesAria', { name })}
        hidden={!overImage && !open}
        inert={overImage && !open}
        onClick={closeFromVeil}
        className={panelClassName(variant, open)}
      >
        <p
          id={warningId}
          hidden={!confirming}
          className={warningClassName(variant)}
        >
          {t('avatars.eliminar.confirmarHeygen')}
        </p>
        {/* Los lugares no se cruzan: al pedir «Seguro», «Cancelar» toma el de
            «Eliminar de la lista» (va antes y la lista se oculta) y «Seguro»
            es el mismo botón de HeyGen, que no se mueve (`optionsClassName`).
            Un clic de corrección hacia la opción inofensiva nunca cae en la
            confirmación del borrado. */}
        <div className={optionsClassName(variant)}>
          <Button
            type="button"
            variant={overImage ? null : 'outline'}
            size={overImage ? null : 'sm'}
            hidden={!confirming}
            onClick={cancel}
            className={cn(
              optionClassName(variant, 'neutral'),
              !confirming && 'hidden',
            )}
          >
            {t('avatars.eliminar.cancelar')}
          </Button>
          <Button
            type="button"
            variant={overImage ? null : 'outline'}
            size={overImage ? null : 'sm'}
            hidden={listHidden}
            aria-disabled={busy}
            onClick={removeFromList}
            onKeyDown={ignoreHeldKey}
            className={cn(
              optionClassName(variant, 'neutral'),
              listHidden && 'hidden',
            )}
          >
            {t('avatars.eliminar.deLista')}
          </Button>
          {/* El mismo botón pide «Seguro» y elimina: el foco no se mueve al
              armar. Armado, lo describe la advertencia. */}
          <Button
            type="button"
            variant={overImage ? null : 'destructive'}
            size={overImage ? null : 'sm'}
            hidden={heyGenHidden}
            aria-disabled={busy}
            aria-describedby={confirming ? warningId : undefined}
            onClick={deleteFromHeyGen}
            onKeyDown={ignoreHeldKey}
            className={cn(
              optionClassName(variant, 'danger'),
              heyGenHidden && 'hidden',
            )}
          >
            {confirming
              ? t('avatars.eliminar.seguro')
              : t('avatars.eliminar.deHeygen')}
          </Button>
        </div>
      </div>
    </div>
  )
}
