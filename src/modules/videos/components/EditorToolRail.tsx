import { useTranslation } from 'react-i18next'
import { AudioLines, Clapperboard, Music2, Blend } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/modules/common/ui/tooltip'
import { cn } from '@/modules/common/utilities/cn'
import type {
  EditorToolRailItem,
  EditorToolRailProps,
} from '@/modules/videos/types/editorTools'

export function EditorToolRail({
  activeTool,
  disabled = false,
  onToggle,
}: EditorToolRailProps) {
  const { t } = useTranslation()
  const items: EditorToolRailItem[] = [
    {
      tool: 'animation',
      label: t('library.editor.tools.animation'),
      icon: Clapperboard,
    },
    {
      tool: 'audio',
      label: t('library.editor.tools.audio'),
      icon: AudioLines,
    },
    {
      tool: 'transitions',
      label: t('library.editor.tools.transitions'),
      icon: Blend,
    },
    {
      tool: 'music',
      label: t('library.editor.tools.music'),
      icon: Music2,
    },
  ]

  return (
    <div
      role="toolbar"
      aria-label={t('library.editor.tools.label')}
      aria-orientation="vertical"
      data-editor-tool-rail
      className="flex shrink-0 flex-col items-center gap-2 self-start rounded-2xl border border-border bg-card p-1.5 shadow-sm"
    >
      {items.map(({ tool, label, icon: Icon }) => (
        <Tooltip key={tool}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={label}
              aria-pressed={activeTool === tool}
              aria-expanded={activeTool === tool}
              aria-controls={
                activeTool === tool ? `editor-tool-${tool}` : undefined
              }
              disabled={disabled}
              data-editor-tool={tool}
              onClick={() => onToggle(tool)}
              className={cn(
                'relative flex h-11 w-11 items-center justify-center rounded-xl border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40',
                activeTool === tool
                  ? 'border-saffron/40 bg-saffron/20 text-charcoal dark:text-foreground'
                  : 'text-muted-foreground hover:border-saffron/20 hover:bg-saffron/10 hover:text-foreground',
              )}
            >
              <Icon aria-hidden className="h-5 w-5" strokeWidth={1.8} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="font-display font-semibold">
            {tool === 'animation'
              ? t('library.editor.tools.animationHint')
              : label}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}
