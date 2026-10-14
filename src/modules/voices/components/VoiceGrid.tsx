import { VoiceCard } from '@/modules/voices/components/VoiceCard'
import { voiceKey } from '@/modules/voices/utilities/voiceKey'
import type { VoiceSummary } from '@pipeline/types/voices.ts'

interface VoiceGridProps {
  voices: VoiceSummary[]
  selectedKey: string | null
  playingUrl: string | null
  isFavorite: (voice: VoiceSummary) => boolean
  onSelect: (voice: VoiceSummary) => void
  onTogglePreview: (voice: VoiceSummary) => void
  onToggleFavorite: (voice: VoiceSummary) => void
  onDelete?: (voice: VoiceSummary) => void
}

// Grilla tonta: recibe ya la página de voces a mostrar (la paginación vive en
// la vista), así nunca monta cientos de tarjetas de golpe.
export function VoiceGrid({
  voices,
  selectedKey,
  playingUrl,
  isFavorite,
  onSelect,
  onTogglePreview,
  onToggleFavorite,
  onDelete,
}: VoiceGridProps) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {voices.map((voice) => {
        const key = voiceKey(voice)
        return (
          <VoiceCard
            key={key}
            voice={voice}
            isSelected={key === selectedKey}
            isFavorite={isFavorite(voice)}
            isPlaying={
              voice.previewUrl !== undefined && voice.previewUrl === playingUrl
            }
            onSelect={onSelect}
            onTogglePreview={onTogglePreview}
            onToggleFavorite={onToggleFavorite}
            onDelete={onDelete}
          />
        )
      })}
    </div>
  )
}
