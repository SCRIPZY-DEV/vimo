import { formatTime } from '@/modules/common/utilities/formatTime'
import type { AvatarSpanView } from '@/modules/videos/types/create'

// Los tramos del avatar como lista en el idioma activo («0:00–0:11,
// 1:02–1:13, 2:10–2:19»): la línea de la pausa de escenas (spec §6.1).
export function avatarSpansLabel(
  spans: AvatarSpanView[],
  language: string,
): string {
  const ranges = spans.map(
    (span) => `${formatTime(span.startSeconds)}–${formatTime(span.endSeconds)}`,
  )

  return new Intl.ListFormat(language, { style: 'short', type: 'unit' }).format(
    ranges,
  )
}
