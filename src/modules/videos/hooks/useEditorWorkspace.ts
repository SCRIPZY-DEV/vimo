import { useEffect, useRef, useState } from 'react'
import {
  EDITOR_TOOL_PANEL_DEFAULT_WIDTH,
  EDITOR_TOOL_PANEL_MIN_WIDTH,
  EDITOR_TOOL_PANEL_MAX_WIDTH,
  EDITOR_TOOL_PREVIEW_MIN_WIDTH,
  EDITOR_TOOL_WORKSPACE_GUTTER,
} from '@/modules/videos/constants'
import type { EditorTool } from '@/modules/videos/types/editorTools'

export function useEditorWorkspace(projectId: string) {
  const [activeTool, setActiveTool] = useState<EditorTool | null>(null)
  const [width, setWidth] = useState(EDITOR_TOOL_PANEL_DEFAULT_WIDTH)
  const [availableWidth, setAvailableWidth] = useState(
    EDITOR_TOOL_PANEL_MAX_WIDTH,
  )
  const workspaceRef = useRef<HTMLDivElement>(null)
  const [previousProjectId, setPreviousProjectId] = useState(projectId)
  if (previousProjectId !== projectId) {
    setPreviousProjectId(projectId)
    setActiveTool(null)
  }

  // Se observa todo el espacio, no el panel: al ensancharlo queda lugar
  // para que la vista previa se desplace y reduzca sin desbordarse.
  useEffect(() => {
    const node = workspaceRef.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      setAvailableWidth(
        entry.contentRect.width -
          EDITOR_TOOL_PREVIEW_MIN_WIDTH -
          EDITOR_TOOL_WORKSPACE_GUTTER,
      )
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [activeTool])

  useEffect(() => {
    if (!activeTool) return
    const closeOutside = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (
        target.closest(
          '[data-editor-tool-panel], [data-editor-tool-rail], [data-radix-popper-content-wrapper], [role="dialog"]',
        )
      )
        return
      setActiveTool(null)
    }
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      setActiveTool(null)
    }
    document.addEventListener('pointerdown', closeOutside)
    window.addEventListener('keydown', closeEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('keydown', closeEscape)
    }
  }, [activeTool])

  return {
    activeTool,
    workspaceRef,
    width: Math.max(
      EDITOR_TOOL_PANEL_MIN_WIDTH,
      Math.min(width, availableWidth),
    ),
    maxWidth: Math.max(
      EDITOR_TOOL_PANEL_MIN_WIDTH,
      Math.min(EDITOR_TOOL_PANEL_MAX_WIDTH, availableWidth),
    ),
    setWidth,
    close: () => setActiveTool(null),
    open: setActiveTool,
    toggle: (tool: EditorTool) =>
      setActiveTool((current) => (current === tool ? null : tool)),
  }
}
