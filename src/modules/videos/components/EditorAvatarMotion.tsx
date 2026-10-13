import { useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Hand, RotateCcw } from 'lucide-react'
import { Label } from '@/modules/common/ui/label'
import { Switch } from '@/modules/common/ui/switch'
import { Textarea } from '@/modules/common/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/modules/common/ui/tooltip'
import { cn } from '@/modules/common/utilities/cn'
import { EditorAvatarHelpTooltip } from '@/modules/videos/components/EditorAvatarHelpTooltip'
import { EditorAvatarMotionGuide } from '@/modules/videos/components/EditorAvatarMotionGuide'
import {
  AVATAR_ENGINE_DESCRIPTION_KEYS,
  AVATAR_ENGINE_LABEL_KEYS,
} from '@/modules/videos/constants'
import { singleLineMotionPrompt } from '@/modules/videos/utilities/avatarRegeneration'
import {
  AVATAR_MOTION_PROMPT_LIMIT,
  avatarMotionSupport,
} from '@pipeline/types/avatar.ts'
import type { ChangeEvent, KeyboardEvent } from 'react'
import type { AvatarMotionDraft } from '@/modules/videos/types/library'
import type { SceneAvatarView } from '@pipeline/types/avatar.ts'

interface EditorAvatarMotionProps {
  // La escena de avatar elegida: V, o IV con un look de foto.
  avatar: SceneAvatarView
  // El borrador del movimiento de esa escena (useAvatarSceneRender).
  value: AvatarMotionDraft
  // Otra tarea del proyecto en curso, o la demo: los controles esperan.
  disabled: boolean
  onChange(patch: Partial<AvatarMotionDraft>): void
}

// La sección «Movimiento» de una escena de avatar con V o IV (entrega 2e,
// §21.4), compacta desde la 2g (§23.4) para que la tarjeta desplegada de la
// vista ampliada entre sin scroll y el panel la ponga en una columna: sin caja
// ni párrafo del motor (el nombre del motor, con la descripción en un
// tooltip), el prompt de movimiento en tres renglones con su contador y su
// ayuda, «Usar el automático» como un enlace si se apartó del que escribió
// Vimo, «Movimiento más expresivo» en una línea con su tooltip —solo con IV y
// un look de foto, el único motor donde el proveedor tiene `expressiveness`
// (§23.1)— y «Qué podés pedir» como un botón que abre la guía en un globo. El
// prompt es de una sola línea: Enter no agrega saltos y los que llegan
// pegados se vuelven espacios. Si el proveedor ya rechazó el movimiento
// (`motionUnsupported`), una nota arriba del campo, que sigue editable con su
// ayuda y su guía: el rechazo puede no ser del look (un prompt demasiado
// largo) y con otro prompt el sidecar vuelve a probar (ronda 2, hallazgo 2 de
// la revisión final). El interruptor queda apagado. Lo editado viaja con
// «Generar» o «Regenerar» de la escena. Presentacional.
export function EditorAvatarMotion({
  avatar,
  value,
  disabled,
  onChange,
}: EditorAvatarMotionProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const promptId = useId()
  const hintId = useId()
  const expressiveId = useId()
  const promptRef = useRef<HTMLTextAreaElement>(null)

  const engineLabel = t(AVATAR_ENGINE_LABEL_KEYS[avatar.engine])
  const unsupported = avatar.motionUnsupported === true
  const support = avatarMotionSupport(avatar.engine, avatar.lookType)
  const prompt = value.motionPrompt
  const automatic = avatar.autoMotionPrompt
  const canUseAutomatic = Boolean(automatic) && prompt.trim() !== automatic

  // El botón se va al usarlo: el foco pasa al campo y no cae en `body`.
  const applyAutomatic = () => {
    if (!automatic) return

    onChange({ motionPrompt: automatic })
    promptRef.current?.focus()
  }

  // Una sola línea: Enter no agrega saltos, tampoco las repeticiones de un
  // Enter sostenido sobre «Usar el automático», que llegan al campo cuando el
  // botón le pasa el foco (M1 de la revisión). El Enter que confirma lo que
  // se compone con un método de entrada (IME) sigue pasando.
  const ignoreEnter = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return

    event.preventDefault()
  }

  // Lo que llega pegado con saltos de línea queda en una sola línea.
  const changePrompt = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onChange({ motionPrompt: singleLineMotionPrompt(event.target.value) })
  }

  return (
    <div role="group" aria-labelledby={titleId} className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <Hand aria-hidden className="h-4 w-4 text-amethyst" />
        <p
          id={titleId}
          className="font-display text-sm font-bold text-foreground"
        >
          {t('library.editor.avatar.movimientoTitulo')}
        </p>
        <span aria-hidden className="text-muted-foreground">
          ·
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            {/* Botón y no texto suelto: el tooltip también se abre con el
                teclado, como en LabeledSelect. */}
            <button
              type="button"
              aria-label={t('library.editor.avatar.motorAyudaAria', {
                engine: engineLabel,
              })}
              className="rounded font-body text-xs text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground focus:outline-none focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-amethyst"
            >
              {engineLabel}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs font-body text-xs">
            {t(AVATAR_ENGINE_DESCRIPTION_KEYS[avatar.engine])}
          </TooltipContent>
        </Tooltip>
      </div>

      {unsupported && (
        <p className="rounded-lg border border-saffron/40 bg-saffron/10 p-2 font-body text-xs text-foreground">
          {t('library.editor.avatar.movimientoNoAdmitido', {
            engine: engineLabel,
          })}
        </p>
      )}

      {support.motionPrompt && (
        <div className="space-y-1">
          <Label htmlFor={promptId} className="sr-only">
            {t('library.editor.avatar.movimientoLabel')}
          </Label>
          <Textarea
            ref={promptRef}
            id={promptId}
            value={prompt}
            rows={3}
            maxLength={AVATAR_MOTION_PROMPT_LIMIT}
            disabled={disabled}
            aria-describedby={hintId}
            placeholder={t('library.editor.avatar.movimientoPlaceholder')}
            onKeyDown={ignoreEnter}
            onChange={changePrompt}
            className="min-h-0 resize-y px-3 py-2 font-body text-sm"
          />
          {/* Como el prompt de la escena: la ayuda a la izquierda y el
              contador a la derecha. */}
          <div className="flex items-start justify-between gap-3 font-body text-[11px] text-muted-foreground">
            <p id={hintId} className="leading-snug">
              {t(motionHintKey(prompt, automatic))}
            </p>
            <span
              className={cn(
                'shrink-0 font-mono tabular-nums',
                prompt.length >= AVATAR_MOTION_PROMPT_LIMIT &&
                  'text-coral-text',
              )}
            >
              {t('library.editor.avatar.movimientoCaracteres', {
                used: prompt.length,
                max: AVATAR_MOTION_PROMPT_LIMIT,
              })}
            </span>
          </div>
          {canUseAutomatic && (
            <button
              type="button"
              disabled={disabled}
              onClick={applyAutomatic}
              className="inline-flex items-center gap-1 rounded font-body text-xs font-semibold text-foreground underline decoration-amethyst underline-offset-2 transition-colors hover:text-amethyst focus:outline-none focus-visible:ring-2 focus-visible:ring-amethyst disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw aria-hidden className="h-3 w-3" />
              {t('library.editor.avatar.movimientoAutomatico')}
            </button>
          )}
        </div>
      )}

      {/* El interruptor y la guía en una fila: la tarjeta desplegada de la
          vista ampliada entra sin scroll. Si no caben, la guía baja. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {support.expressiveness && (
          <div className="flex items-center gap-2">
            <Switch
              id={expressiveId}
              checked={value.expressive}
              disabled={disabled || unsupported}
              onCheckedChange={(checked) => onChange({ expressive: checked })}
              className="data-[state=checked]:bg-amethyst"
            />
            <Label htmlFor={expressiveId} className="font-body text-xs">
              {t('library.editor.avatar.expresivo')}
            </Label>
            <EditorAvatarHelpTooltip
              label={t('library.editor.avatar.expresivoAyudaAria')}
            >
              {t('library.editor.avatar.expresivoTooltip')}
            </EditorAvatarHelpTooltip>
          </div>
        )}
        {support.motionPrompt && <EditorAvatarMotionGuide />}
      </div>
    </div>
  )
}

// La ayuda del campo según de quién es el prompt (ronda 1 de WP-X): vacío y
// sin automático todavía, que Vimo lo escribe al generar la aparición (§21.2);
// vacío con un automático, que se usa el movimiento propio del motor; el
// automático, que lo escribió Vimo; y uno propio, que ese se usa.
function motionHintKey(prompt: string, automatic: string | undefined): string {
  const text = prompt.trim()
  if (!text && !automatic) return 'library.editor.avatar.movimientoPendiente'

  if (!text) return 'library.editor.avatar.movimientoVacio'

  if (text === automatic) return 'library.editor.avatar.movimientoHint'

  return 'library.editor.avatar.movimientoPropio'
}
