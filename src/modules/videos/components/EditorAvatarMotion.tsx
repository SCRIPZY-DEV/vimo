import { useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Hand, HelpCircle, RotateCcw } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { Label } from '@/modules/common/ui/label'
import { Switch } from '@/modules/common/ui/switch'
import { Textarea } from '@/modules/common/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/modules/common/ui/tooltip'
import { cn } from '@/modules/common/utilities/cn'
import { EditorAvatarMotionGuide } from '@/modules/videos/components/EditorAvatarMotionGuide'
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

// La sección «Movimiento» del panel de una escena de avatar con V o IV
// (entrega 2e, §21.4): el motor de la escena (el editor no lo cambia,
// R-2e-8), el prompt de movimiento en un campo editable con su contador y su
// ayuda, «Usar el automático» si se apartó del que escribió Vimo, el
// interruptor «Movimiento más expresivo» con su tooltip y la guía «Qué podés
// pedir». El prompt es de una sola línea: Enter no agrega saltos y los que
// llegan pegados se vuelven espacios. Si el proveedor ya rechazó el
// movimiento (`motionUnsupported`), una nota arriba del campo, que sigue
// editable con su ayuda y su guía: el rechazo puede no ser del look (un
// prompt demasiado largo) y con otro prompt el sidecar vuelve a probar
// (ronda 2, hallazgo 2 de la revisión final). El interruptor queda apagado.
// Lo editado viaja con «Generar» o «Regenerar» de la escena. Presentacional.
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

  const engineLabel = t(`avatars.engines.${avatar.engine}`)
  const unsupported = avatar.motionUnsupported === true
  const promptSupported = avatarMotionSupport(
    avatar.engine,
    avatar.lookType,
  ).motionPrompt
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
    <div
      role="group"
      aria-labelledby={titleId}
      className="space-y-3 rounded-xl border border-amethyst/30 bg-amethyst/5 p-3"
    >
      <div className="space-y-0.5">
        <p
          id={titleId}
          className="flex items-center gap-1.5 font-display text-sm font-bold text-foreground"
        >
          <Hand aria-hidden className="h-4 w-4 text-amethyst" />
          {t('library.editor.avatar.movimientoTitulo')}
        </p>
        <p className="font-body text-[11px] leading-snug text-muted-foreground">
          {t('library.editor.avatar.motor', {
            engine: engineLabel,
            description: t(`create.avatar.engineDescription.${avatar.engine}`),
          })}
        </p>
      </div>

      {unsupported && (
        <p className="rounded-lg border border-saffron/40 bg-saffron/10 p-2 font-body text-xs text-foreground">
          {t('library.editor.avatar.movimientoNoAdmitido', {
            engine: engineLabel,
          })}
        </p>
      )}

      {promptSupported && (
        <div className="space-y-1.5">
          <Label htmlFor={promptId} className="font-display">
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
            className="min-h-20 resize-y font-body text-sm"
          />
          {/* Como el prompt de la escena: la ayuda a la izquierda y el
              contador a la derecha. */}
          <div className="flex items-start justify-between gap-3 font-body text-[11px] text-muted-foreground">
            <p id={hintId}>{t(motionHintKey(prompt, automatic))}</p>
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={applyAutomatic}
              className="rounded-xl font-display"
            >
              <RotateCcw aria-hidden className="h-3.5 w-3.5" />
              {t('library.editor.avatar.movimientoAutomatico')}
            </Button>
          )}
        </div>
      )}

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
        <Tooltip>
          <TooltipTrigger asChild>
            {/* Botón y no ícono suelto: el tooltip también se abre con el
                teclado, como en LabeledSelect. */}
            <button
              type="button"
              aria-label={t('library.editor.avatar.expresivoAyudaAria')}
              className="rounded-full text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:text-foreground"
            >
              <HelpCircle aria-hidden className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs font-body text-xs">
            {t('library.editor.avatar.expresivoTooltip')}
          </TooltipContent>
        </Tooltip>
      </div>

      {promptSupported && <EditorAvatarMotionGuide />}
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
