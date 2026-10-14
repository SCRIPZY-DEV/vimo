import { useLayoutEffect, useRef, useState } from 'react'
import {
  moveTrack,
  readTimelineLayout,
  rememberTimelineLayout,
} from '@/modules/videos/utilities/timelineLayout'
import type {
  TimelineLayout,
  TimelineTrackId,
} from '@/modules/videos/types/library'

// Orden, silencio en el visor y candado de las pistas del timeline, por
// proyecto (ADR-0056): arranca de lo recordado y persiste cada cambio.
export function useTimelineLayout(projectId: string) {
  const [layout, setLayout] = useState(() => readTimelineLayout(projectId))
  const [storedProjectId, setStoredProjectId] = useState(projectId)
  // El último layout: cada cambio parte de acá y no del `layout` del render,
  // así dos cambios del mismo evento se encadenan en vez de pisarse.
  const layoutRef = useRef(layout)

  // Otro proyecto con el editor montado (cambia :projectId en la ruta): el
  // estado se ajusta durante el render al layout recordado de ese proyecto,
  // sin efecto de por medio.
  if (storedProjectId !== projectId) {
    setStoredProjectId(projectId)
    setLayout(readTimelineLayout(projectId))
  }

  // El ref sigue al estado confirmado (también tras cambiar de proyecto) en
  // el mismo commit, antes de que el navegador pinte y pueda llegar un clic.
  // No se escribe durante el render: react-hooks/refs lo rechaza.
  useLayoutEffect(() => {
    layoutRef.current = layout
  }, [layout])

  const update = (next: TimelineLayout) => {
    layoutRef.current = next
    rememberTimelineLayout(projectId, next)
    setLayout(next)
  }

  const reorderTracks = (
    activeId: TimelineTrackId,
    overId: TimelineTrackId,
  ) => {
    const current = layoutRef.current
    update({ ...current, order: moveTrack(current.order, activeId, overId) })
  }

  const toggleMuted = (id: TimelineTrackId) => {
    const current = layoutRef.current
    update({
      ...current,
      muted: { ...current.muted, [id]: !current.muted[id] },
    })
  }

  const toggleLocked = (id: TimelineTrackId) => {
    const current = layoutRef.current
    update({
      ...current,
      locked: { ...current.locked, [id]: !current.locked[id] },
    })
  }

  return { layout, reorderTracks, toggleMuted, toggleLocked }
}
