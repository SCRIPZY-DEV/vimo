import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import { apiKeysApi } from '@/modules/api-keys/api'
import { providerLabel } from '@/modules/api-keys/utilities/providerLabel'
import { CheckboxRow } from '@/modules/common/components/CheckboxRow'
import { ImageCreditsBadges } from '@/modules/common/components/ImageCreditsBadges'
import { InsufficientCreditsAlert } from '@/modules/common/components/InsufficientCreditsAlert'
import { compareCostLines } from '@/modules/common/utilities/compareCostLines'
import { Button } from '@/modules/common/ui/button'
import { Label } from '@/modules/common/ui/label'
import { Textarea } from '@/modules/common/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/modules/common/ui/tooltip'
import { ClipTimeField } from '@/modules/videos/components/ClipTimeField'
import { SceneAnimationSection } from '@/modules/videos/components/SceneAnimationSection'
import { ScenePromptFailureNotice } from '@/modules/videos/components/ScenePromptFailureNotice'
import { SceneQualityPicker } from '@/modules/videos/components/SceneQualityPicker'
import type {
  ClipEdge,
  SceneAnimationControls,
  SceneImageChoice,
} from '@/modules/videos/types/library'
import type { VideoFormat } from '@pipeline/types/video-format.ts'
import { MAX_USER_PROMPT_CHARS } from '@/modules/videos/constants'
import { imageCostEstimate } from '@/modules/videos/utilities/imageCostEstimate'
import { toggleIndex } from '@/modules/videos/utilities/toggleIndex'
import type {
  ImageCreditsResult,
  ProjectCharacter,
  SceneDetail,
} from '@pipeline/types/video-project.ts'

interface EditorScenePanelProps {
  scene: SceneDetail | null
  characters: ProjectCharacter[]
  imageChoice: SceneImageChoice
  videoFormat: VideoFormat
  // Saldos de los proveedores (misma query que el formulario de Crear): la
  // primera carga, el refetch en curso y el botón de refrescar.
  credits: ImageCreditsResult | null
  creditsLoading: boolean
  creditsRefreshing: boolean
  onRefreshCredits(): void
  busy: boolean
  // El guardado por lote de la galería reserva el proyecto brevemente.
  savingScenes?: boolean
  // Proyecto demo: regenerar no aplica (las imágenes son del pack).
  regenerateLocked: boolean
  // Hay una descripción que la imagen actual todavía no refleja.
  userPromptPending: boolean
  // Clave i18n del último fallo de regeneración de esta escena.
  errorKey: string | undefined
  onUserPromptChange(value: string): void
  // Al salir de la textarea la descripción se persiste (como el origen).
  onUserPromptBlur(): void
  // In/Out tipeados: solo las fronteras compartidas con otra escena.
  canEditClipIn: boolean
  canEditClipOut: boolean
  onClipTimeChange(edge: ClipEdge, seconds: number): void
  onImageChoiceChange(value: SceneImageChoice): void
  onCharactersChange(indexes: number[]): void
  onRegenerate(): void
  // Animación de la escena (ADR-0047): proveedor, saldo, estado y acción.
  animation: SceneAnimationControls
}

// Panel lateral del editor para la escena seleccionada. Presentacional: el
// commit y la cola de regeneración viven en la vista.
export function EditorScenePanel({
  scene,
  characters,
  imageChoice,
  videoFormat,
  credits,
  creditsLoading,
  creditsRefreshing,
  onRefreshCredits,
  busy,
  savingScenes = false,
  regenerateLocked,
  userPromptPending,
  errorKey,
  onUserPromptChange,
  onUserPromptBlur,
  canEditClipIn,
  canEditClipOut,
  onClipTimeChange,
  onImageChoiceChange,
  onCharactersChange,
  onRegenerate,
  animation,
}: EditorScenePanelProps) {
  const { t } = useTranslation()

  if (!scene) {
    return (
      <aside className="rounded-2xl border-2 border-border bg-card p-4 lg:h-full lg:overflow-y-auto">
        <p className="font-body text-sm text-muted-foreground">
          {t('library.editor.panel.noSelection')}
        </p>
      </aside>
    )
  }

  const charactersPresent = scene.charactersPresent ?? []
  const toggleCharacter = (index: number) => {
    onCharactersChange(toggleIndex(charactersPresent, index))
  }
  // Una imagen con la calidad elegida contra el saldo leído (ADR-0031):
  // insuficiente frena el botón; ilegible no bloquea (el proveedor dirá).
  const estimate = imageCostEstimate(
    imageChoice.provider,
    imageChoice.quality,
    1,
  )
  const creditsCheck = compareCostLines(
    estimate ? [estimate] : [],
    { image: credits, voice: null },
    providerLabel,
  )

  return (
    <aside className="space-y-4 rounded-2xl border-2 border-border bg-card p-4 lg:h-full lg:overflow-y-auto">
      <div>
        <p className="font-display text-sm font-bold text-foreground">
          {t('library.editor.panel.sceneTitle', { id: scene.id })}
        </p>
        <p className="mt-1 line-clamp-3 font-body text-xs text-muted-foreground">
          {scene.text}
        </p>
      </div>

      {animation.undo ? (
        <p className="rounded-xl border border-sky/30 bg-sky/5 p-3 font-body text-xs leading-relaxed text-muted-foreground">
          {t('library.editor.panel.animation.undoBeforeImage')}
        </p>
      ) : (
        <>
          <ScenePromptFailureNotice failure={scene.promptFailure} />

          <div className="space-y-1.5">
            <Label htmlFor="scene-user-prompt" className="font-display">
              {t('library.editor.panel.userPrompt')}
            </Label>
            <Textarea
              id="scene-user-prompt"
              value={scene.userPrompt ?? ''}
              disabled={savingScenes}
              maxLength={MAX_USER_PROMPT_CHARS}
              placeholder={t('library.editor.panel.userPromptPlaceholder')}
              onChange={(event) => onUserPromptChange(event.target.value)}
              onBlur={onUserPromptBlur}
              className="min-h-32 font-body text-sm"
            />
            {/* Como en el origen: la ayuda a la izquierda, el contador a la
            derecha, y debajo los tiempos de entrada y salida del clip. */}
            <div className="flex items-start justify-between gap-3 font-body text-[11px] text-muted-foreground">
              <p>
                <span className="font-semibold text-foreground">
                  {t('library.editor.panel.promptHintLead')}
                </span>{' '}
                {t('library.editor.panel.promptHint', {
                  max: MAX_USER_PROMPT_CHARS,
                })}
              </p>
              <span className="shrink-0 font-mono tabular-nums">
                {t('library.editor.panel.promptChars', {
                  used: (scene.userPrompt ?? '').length,
                  max: MAX_USER_PROMPT_CHARS,
                })}
              </span>
            </div>
            {scene.startSeconds !== undefined &&
              scene.endSeconds !== undefined && (
                <div className="flex items-center justify-between pt-1 font-body text-xs">
                  <ClipTimeField
                    label={t('library.editor.panel.clipIn')}
                    editLabel={t('library.editor.panel.clipInEdit')}
                    seconds={scene.startSeconds}
                    editable={canEditClipIn}
                    onCommit={(seconds) => onClipTimeChange('in', seconds)}
                  />
                  <ClipTimeField
                    label={t('library.editor.panel.clipOut')}
                    editLabel={t('library.editor.panel.clipOutEdit')}
                    seconds={scene.endSeconds}
                    editable={canEditClipOut}
                    onCommit={(seconds) => onClipTimeChange('out', seconds)}
                  />
                </div>
              )}
          </div>

          <SceneQualityPicker
            value={imageChoice}
            videoFormat={videoFormat}
            disabled={busy}
            onChange={onImageChoiceChange}
          />

          {/* Saldo por proveedor, con el elegido para esta escena resaltado, y
          el botón de refrescar. Tras regenerar, el saldo se vuelve a pedir
          solo (scheduleCreditsRefresh): el botón es para revisarlo a mano. */}
          <ImageCreditsBadges
            credits={credits}
            loading={creditsLoading}
            refreshing={creditsRefreshing}
            active={imageChoice.provider}
            onlyActive
            onRefresh={onRefreshCredits}
          />

          {characters.length > 0 && (
            <div className="space-y-1.5">
              <Label className="font-display">
                {t('library.editor.panel.characters')}
              </Label>
              {characters.map((character, index) => (
                <CheckboxRow
                  key={`${character.name}-${index}`}
                  label={character.name}
                  checked={charactersPresent.includes(index)}
                  disabled={busy}
                  onChange={() => toggleCharacter(index)}
                />
              ))}
            </div>
          )}

          {creditsCheck.blocking && (
            <InsufficientCreditsAlert
              lines={creditsCheck.lines}
              blocking
              onReload={(providerId) =>
                void apiKeysApi.openBillingPage(providerId)
              }
              onRefresh={onRefreshCredits}
              refreshing={creditsLoading || creditsRefreshing}
            />
          )}

          {errorKey && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 font-body text-xs text-destructive">
              {t('library.editor.panel.lastError', { reason: t(errorKey) })}
            </p>
          )}

          {/* Sin precio (se rehacen aparte). Con el panel angosto la etiqueta se
          trunca en vez de salirse del botón junto con el ícono. En un proyecto
          demo el botón queda deshabilitado con el porqué en el tooltip (el
          <span> recibe el hover que un botón deshabilitado no recibe, y con
          tabIndex es también quien llega por teclado para que el foco
          dispare el mismo tooltip). */}
          {regenerateLocked ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="block" tabIndex={0}>
                  <Button
                    disabled
                    className="w-full min-w-0 rounded-xl font-display font-bold"
                  >
                    <RefreshCw className="mr-1.5 h-4 w-4" />
                    <span className="min-w-0 truncate">
                      {t('library.editor.panel.regenerate')}
                    </span>
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-sm leading-snug">
                {t('library.editor.demoLocked')}
              </TooltipContent>
            </Tooltip>
          ) : (
            <Button
              // Sin esto el mousedown le saca el foco a la textarea, su guardado
              // deshabilita el botón y el clic se pierde. Regenerar ya guarda.
              onMouseDown={(event) => event.preventDefault()}
              onClick={onRegenerate}
              disabled={busy || creditsCheck.blocking}
              className="w-full min-w-0 rounded-xl font-display font-bold"
            >
              <RefreshCw className="mr-1.5 h-4 w-4" />
              <span className="min-w-0 truncate">
                {userPromptPending
                  ? t('library.editor.panel.regenerateWithPrompt')
                  : t('library.editor.panel.regenerate')}
              </span>
            </Button>
          )}
        </>
      )}

      <SceneAnimationSection
        scene={scene}
        controls={animation}
        busy={busy}
        locked={regenerateLocked}
      />
    </aside>
  )
}
