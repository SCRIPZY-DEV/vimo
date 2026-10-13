import { useTranslation } from 'react-i18next'
import { Button } from '@/modules/common/ui/button'
import type { SceneDetail } from '@pipeline/types/video-project.ts'

interface EditorFlowSceneSelectionProps {
  scenes: SceneDetail[]
  selectedIds: number[]
  occupiedIds: ReadonlySet<number>
  disabled: boolean
  onToggle(sceneId: number): void
  onClear(): void
}

export function EditorFlowSceneSelection({
  scenes,
  selectedIds,
  occupiedIds,
  disabled,
  onToggle,
  onClear,
}: EditorFlowSceneSelectionProps) {
  const { t } = useTranslation()
  const selectedCount = scenes.filter((scene) =>
    selectedIds.includes(scene.id),
  ).length

  if (scenes.length === 0) return null

  return (
    <details className="rounded-xl border border-border p-3">
      <summary className="cursor-pointer font-display text-sm font-bold">
        {t('library.editor.panel.multipleScenes', {
          count: selectedCount,
        })}
      </summary>
      <p className="my-2 font-body text-xs text-muted-foreground">
        {t('library.editor.panel.multipleScenesHint')}
      </p>
      <div className="max-h-48 space-y-2 overflow-y-auto">
        {scenes.map((scene) => (
          <label
            key={scene.id}
            className="flex items-start gap-2 font-body text-xs"
          >
            <input
              type="checkbox"
              className="mt-0.5 accent-saffron"
              checked={selectedIds.includes(scene.id)}
              disabled={disabled || occupiedIds.has(scene.id)}
              onChange={() => onToggle(scene.id)}
            />
            <span className="min-w-0">
              <span className="font-semibold">
                {t('library.editor.panel.sceneTitle', { id: scene.id })}
              </span>
              {occupiedIds.has(scene.id) && (
                <span className="ml-2 text-muted-foreground">
                  {t('library.editor.panel.alreadyQueued')}
                </span>
              )}
              <span className="block line-clamp-2 text-muted-foreground">
                {scene.text}
              </span>
            </span>
          </label>
        ))}
      </div>
      {selectedCount > 0 && (
        <Button variant="ghost" size="sm" className="mt-2" onClick={onClear}>
          {t('library.editor.panel.clearSelection')}
        </Button>
      )}
    </details>
  )
}
