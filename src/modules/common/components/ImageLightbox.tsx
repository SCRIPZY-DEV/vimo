import { useRef } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '@/modules/common/ui/dialog'

interface ImageLightboxProps {
  src: string
  // Describe la imagen; también es el título (oculto) del diálogo.
  alt: string
  // La etiqueta del botón de cerrar llega ya traducida: `common` todavía no
  // tiene una clave «Cerrar» compartida.
  closeLabel: string
  onClose: () => void
}

// Una imagen entera y en su formato real (`object-contain`), lo más grande que
// entra en la ventana, sobre el fondo oscurecido del kit. Radix da el cierre
// con Escape y con un clic afuera de la imagen, y atrapa el foco adentro. Se
// monta solo mientras está abierta. El contenido es el primitivo de Radix y
// no el `DialogContent` del kit, que trae su caja de tarjeta y una X propia
// con el texto fijo: acá la caja es la imagen.
export function ImageLightbox({
  src,
  alt,
  closeLabel,
  onClose,
}: ImageLightboxProps) {
  const contentRef = useRef<HTMLDivElement>(null)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPortal>
        <DialogOverlay className="backdrop-blur-sm" />
        {/* `w-max`: con `left-1/2` el ancho automático se cortaría en la
            mitad de la ventana; así la caja mide lo que la imagen. */}
        <DialogPrimitive.Content
          ref={contentRef}
          aria-describedby={undefined}
          // Al abrir, el foco va a la caja y no a la X: así la imagen no
          // aparece con el anillo de foco encima. Tab llega a la X y Escape
          // cierra igual.
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            contentRef.current?.focus()
          }}
          className="fixed left-1/2 top-1/2 z-50 w-max max-w-[90vw] -translate-x-1/2 -translate-y-1/2 outline-none duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-1/2"
        >
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          <img
            src={src}
            alt={alt}
            draggable={false}
            className="block max-h-[88vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
          />
          <DialogClose
            aria-label={closeLabel}
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-background/80 text-foreground shadow-md backdrop-blur-sm transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron"
          >
            <X aria-hidden className="h-4 w-4" />
          </DialogClose>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}
