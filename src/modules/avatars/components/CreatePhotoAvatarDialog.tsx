import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Coins, ImagePlus, Loader2, Maximize2, Upload } from 'lucide-react'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { ImageLightbox } from '@/modules/common/components/ImageLightbox'
import { Button } from '@/modules/common/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/modules/common/ui/dialog'
import { Input } from '@/modules/common/ui/input'
import { Label } from '@/modules/common/ui/label'
import { cn } from '@/modules/common/utilities/cn'
import { formatUsd } from '@/modules/common/utilities/formatUsd'
import { avatarsApi } from '@/modules/avatars/api'
import { AvatarConsentCard } from '@/modules/avatars/components/AvatarConsentCard'
import {
  AVATAR_NAME_LIMIT,
  AVATAR_PHOTO_CREATION_USD,
} from '@/modules/avatars/constants'
import { useAvatarMutations } from '@/modules/avatars/hooks/useAvatarMutations'

interface CreatePhotoAvatarDialogProps {
  onClose: () => void
}

// Crear un avatar desde una foto: la foto elegida con el dialog nativo (viaja
// como ruta) se ve vertical y anclada arriba, con la cara a la vista, y se
// amplía al clic; al lado, el nombre. Debajo, la tarjeta de permisos con la
// confirmación obligatoria y, al pie, el precio como badge. Se monta solo
// mientras está abierto.
export function CreatePhotoAvatarDialog({
  onClose,
}: CreatePhotoAvatarDialogProps) {
  const { t, i18n } = useTranslation()
  const { createFromPhoto, saving } = useAvatarMutations()
  const [name, setName] = useState('')
  const [photoPath, setPhotoPath] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)
  // Se intentó crear sin la confirmación: la tarjeta queda en rojo hasta que
  // se marca (cambiar de foto no la limpia: la casilla sigue sin marcar).
  const [consentMissing, setConsentMissing] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const [formErrorKey, setFormErrorKey] = useState<string | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  // La vista previa que abre la foto ampliada: el foco vuelve ahí al cerrarla.
  const zoomButtonRef = useRef<HTMLButtonElement>(null)
  const createRef = useRef<HTMLButtonElement>(null)
  // Guarda síncrona contra el doble envío de algo que cobra: `saving` llega
  // al render una tarea después (TanStack avisa con setTimeout), así que dos
  // clics en la misma tarea pasarían los dos.
  const submittingRef = useRef(false)
  // Tras un fallo del sidecar el foco vuelve a «Crear avatar» cuando se
  // habilita de nuevo.
  const refocusCreateRef = useRef(false)

  // Mientras crea se apagan los controles y la X: el foco espera en la caja
  // del diálogo, que el `FocusScope` de Radix mantiene adentro. Si quedara en
  // un control apagado, Tab saldría a la página de atrás y Enter podría
  // activar algo ahí con la creación cobrando. De layout: el foco se mueve en
  // el mismo commit que apaga los controles, antes de cualquier tecla.
  useLayoutEffect(() => {
    if (saving) {
      contentRef.current?.focus()
      return
    }

    if (!refocusCreateRef.current) return

    refocusCreateRef.current = false
    createRef.current?.focus()
  }, [saving])

  const preview = photoPath ? avatarsApi.imageSource(photoPath) : null
  const price = formatUsd(
    AVATAR_PHOTO_CREATION_USD,
    i18n.resolvedLanguage ?? 'es',
  )

  const pickPhoto = async () => {
    const selected = await avatarsApi.pickPhotoFile()
    if (!selected) return

    setPhotoPath(selected)
    // La confirmación habla de «esta foto»: con otra hay que volver a darla.
    setConsent(false)
    setFormErrorKey(null)
  }

  const changeConsent = (checked: boolean) => {
    setConsent(checked)
    setConsentMissing(false)
    setFormErrorKey(null)
  }

  const save = async () => {
    if (submittingRef.current) return

    if (!name.trim()) {
      setFormErrorKey('avatars.errors.nameRequired')
      return
    }

    if (!photoPath) {
      setFormErrorKey('avatars.errors.photoRequired')
      return
    }

    if (!consent) {
      setFormErrorKey('avatars.errors.consentRequired')
      setConsentMissing(true)
      return
    }

    setFormErrorKey(null)
    submittingRef.current = true
    try {
      const saved = await createFromPhoto({
        name: name.trim(),
        photoPath,
      }).catch(() => null)
      if (!saved) {
        refocusCreateRef.current = true
        return
      }

      onClose()
    } finally {
      submittingRef.current = false
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent
        ref={contentRef}
        closeDisabled={saving}
        className="max-h-[90vh] max-w-xl overflow-y-auto outline-none"
        // Se arranca por el nombre: Radix enfocaría la caja de la foto (el
        // primer control) y su anillo parecería una selección.
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          nameRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold">
            {t('avatars.foto.titulo')}
          </DialogTitle>
          <DialogDescription className="font-body text-sm leading-relaxed text-muted-foreground">
            {t('avatars.foto.descripcion')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex items-start gap-5">
            {/* Vertical y anclada arriba: siempre se ve la cara, no la mitad
                del cuerpo. Vacía, la caja es un atajo del mouse para elegir
                la foto: el teclado y el lector de pantalla usan «Elegir foto»
                de al lado, sin un segundo botón con el mismo nombre. */}
            {preview ? (
              <button
                ref={zoomButtonRef}
                type="button"
                aria-label={t('avatars.foto.ampliar')}
                onClick={() => setZoomed(true)}
                className="group relative aspect-[4/5] w-36 shrink-0 overflow-hidden rounded-2xl border border-border bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <img
                  src={preview}
                  alt=""
                  draggable={false}
                  className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]"
                />
                <span className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm backdrop-blur-sm">
                  <Maximize2 aria-hidden className="h-3.5 w-3.5" />
                </span>
              </button>
            ) : (
              <div
                aria-hidden
                onClick={() => {
                  if (!saving) void pickPhoto()
                }}
                className={cn(
                  'flex aspect-[4/5] w-36 shrink-0 items-center justify-center rounded-2xl border-2 border-dashed border-border bg-muted/30 text-muted-foreground transition-colors',
                  saving
                    ? 'cursor-not-allowed opacity-60'
                    : 'cursor-pointer hover:border-saffron/60 hover:text-foreground',
                )}
              >
                <ImagePlus className="h-7 w-7" />
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="avatar-photo-name">
                  {t('avatars.foto.nombre')}
                </Label>
                <Input
                  ref={nameRef}
                  id="avatar-photo-name"
                  value={name}
                  maxLength={AVATAR_NAME_LIMIT}
                  disabled={saving}
                  placeholder={t('avatars.foto.nombrePlaceholder')}
                  onChange={(event) => {
                    setName(event.target.value)
                    setFormErrorKey(null)
                  }}
                />
              </div>

              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => void pickPhoto()}
                  className="rounded-xl font-display font-semibold"
                >
                  <Upload className="mr-1.5 h-4 w-4" />
                  {preview
                    ? t('avatars.foto.cambiar')
                    : t('avatars.foto.subir')}
                </Button>
                <p className="font-body text-xs leading-relaxed text-muted-foreground">
                  {t('avatars.foto.consejo')}
                </p>
              </div>
            </div>
          </div>

          <AvatarConsentCard
            checked={consent}
            disabled={saving}
            invalid={consentMissing}
            onChange={changeConsent}
          />

          {formErrorKey && <ErrorMessage>{t(formErrorKey)}</ErrorMessage>}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border pt-4">
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border-2 border-saffron/50 bg-saffron/15 px-3 py-1 font-display text-sm font-extrabold tabular-nums text-foreground">
            <Coins aria-hidden className="h-4 w-4" />
            {price}
          </span>
          <span className="font-body text-xs text-muted-foreground">
            {t('avatars.foto.precio.detalle')}
          </span>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            disabled={saving}
            onClick={onClose}
            className="rounded-xl font-display"
          >
            {t('avatars.foto.cancelar')}
          </Button>
          <Button
            ref={createRef}
            disabled={saving}
            onClick={() => void save()}
            className="rounded-xl font-display font-bold"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('avatars.foto.crear')}
          </Button>
        </DialogFooter>

        {zoomed && preview && (
          <ImageLightbox
            src={preview}
            alt={t('avatars.foto.fotoElegida')}
            closeLabel={t('avatars.foto.cerrarFoto')}
            returnFocusRef={zoomButtonRef}
            onClose={() => setZoomed(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
