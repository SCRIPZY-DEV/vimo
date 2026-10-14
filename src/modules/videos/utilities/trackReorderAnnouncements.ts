import type { Announcements, UniqueIdentifier } from '@dnd-kit/core'
import type { TFunction } from 'i18next'
import { TIMELINE_TRACK_LABEL_KEYS } from '@/modules/videos/constants'
import { isTimelineTrackId } from '@/modules/videos/utilities/timelineLayout'

// Lo que dnd-kit le anuncia al lector de pantalla mientras se reordenan las
// pistas, traducido y con el nombre de cada pista: por defecto lo dice en
// inglés y con los ids crudos («Picked up draggable item narration»). Un id
// que no es de pista no se anuncia (undefined: dnd-kit no dice nada y queda
// el anuncio anterior).
export function trackReorderAnnouncements(t: TFunction): Announcements {
  const trackName = (id: UniqueIdentifier) => {
    if (!isTimelineTrackId(id)) return undefined

    return t(TIMELINE_TRACK_LABEL_KEYS[id])
  }

  return {
    onDragStart({ active }) {
      const track = trackName(active.id)
      if (!track) return undefined

      return t('library.editor.timeline.dragStart', { track })
    },
    onDragOver({ active, over }) {
      const track = trackName(active.id)
      if (!track) return undefined

      // Apenas se toma la pista, dnd-kit la informa sobre su propia posición
      // (en la misma tarea): anunciarlo pisaría «Tomaste la pista…». Volver
      // al lugar de partida tampoco se anuncia; lo cubre el aviso al soltar.
      if (over?.id === active.id) return undefined

      // Sin `over` (raro: dnd-kit casi siempre encuentra una pista debajo).
      const overTrack = over ? trackName(over.id) : undefined
      if (!overTrack)
        return t('library.editor.timeline.dragOverNone', { track })

      return t('library.editor.timeline.dragOver', { track, over: overTrack })
    },
    onDragEnd({ active, over }) {
      const track = trackName(active.id)
      if (!track) return undefined

      // dnd-kit siempre encuentra una pista debajo de la arrastrada: soltarla
      // donde estaba llega con `over` = ella misma, el mismo caso que sin
      // `over` (handleTrackDragEnd tampoco reordena): «donde estaba».
      const overTrack =
        over && over.id !== active.id ? trackName(over.id) : undefined
      if (!overTrack) return t('library.editor.timeline.dragEndNone', { track })

      return t('library.editor.timeline.dragEnd', { track, over: overTrack })
    },
    onDragCancel({ active }) {
      const track = trackName(active.id)
      if (!track) return undefined

      return t('library.editor.timeline.dragCancel', { track })
    },
  }
}
