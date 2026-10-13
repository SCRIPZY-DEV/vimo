import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { RefreshCw, UserRound } from 'lucide-react'
import { apiKeysFocusPath } from '@/modules/api-keys/constants'
import { Button } from '@/modules/common/ui/button'
import { formatUsd } from '@/modules/common/utilities/formatUsd'
import { EditorAvatarConfirmDialog } from '@/modules/videos/components/EditorAvatarConfirmDialog'
import { EditorAvatarMotion } from '@/modules/videos/components/EditorAvatarMotion'
import { EditorAvatarRenderProgress } from '@/modules/videos/components/EditorAvatarRenderProgress'
import { useAvatarRenderPercent } from '@/modules/videos/hooks/useAvatarRenderPercent'
import { useAvatarSceneRender } from '@/modules/videos/hooks/useAvatarSceneRender'
import { useConfirmationFocus } from '@/modules/videos/hooks/useConfirmationFocus'
import { EDITOR_SCENE_PANEL_ID } from '@/modules/videos/constants'
import { errorKeyOf } from '@/modules/videos/utilities/errorKeyOf'
import type { SceneDetail } from '@pipeline/types/video-project.ts'

interface EditorAvatarSceneActionsProps {
  projectId: string
  // La escena de avatar elegida y todas las del proyecto («Regenerar todos»).
  scene: SceneDetail
  scenes: SceneDetail[]
  // Otra tarea del proyecto (o un guardado) en curso: los botones esperan.
  busy: boolean
  // Proyecto demo: no se genera nada.
  locked: boolean
  // Adonde va el foco cuando el avance desaparece con el foco adentro y el
  // botón que abrió la confirmación ya no está: el panel de la escena (por
  // omisión) o, en la vista ampliada, la tarjeta de la escena (entrega 2f).
  focusFallback?(): HTMLElement | null
}

// El panel de la escena: adonde vuelve el foco si nadie dice otro lugar.
function scenePanelElement() {
  return document.getElementById(EDITOR_SCENE_PANEL_ID)
}

// El avatar de una escena de avatar desde el panel del editor (entrega 2d,
// spec §11.1, §11.4 y §20): «Generar» si está planeada; «Regenerar» si falló,
// quedó desactualizada o está lista sin clip; y, junto a ese botón, «Regenerar
// todos (N)» cuando hay más de una así. Desde la entrega 2e (§21.4) una lista
// y al día ofrece «Regenerar» (un render nuevo pagado, sin «Regenerar
// todos»), el costo es el del motor de la escena y, con V o IV si el look
// admite movimiento, la sección «Movimiento» va antes del costo
// (EditorAvatarMotion). El costo se ve antes y la confirmación muestra el
// saldo antes de pagar. Mientras se genera, el avance y «Cancelar». Sin la
// clave del avatar presentador, el aviso de siempre con su enlace. Dueño de su
// asunto: la tarea, el saldo, la confirmación y el borrador del movimiento
// viven en useAvatarSceneRender; el panel y, desde la entrega 2f (§22.4), cada
// tarjeta de avatar de la vista ampliada lo montan con la `key` de la escena,
// así nada de esto pasa de una escena a otra.
export function EditorAvatarSceneActions({
  projectId,
  scene,
  scenes,
  busy,
  locked,
  focusFallback = scenePanelElement,
}: EditorAvatarSceneActionsProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'es'
  const avatarRender = useAvatarSceneRender({ projectId, scene, scenes })
  const rendering = avatarRender.rendering
  const percent = useAvatarRenderPercent(
    rendering && !rendering.queued ? rendering : undefined,
  )

  const sectionRef = useRef<HTMLDivElement>(null)
  const runningRegionRef = useRef<HTMLDivElement>(null)
  // El foco de la confirmación (la abren dos botones sin ser su `Trigger`).
  // Al arrancar va a la región del avance (la escena elegida siempre entra en
  // lo que pide), nunca a su «Cancelar», o a la sección si el job ya cerró.
  // Cuando el avance desaparece con el foco adentro, vuelve al botón que la
  // abrió si sigue montado o al panel (M1 y M2 de la revisión del WP-Q); en la
  // vista ampliada, a la tarjeta: el panel queda detrás de su modal y el foco
  // mandado ahí se escapa del diálogo (medido en Chrome, entrega 2f).
  const focus = useConfirmationFocus()
  const focusAfterRender = () => focus.mountedOpener() ?? focusFallback()

  // Sin la clave, el aviso ocupa el lugar del botón: solo donde habría uno.
  if (avatarRender.missingKey) {
    if (!avatarRender.action) return null

    return (
      <div className="space-y-2">
        <p className="font-body text-xs text-coral-text">
          {t('create.avatar.noKey')}
        </p>
        <Button asChild size="sm" variant="outline">
          <Link to={apiKeysFocusPath(['heygen'])}>
            {t('create.avatar.goToApiKeys')}
          </Link>
        </Button>
      </div>
    )
  }

  if (!avatarRender.canUseHeyGen) return null

  const disabled = busy || locked
  // El motivo guardado, solo en una fallida de verdad: una lista
  // desactualizada que perdió su clip llega como fallida por la descarga
  // («ya está pago») y no lo está, regenerarla paga otro render; esa dice
  // «Desactualizado» como su bloque (ruling del 2026-10-11).
  const failureCode =
    avatarRender.state === 'failed' ? scene.avatar?.errorCode : undefined
  const pendingIds = avatarRender.pendingScenes.map((item) => item.id)
  // «Regenerar todos» va junto al botón de una escena sin clip válido o
  // desactualizada, nunca junto al de una lista (que no cuenta).
  const offersAll = pendingIds.includes(scene.id) && pendingIds.length > 1
  const confirmation = avatarRender.confirmation
  const motion = avatarRender.motion

  const openConfirmation = (opener: HTMLButtonElement, sceneIds: number[]) => {
    focus.rememberOpener(opener)
    avatarRender.requestConfirmation(sceneIds)
  }

  const confirm = async () => {
    focus.afterConfirm(await avatarRender.confirm())
  }

  return (
    // Sin nada que ofrecer (una escena sin tramo) la sección no ocupa lugar:
    // la confirmación se dibuja en un portal, fuera de ella.
    <div
      ref={sectionRef}
      tabIndex={-1}
      className="space-y-2 outline-none empty:hidden"
    >
      {rendering ? (
        <EditorAvatarRenderProgress
          percent={percent}
          regionRef={runningRegionRef}
          focusFallback={focusAfterRender}
          onCancel={avatarRender.cancelRender}
        />
      ) : (
        <>
          {failureCode && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 font-body text-xs text-destructive-text">
              {t('library.editor.avatar.fallo', {
                reason: t(errorKeyOf(failureCode)),
              })}
            </p>
          )}
          {avatarRender.state === 'stale' && (
            <p className="rounded-lg border border-saffron/40 bg-saffron/10 p-2 font-body text-xs text-foreground">
              {t('library.editor.timeline.avatarStaleHint')}
            </p>
          )}
          {motion && scene.avatar && (
            <EditorAvatarMotion
              avatar={scene.avatar}
              value={motion.value}
              disabled={disabled}
              onChange={motion.onChange}
            />
          )}
          {avatarRender.action && avatarRender.sceneCost && (
            <p className="font-body text-xs text-muted-foreground">
              {t('library.editor.avatar.costo', {
                amount: formatUsd(avatarRender.sceneCost.estimated, language),
              })}
            </p>
          )}
          {/* Las etiquetas se parten en dos líneas en vez de cortarse: en la
              tarjeta angosta de la vista ampliada (entrega 2f) «Regenerar
              avatar» quedaba «Regenerar a…»; en el panel entran en una. */}
          {avatarRender.action && (
            <Button
              type="button"
              onClick={(event) =>
                openConfirmation(event.currentTarget, [scene.id])
              }
              disabled={disabled}
              className="h-auto min-h-10 w-full min-w-0 whitespace-normal rounded-xl font-display font-bold"
            >
              {avatarRender.action === 'generate' ? (
                <UserRound aria-hidden className="h-4 w-4" />
              ) : (
                <RefreshCw aria-hidden className="h-4 w-4" />
              )}
              <span className="min-w-0">
                {t(
                  avatarRender.action === 'generate'
                    ? 'library.editor.avatar.generar'
                    : 'library.editor.avatar.regenerar',
                )}
              </span>
            </Button>
          )}
          {offersAll && (
            <Button
              type="button"
              variant="outline"
              onClick={(event) =>
                openConfirmation(event.currentTarget, pendingIds)
              }
              disabled={disabled}
              className="h-auto min-h-10 w-full min-w-0 whitespace-normal rounded-xl border-amethyst/40 font-display font-bold"
            >
              <RefreshCw aria-hidden className="h-4 w-4" />
              <span className="min-w-0">
                {t('library.editor.avatar.regenerarTodos', {
                  count: pendingIds.length,
                })}
              </span>
            </Button>
          )}
          {locked && avatarRender.action && (
            <p className="font-body text-[11px] text-muted-foreground">
              {t('library.editor.demoLocked')}
            </p>
          )}
        </>
      )}

      <EditorAvatarConfirmDialog
        confirmation={confirmation}
        cancelRef={focus.cancelRef}
        onConfirm={() => void confirm()}
        onCancel={avatarRender.dismissConfirmation}
        onCloseAutoFocus={(event) =>
          focus.focusAfterClose(
            event,
            () => runningRegionRef.current ?? sectionRef.current,
          )
        }
      />
    </div>
  )
}
