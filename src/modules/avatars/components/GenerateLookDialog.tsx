import { useId, useLayoutEffect, useRef, useState } from 'react'
import type { Ref, RefObject } from 'react'
import { flushSync } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  Coins,
  ImagePlus,
  Loader2,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  X,
} from 'lucide-react'
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
import { Textarea } from '@/modules/common/ui/textarea'
import { cn } from '@/modules/common/utilities/cn'
import { formatUsd } from '@/modules/common/utilities/formatUsd'
import { avatarsApi } from '@/modules/avatars/api'
import { AvatarBalanceBadge } from '@/modules/avatars/components/AvatarBalanceBadge'
import { LookPreview } from '@/modules/avatars/components/LookPreview'
import {
  AVATAR_ASPECT_RATIO_FRAME_CLASSES,
  AVATAR_ASPECT_RATIO_LABEL_KEYS,
  AVATAR_ASPECT_RATIOS,
  AVATAR_LOOK_GENERATION_USD,
  AVATAR_NAME_LIMIT,
  AVATAR_PROMPT_LIMIT,
  AVATAR_REFERENCE_IMAGES_MAX,
} from '@/modules/avatars/constants'
import { useAvatarMutations } from '@/modules/avatars/hooks/useAvatarMutations'
import type {
  AvatarAspectRatio,
  AvatarSummary,
} from '@pipeline/types/avatar.ts'

interface GenerateLookDialogProps {
  avatar: AvatarSummary
  // Formato con el que arranca (el del video, desde el enlace de Crear,
  // ADR-0057 §9); sin él, `auto` como siempre.
  initialAspectRatio?: AvatarAspectRatio
  // Adónde vuelve el foco al cerrar: la ficha que lo abrió. Sin
  // `DialogTrigger` (el diálogo se monta solo mientras está abierto) Radix lo
  // dejaría en `<body>`, en medio del panel del avatar.
  returnFocusRef?: RefObject<HTMLElement | null>
  onClose: () => void
}

// «Crear escenario», la edición personalizada de HeyGen: un look nuevo del
// avatar descripto con palabras (ropa, lugar, luz), en el formato elegido y
// con hasta AVATAR_REFERENCE_IMAGES_MAX imágenes de referencia. Vimo lo genera
// a partir del look principal y lo suma a los looks del avatar; el sondeo de
// la biblioteca lo ve terminar. Al pie, lo que cuesta y el saldo actual, para
// decidir con el número a la vista. Repetir la misma descripción, formato y
// referencias devuelve el mismo look sin cobrar (idempotencia del sidecar):
// el consejo bajo la descripción lo dice. No se cierra mientras genera (ni
// con la X, que se apaga), y el foco no sale de él. Se monta solo mientras
// está abierto.
export function GenerateLookDialog({
  avatar,
  initialAspectRatio,
  returnFocusRef,
  onClose,
}: GenerateLookDialogProps) {
  const { t, i18n } = useTranslation()
  const { generateLook, saving } = useAvatarMutations()
  const [prompt, setPrompt] = useState('')
  const [aspectRatio, setAspectRatio] = useState<AvatarAspectRatio>(
    initialAspectRatio ?? 'auto',
  )
  const [referencePaths, setReferencePaths] = useState<string[]>([])
  const [name, setName] = useState('')
  // La validación de la descripción: se muestra pegada al campo, que es lo
  // que queda a la vista (el cuerpo tiene scroll y el botón vive en el pie).
  const [promptErrorKey, setPromptErrorKey] = useState<string | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const addReferencesRef = useRef<HTMLButtonElement>(null)
  const generateRef = useRef<HTMLButtonElement>(null)
  // Guarda síncrona contra el doble envío de algo que cobra: `saving` llega
  // al render una tarea después (TanStack avisa con setTimeout), así que dos
  // clics en la misma tarea pasarían los dos.
  const submittingRef = useRef(false)
  // Tras un fallo del sidecar el foco vuelve a «Generar look» cuando se
  // habilita de nuevo.
  const refocusGenerateRef = useRef(false)
  const promptId = useId()
  const promptHintId = useId()
  const promptErrorId = useId()
  const formatLabelId = useId()
  const referencesLabelId = useId()
  const nameId = useId()

  // Mientras genera se apagan los controles y la X: el foco espera en la caja
  // del diálogo, que el `FocusScope` de Radix mantiene adentro. Si quedara en
  // un control apagado, Tab saldría a la página de atrás y Enter podría
  // activar algo ahí con la generación cobrando. De layout: el foco se mueve
  // en el mismo commit que apaga los controles, antes de cualquier tecla.
  useLayoutEffect(() => {
    if (saving) {
      contentRef.current?.focus()
      return
    }

    if (!refocusGenerateRef.current) return

    refocusGenerateRef.current = false
    generateRef.current?.focus()
  }, [saving])

  // La vista previa del avatar es la de su look principal: la base del look
  // nuevo.
  const cover = avatar.previewPath
    ? avatarsApi.imageSource(avatar.previewPath)
    : undefined
  // HeyGen no publica el precio por look (null): no se promete una cifra.
  const price =
    AVATAR_LOOK_GENERATION_USD === null
      ? null
      : formatUsd(AVATAR_LOOK_GENERATION_USD, i18n.resolvedLanguage ?? 'es')

  const changePrompt = (value: string) => {
    setPrompt(value)
    setPromptErrorKey(null)
  }

  const addReferences = async () => {
    const picked = await avatarsApi.pickReferenceImages()
    if (picked.length === 0) return

    // Una imagen ya elegida no se repite; las que no entran en los lugares
    // libres se descartan desde el final.
    setReferencePaths((current) => {
      const added = picked.filter((path) => !current.includes(path))
      return [...current, ...added].slice(0, AVATAR_REFERENCE_IMAGES_MAX)
    })
  }

  const removeReference = (path: string) => {
    // El foco pasa a «Agregar imágenes», que con un lugar libre siempre está:
    // si se quedara en el botón que se desmonta, el diálogo lo devolvería a
    // su caja y el próximo Tab arrancaría de nuevo.
    flushSync(() => {
      setReferencePaths((current) => current.filter((item) => item !== path))
    })
    addReferencesRef.current?.focus()
  }

  const generate = async () => {
    if (submittingRef.current) return

    const description = prompt.trim()
    if (!description) {
      setPromptErrorKey('avatars.errors.promptRequired')
      promptRef.current?.focus()
      return
    }

    setPromptErrorKey(null)
    const lookName = name.trim()
    submittingRef.current = true
    try {
      // Los errores del sidecar (moderación, saldo, red…) los muestra la
      // mutación como aviso; el diálogo queda abierto con lo escrito.
      const result = await generateLook({
        id: avatar.id,
        prompt: description,
        aspectRatio,
        ...(referencePaths.length > 0
          ? { referenceImagePaths: referencePaths }
          : {}),
        ...(lookName ? { name: lookName } : {}),
      }).catch(() => null)
      if (!result) {
        refocusGenerateRef.current = true
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
        className="flex max-h-[90vh] max-w-lg flex-col gap-0 overflow-hidden p-0 outline-none sm:rounded-2xl"
        // Se arranca por la descripción, que es lo único obligatorio.
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          promptRef.current?.focus()
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          returnFocusRef?.current?.focus()
        }}
      >
        <DialogHeader className="flex-row items-start gap-4 space-y-0 px-6 pb-4 pr-12 pt-6 text-left">
          <LookPreview
            imageUrl={cover}
            alt={t('avatars.stock.previewAria', { name: avatar.name })}
            doodleSize={28}
            className="aspect-[4/5] w-14 shrink-0 rounded-xl ring-1 ring-border"
          />
          <div className="min-w-0 space-y-1.5">
            <DialogTitle className="break-words font-display text-xl font-bold leading-tight">
              {t('avatars.generar.titulo', { name: avatar.name })}
            </DialogTitle>
            <DialogDescription className="font-body text-sm leading-relaxed text-muted-foreground">
              {t('avatars.generar.descripcion')}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-6 pt-1">
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <Label
                htmlFor={promptId}
                className="font-display text-sm font-semibold"
              >
                {t('avatars.generar.prompt')}
              </Label>
              <span
                className={cn(
                  'font-mono text-[11px] tabular-nums',
                  prompt.length >= AVATAR_PROMPT_LIMIT
                    ? 'text-coral-text'
                    : 'text-muted-foreground',
                )}
              >
                {t('avatars.generar.contador', {
                  count: prompt.length,
                  max: AVATAR_PROMPT_LIMIT,
                })}
              </span>
            </div>
            {/* Inválida, el borde va en el color del texto de error (el
                `Textarea` del kit no estiliza `aria-invalid`), también con el
                foco y bajo el mouse. */}
            <Textarea
              ref={promptRef}
              id={promptId}
              value={prompt}
              rows={4}
              maxLength={AVATAR_PROMPT_LIMIT}
              disabled={saving}
              aria-invalid={promptErrorKey !== null}
              aria-errormessage={promptErrorKey ? promptErrorId : undefined}
              aria-describedby={
                promptErrorKey
                  ? `${promptErrorId} ${promptHintId}`
                  : promptHintId
              }
              placeholder={t('avatars.generar.promptPlaceholder')}
              onChange={(event) => changePrompt(event.target.value)}
              className={cn(
                'resize-y font-body',
                promptErrorKey &&
                  'border-destructive-text hover:border-destructive-text focus-visible:border-destructive-text focus-visible:ring-destructive-text/25',
              )}
            />
            {promptErrorKey && (
              <p
                id={promptErrorId}
                role="alert"
                className="flex items-start gap-1.5 font-body text-xs font-semibold leading-snug text-destructive-text"
              >
                <AlertCircle
                  aria-hidden
                  className="mt-px h-3.5 w-3.5 shrink-0"
                />
                {t(promptErrorKey)}
              </p>
            )}
            <p
              id={promptHintId}
              className="font-body text-xs leading-relaxed text-muted-foreground"
            >
              {t('avatars.generar.variarHint')}
            </p>
          </div>

          <div className="space-y-2">
            <p
              id={formatLabelId}
              className="font-display text-sm font-semibold text-foreground"
            >
              {t('avatars.generar.formato')}
            </p>
            <AspectRatioPicker
              value={aspectRatio}
              disabled={saving}
              labelledBy={formatLabelId}
              onChange={setAspectRatio}
            />
          </div>

          <div className="space-y-2">
            <p
              id={referencesLabelId}
              className="font-display text-sm font-semibold text-foreground"
            >
              {t('avatars.generar.referencias', {
                max: AVATAR_REFERENCE_IMAGES_MAX,
              })}
            </p>
            <ReferenceImages
              paths={referencePaths}
              disabled={saving}
              labelledBy={referencesLabelId}
              addButtonRef={addReferencesRef}
              onAdd={() => void addReferences()}
              onRemove={removeReference}
            />
            <p className="font-body text-xs leading-relaxed text-muted-foreground">
              {t('avatars.generar.referenciasHint')}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor={nameId}
              className="font-display text-sm font-semibold"
            >
              {t('avatars.generar.nombre')}
            </Label>
            <Input
              id={nameId}
              value={name}
              maxLength={AVATAR_NAME_LIMIT}
              disabled={saving}
              placeholder={t('avatars.generar.nombrePlaceholder')}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <p className="flex items-start gap-2.5 rounded-xl bg-muted/50 px-3.5 py-3 font-body text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck aria-hidden className="mt-px h-4 w-4 shrink-0" />
            {t('avatars.generar.normas')}
          </p>
        </div>

        <div className="space-y-4 border-t border-border px-6 pb-6 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 basis-56 items-center gap-2.5">
              {price === null ? (
                <>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-saffron/50 bg-saffron/15 text-foreground">
                    <Coins aria-hidden className="h-4 w-4" />
                  </span>
                  <span className="font-body text-xs leading-relaxed text-muted-foreground">
                    {t('avatars.generar.costoDesconocido')}
                  </span>
                </>
              ) : (
                <>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border-2 border-saffron/50 bg-saffron/15 px-3 py-1 font-display text-sm font-extrabold tabular-nums text-foreground">
                    <Coins aria-hidden className="h-4 w-4" />
                    {price}
                  </span>
                  <span className="font-body text-xs text-muted-foreground">
                    {t('avatars.generar.costoDetalle')}
                  </span>
                </>
              )}
            </div>
            <AvatarBalanceBadge />
          </div>

          <DialogFooter className="gap-2 sm:space-x-0">
            <Button
              variant="ghost"
              disabled={saving}
              onClick={onClose}
              className="rounded-xl font-display"
            >
              {t('avatars.generar.cancelar')}
            </Button>
            <Button
              ref={generateRef}
              disabled={saving}
              onClick={() => void generate()}
              className="rounded-xl font-display font-bold"
            >
              {saving ? (
                <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles aria-hidden className="h-4 w-4" />
              )}
              {t('avatars.generar.generar')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface AspectRatioPickerProps {
  value: AvatarAspectRatio
  disabled: boolean
  // Id del título «Formato» que nombra al grupo.
  labelledBy: string
  onChange: (value: AvatarAspectRatio) => void
}

// Los formatos como fichas, cada una con su forma dibujada a escala (una
// fila de seis; tres por fila en ventanas angostas). Presentacional.
function AspectRatioPicker({
  value,
  disabled,
  labelledBy,
  onChange,
}: AspectRatioPickerProps) {
  const { t } = useTranslation()

  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className="grid grid-cols-3 gap-2 sm:grid-cols-6"
    >
      {AVATAR_ASPECT_RATIOS.map((ratio) => {
        const selected = ratio === value
        const frameClass = AVATAR_ASPECT_RATIO_FRAME_CLASSES[ratio]

        return (
          <button
            key={ratio}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onChange(ratio)}
            className={cn(
              'flex flex-col items-center gap-1.5 rounded-xl border-2 px-1 pb-2 pt-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60',
              selected
                ? 'border-saffron bg-saffron/15 text-foreground'
                : 'border-border text-muted-foreground hover:border-saffron/40 hover:text-foreground',
            )}
          >
            <span aria-hidden className="flex h-7 items-center justify-center">
              {frameClass ? (
                <span
                  className={cn(
                    'rounded-[4px] border-2 border-current',
                    frameClass,
                  )}
                />
              ) : (
                <WandSparkles className="h-5 w-5" />
              )}
            </span>
            <span className="text-center font-display text-[11px] font-bold leading-tight">
              {t(AVATAR_ASPECT_RATIO_LABEL_KEYS[ratio])}
            </span>
          </button>
        )
      })}
    </div>
  )
}

interface ReferenceImagesProps {
  paths: string[]
  disabled: boolean
  // Id del título de la sección, que nombra a la lista.
  labelledBy: string
  // «Agregar imágenes»: recibe el foco cuando se quita una imagen.
  addButtonRef: Ref<HTMLButtonElement>
  onAdd: () => void
  onRemove: (path: string) => void
}

// Las imágenes de referencia elegidas, cuadradas y con su botón de quitar, y
// al final el lugar para agregar más mientras queden libres. Viajan como
// rutas: el sidecar las valida (JPG o PNG de hasta 12 MB) y las sube. La
// miniatura sale del protocolo `asset` de Tauri, que solo sirve archivos de la
// carpeta personal: una imagen de otro disco se envía igual y en la miniatura
// queda el dibujo de respaldo de LookPreview, no una imagen rota.
// Presentacional.
function ReferenceImages({
  paths,
  disabled,
  labelledBy,
  addButtonRef,
  onAdd,
  onRemove,
}: ReferenceImagesProps) {
  const { t } = useTranslation()

  return (
    <ul aria-labelledby={labelledBy} className="flex flex-wrap gap-2.5">
      {paths.map((path, index) => (
        <li key={path} className="relative">
          <LookPreview
            imageUrl={avatarsApi.imageSource(path)}
            alt={t('avatars.generar.referencia', { n: index + 1 })}
            focus="center"
            doodleSize={28}
            className="aspect-square w-16 rounded-xl ring-1 ring-border"
          />
          <button
            type="button"
            disabled={disabled}
            aria-label={t('avatars.generar.quitarReferencia', { n: index + 1 })}
            onClick={() => onRemove(path)}
            className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-foreground text-background shadow-sm transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
          >
            <X aria-hidden strokeWidth={3} className="h-3 w-3" />
          </button>
        </li>
      ))}
      {paths.length < AVATAR_REFERENCE_IMAGES_MAX && (
        <li>
          <button
            ref={addButtonRef}
            type="button"
            disabled={disabled}
            onClick={onAdd}
            className="flex aspect-square w-16 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border bg-muted/30 px-1 text-muted-foreground transition-colors hover:border-saffron/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border"
          >
            <ImagePlus aria-hidden className="h-5 w-5" />
            <span className="text-center font-display text-[10px] font-bold leading-tight">
              {t('avatars.generar.agregarReferencias')}
            </span>
          </button>
        </li>
      )}
    </ul>
  )
}
