import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { useFocusHandoffOnUnmount } from '@/modules/videos/hooks/useFocusHandoffOnUnmount'
import type { RefObject } from 'react'

interface EditorAvatarRenderProgressProps {
  // Porcentaje simulado del render (HeyGen no informa avance); undefined =
  // la escena todavía espera su turno.
  percent: number | undefined
  // La región del avance: adonde va el foco al arrancar la tarea.
  regionRef: RefObject<HTMLDivElement | null>
  // Adonde va el foco si estaba en el avance cuando desaparece (la tarea
  // terminó o se canceló).
  focusFallback(): HTMLElement | null
}

// El avatar de la escena elegida se está generando desde el editor (entrega
// 2d): el mismo «Generando el avatar…» y el porcentaje del bloque del timeline
// y una barra. Sin «Cancelar»: con solo confirmar el render HeyGen ya cobra,
// así que cortarlo no devolvía nada. Es una región enfocable: al arrancar, el
// foco viene acá. Presentacional.
export function EditorAvatarRenderProgress({
  percent,
  regionRef,
  focusFallback,
}: EditorAvatarRenderProgressProps) {
  const { t } = useTranslation()
  useFocusHandoffOnUnmount(regionRef, focusFallback)

  return (
    <div
      ref={regionRef}
      role="region"
      aria-label={t('library.editor.timeline.avatarRendering')}
      tabIndex={-1}
      className="space-y-2 outline-none"
    >
      <p className="flex items-center gap-1.5 font-display text-sm font-semibold text-foreground">
        <Loader2 aria-hidden className="h-4 w-4 animate-spin text-amethyst" />
        <span className="flex-1">
          {t('library.editor.timeline.avatarRendering')}
        </span>
        {percent !== undefined && (
          <span className="font-mono text-xs tabular-nums">
            {t('library.editor.timeline.avatarRenderingPercent', { percent })}
          </span>
        )}
      </p>

      {percent !== undefined && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={t('library.editor.timeline.avatarRendering')}
          className="h-1.5 w-full overflow-hidden rounded-full bg-amethyst/20"
        >
          <div
            className="h-full rounded-full bg-amethyst transition-[width] duration-700 ease-linear"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  )
}
