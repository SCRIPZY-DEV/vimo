import {
  DEFAULT_TIMELINE_LAYOUT,
  TIMELINE_LAYOUT_STORAGE_KEY_PREFIX,
  TIMELINE_TRACK_IDS,
  TIMELINE_TRACK_KINDS,
} from '@/modules/videos/constants'
import type {
  TimelineLayout,
  TimelineTrackId,
} from '@/modules/videos/types/library'

// Estado de interfaz del timeline por proyecto (ADR-0056): lectura tolerante
// (un JSON roto, ids desconocidos o un storage inaccesible caen al default) y
// escritura que nunca tira.

export function timelineLayoutStorageKey(projectId: string): string {
  return `${TIMELINE_LAYOUT_STORAGE_KEY_PREFIX}${projectId}`
}

export function isTimelineTrackId(value: unknown): value is TimelineTrackId {
  return (
    typeof value === 'string' &&
    (TIMELINE_TRACK_IDS as readonly string[]).includes(value)
  )
}

export function isAudioTrack(id: TimelineTrackId): boolean {
  return TIMELINE_TRACK_KINDS[id] === 'audio'
}

// Normaliza lo guardado: conserva el orden de los ids conocidos, agrega al
// final los que falten (una pista nueva de una versión posterior) y descarta
// el resto. Los booleanos ausentes o de otro tipo caen a false.
export function parseTimelineLayout(raw: string | null): TimelineLayout {
  if (!raw) return DEFAULT_TIMELINE_LAYOUT

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return DEFAULT_TIMELINE_LAYOUT
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    return DEFAULT_TIMELINE_LAYOUT

  const candidate = parsed as Partial<Record<keyof TimelineLayout, unknown>>
  const savedOrder = Array.isArray(candidate.order)
    ? candidate.order.filter(isTimelineTrackId)
    : []
  const order = [...new Set(savedOrder)]
  for (const id of TIMELINE_TRACK_IDS) if (!order.includes(id)) order.push(id)

  return {
    order,
    muted: readFlags(candidate.muted),
    locked: readFlags(candidate.locked),
  }
}

function readFlags(value: unknown): Record<TimelineTrackId, boolean> {
  const flags = { ...DEFAULT_TIMELINE_LAYOUT.muted }
  if (!value || typeof value !== 'object') return flags
  const record = value as Record<string, unknown>
  for (const id of TIMELINE_TRACK_IDS) flags[id] = record[id] === true
  return flags
}

export function readTimelineLayout(projectId: string): TimelineLayout {
  try {
    return parseTimelineLayout(
      localStorage.getItem(timelineLayoutStorageKey(projectId)),
    )
  } catch {
    return DEFAULT_TIMELINE_LAYOUT
  }
}

export function rememberTimelineLayout(
  projectId: string,
  layout: TimelineLayout,
): void {
  try {
    localStorage.setItem(
      timelineLayoutStorageKey(projectId),
      JSON.stringify(layout),
    )
  } catch {
    console.log(
      'No se pudo guardar el estado de las pistas del timeline en localStorage',
    )
  }
}

// Mueve la pista `activeId` al lugar de `overId` conservando a las demás
// (misma semántica que arrayMove de dnd-kit). Sin cambio, devuelve la misma
// referencia.
export function moveTrack(
  order: TimelineTrackId[],
  activeId: TimelineTrackId,
  overId: TimelineTrackId,
): TimelineTrackId[] {
  const from = order.indexOf(activeId)
  const to = order.indexOf(overId)
  if (from === -1 || to === -1 || from === to) return order

  const next = [...order]
  next.splice(from, 1)
  next.splice(to, 0, activeId)
  return next
}
