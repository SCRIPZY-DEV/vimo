import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { SoundEffectDefinition } from '@pipeline/types/sound-effects.ts'

export type EditorTool = 'animation' | 'audio' | 'transitions' | 'music'

export interface EditorToolRailProps {
  activeTool: EditorTool | null
  disabled?: boolean
  onToggle(tool: EditorTool): void
}

export interface EditorToolRailItem {
  tool: EditorTool
  label: string
  icon: LucideIcon
}

export interface EditorToolPanelProps {
  id: string
  title: string
  width: number
  minWidth: number
  maxWidth: number
  className?: string
  children: ReactNode
  onWidthChange(width: number): void
  onClose(): void
}

export interface EditorToolPanelResize {
  pointerId: number
  startX: number
  startWidth: number
}

export interface EditorSfxPanelProps {
  effect: SoundEffectDefinition | null
  loading: boolean
  busy: boolean
  allTransitionsEnabled: boolean
  transitionsAvailable?: boolean
  cursorSeconds?: number
  error?: string | null
  onToggleAllTransitions(enabled: boolean): void
  onAdd(): void
  onOpenMix(): void
}

export interface EditorTransitionsPanelProps {
  enabled: boolean
  available: boolean
  busy: boolean
  onChange(enabled: boolean): void
}
