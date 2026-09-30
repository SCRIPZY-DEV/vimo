import { useTranslation } from 'react-i18next'
import { useSceneTransitions } from '@/modules/videos/hooks/useSceneTransitions'
import type { SceneDetail } from '@pipeline/types/video-project.ts'

interface EditorTransitionToggleProps {
  projectId: string
  scenes: SceneDetail[]
  busy: boolean
}

export function EditorTransitionToggle({
  projectId,
  scenes,
  busy,
}: EditorTransitionToggleProps) {
  const { t } = useTranslation()
  const transitions = useSceneTransitions({ projectId, scenes })
  return (
    <label
      className="flex cursor-pointer items-center gap-2 rounded-xl border border-lavender/40 bg-lavender/10 px-3 py-2 font-body text-xs"
      title={t('library.editor.transitions.hint')}
    >
      <input
        type="checkbox"
        checked={transitions.enabled}
        disabled={busy || transitions.saving || !transitions.available}
        onChange={(event) => transitions.change(event.target.checked)}
        className="h-4 w-4 accent-violet-600"
      />
      {t('library.editor.transitions.label')}
    </label>
  )
}
