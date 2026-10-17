import { useEffect, useRef, useState } from 'react'
import {
  EDITOR_TOOL_PANEL_DEFAULT_WIDTH,
  EDITOR_TOOL_CATALOG_DEFAULT_WIDTH,
  EDITOR_TOOL_PANEL_MIN_WIDTH,
  EDITOR_TOOL_PANEL_MAX_WIDTH,
  EDITOR_TOOL_PREVIEW_MIN_WIDTH,
  EDITOR_TOOL_WORKSPACE_GUTTER,
} from '@/modules/videos/constants'
import type { EditorTool } from '@/modules/videos/types/editorTools'

export function useEditorWorkspace(projectId: string) {
  const [activeTool, setActiveTool] = useState<EditorTool | null>(null)
  const [width, setWidth] = useState<number | null>(null)
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

  const defaultWidth =
    activeTool === 'audio' || activeTool === 'transitions'
      ? EDITOR_TOOL_CATALOG_DEFAULT_WIDTH
      : EDITOR_TOOL_PANEL_DEFAULT_WIDTH

  return {
    activeTool,
    workspaceRef,
    width: Math.max(
      EDITOR_TOOL_PANEL_MIN_WIDTH,
      Math.min(width ?? defaultWidth, availableWidth),
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
