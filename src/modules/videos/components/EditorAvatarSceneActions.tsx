import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { RefreshCw, UserRound } from 'lucide-react'
import { apiKeysFocusPath } from '@/modules/api-keys/constants'
import { Button } from '@/modules/common/ui/button'
import { formatUsd } from '@/modules/common/utilities/formatUsd'
import { EditorAvatarConfirmDialog } from '@/modules/videos/components/EditorAvatarConfirmDialog'
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
}

// El avatar de una escena de avatar desde el panel del editor (entrega 2d,
// spec §11.1, §11.4 y §20): «Generar» si está planeada; «Regenerar» si falló,
// quedó desactualizada o está lista sin clip; y, junto a ese botón, «Regenerar
// todos (N)» cuando hay más de una así. Una lista y al día no ofrece nada. El
// costo se ve antes y la confirmación muestra el saldo antes de pagar.
// Mientras se genera, el avance y «Cancelar». Sin la clave del avatar
// presentador, el aviso de siempre con su enlace. Dueño de su asunto: la
// tarea, el saldo y la confirmación viven en useAvatarSceneRender.
export function EditorAvatarSceneActions({
  projectId,
  scene,
  scenes,
  busy,
  locked,
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
  // abrió si sigue montado o al panel (M1 y M2 de la revisión del WP-Q).
  const focus = useConfirmationFocus()
  const focusAfterRender = () =>
    focus.mountedOpener() ?? document.getElementById(EDITOR_SCENE_PANEL_ID)

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
  const confirmation = avatarRender.confirmation

  const openConfirmation = (opener: HTMLButtonElement, sceneIds: number[]) => {
    focus.rememberOpener(opener)
    avatarRender.requestConfirmation(sceneIds)
  }

  const confirm = async () => {
    focus.afterConfirm(await avatarRender.confirm())
  }

  return (
    // Sin nada que ofrecer (lista y al día) la sección no ocupa lugar: la
    // confirmación se dibuja en un portal, fuera de ella.
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
          {avatarRender.action && avatarRender.sceneCost && (
            <p className="font-body text-xs text-muted-foreground">
              {t('library.editor.avatar.costo', {
                amount: formatUsd(avatarRender.sceneCost.estimated, language),
              })}
            </p>
          )}
          {avatarRender.action && (
            <Button
              type="button"
              onClick={(event) =>
                openConfirmation(event.currentTarget, [scene.id])
              }
              disabled={disabled}
              className="w-full min-w-0 rounded-xl font-display font-bold"
            >
              {avatarRender.action === 'generate' ? (
                <UserRound aria-hidden className="h-4 w-4" />
              ) : (
                <RefreshCw aria-hidden className="h-4 w-4" />
              )}
              <span className="min-w-0 truncate">
                {t(
                  avatarRender.action === 'generate'
                    ? 'library.editor.avatar.generar'
                    : 'library.editor.avatar.regenerar',
                )}
              </span>
            </Button>
          )}
          {avatarRender.action && pendingIds.length > 1 && (
            <Button
              type="button"
              variant="outline"
              onClick={(event) =>
                openConfirmation(event.currentTarget, pendingIds)
              }
              disabled={disabled}
              className="w-full min-w-0 rounded-xl border-amethyst/40 font-display font-bold"
            >
              <RefreshCw aria-hidden className="h-4 w-4" />
              <span className="min-w-0 truncate">
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
