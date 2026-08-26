import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import { CheckboxRow } from '@/modules/common/components/CheckboxRow'
import { Button } from '@/modules/common/ui/button'
import { Label } from '@/modules/common/ui/label'
import { Textarea } from '@/modules/common/ui/textarea'
import { ImageCreditsSummary } from '@/modules/videos/components/ImageCreditsSummary'
import { SceneModelQualityPicker } from '@/modules/videos/components/SceneModelQualityPicker'
import type { SceneImageChoice } from '@/modules/videos/types/library'
import { MAX_USER_PROMPT_CHARS } from '@/modules/videos/constants'
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
  credits: ImageCreditsResult | null
  busy: boolean
  userPromptDirty: boolean
  // Clave i18n del último fallo de regeneración de esta escena.
  errorKey: string | undefined
  onUserPromptChange(value: string): void
  // Al salir de la textarea la descripción se persiste (como el origen).
  onUserPromptBlur(): void
  onImageChoiceChange(value: SceneImageChoice): void
  onCharactersChange(indexes: number[]): void
  onRegenerate(): void
}

// Panel lateral del editor para la escena seleccionada. Presentacional: el
// commit y la cola de regeneración viven en la vista.
export function EditorScenePanel({
  scene,
  characters,
  imageChoice,
  credits,
  busy,
  userPromptDirty,
  errorKey,
  onUserPromptChange,
  onUserPromptBlur,
  onImageChoiceChange,
  onCharactersChange,
  onRegenerate,
}: EditorScenePanelProps) {
  const { t } = useTranslation()

  if (!scene) {
    return (
      <aside className="rounded-2xl border-2 border-border bg-card p-4">
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

  return (
    <aside className="space-y-4 rounded-2xl border-2 border-border bg-card p-4">
      <div>
        <p className="font-display text-sm font-bold text-foreground">
          {t('library.editor.panel.sceneTitle', { id: scene.id })}
        </p>
        <p className="mt-1 line-clamp-3 font-body text-xs text-muted-foreground">
          {scene.text}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="scene-user-prompt" className="font-display">
          {t('library.editor.panel.userPrompt')}
        </Label>
        <Textarea
          id="scene-user-prompt"
          value={scene.userPrompt ?? ''}
          maxLength={MAX_USER_PROMPT_CHARS}
          placeholder={t('library.editor.panel.userPromptPlaceholder')}
          onChange={(event) => onUserPromptChange(event.target.value)}
          onBlur={onUserPromptBlur}
          className="min-h-24 font-body text-sm"
        />
        <p className="text-right font-body text-[11px] text-muted-foreground">
          {t('library.editor.panel.promptChars', {
            used: (scene.userPrompt ?? '').length,
            max: MAX_USER_PROMPT_CHARS,
          })}
        </p>
      </div>

      <SceneModelQualityPicker
        value={imageChoice}
        disabled={busy}
        onChange={onImageChoiceChange}
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

      {credits && <ImageCreditsSummary credits={credits} />}

      {errorKey && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 font-body text-xs text-destructive">
          {t('library.editor.panel.lastError', { reason: t(errorKey) })}
        </p>
      )}

      <Button
        onClick={onRegenerate}
        disabled={busy}
        className="w-full rounded-xl font-display font-bold"
      >
        <RefreshCw className="mr-1.5 h-4 w-4" />
        {userPromptDirty
          ? t('library.editor.panel.regenerateWithPrompt')
          : t('library.editor.panel.regenerate')}
      </Button>
    </aside>
  )
}
