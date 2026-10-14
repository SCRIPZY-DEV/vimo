import { useTranslation } from 'react-i18next'
import { ClipTimeField } from '@/modules/videos/components/ClipTimeField'
import type { ClipEdge } from '@/modules/videos/types/library'
import type { SceneDetail } from '@pipeline/types/video-project.ts'

interface SceneClipTimesProps {
  scene: SceneDetail
  // Solo las fronteras compartidas con otra escena, y no las bloqueadas (un
  // clip de Kie o una escena de avatar): bloqueadas se leen y no se tipean.
  canEditClipIn: boolean
  canEditClipOut: boolean
  onClipTimeChange(edge: ClipEdge, seconds: number): void
}

// La fila de In/Out del panel de la escena: dónde empieza y termina, con el
// campo para tipear la frontera cuando se puede mover. Sin tiempos no dibuja
// nada. Presentacional.
export function SceneClipTimes({
  scene,
  canEditClipIn,
  canEditClipOut,
  onClipTimeChange,
}: SceneClipTimesProps) {
  const { t } = useTranslation()

  if (scene.startSeconds === undefined || scene.endSeconds === undefined)
    return null

  return (
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
  )
}
