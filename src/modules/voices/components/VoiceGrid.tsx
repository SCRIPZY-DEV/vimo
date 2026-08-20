import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { VOICE_RENDER_BATCH_SIZE } from '@/modules/voices/constants'
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
  // Paginación server-side (solo ElevenLabs).
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
}

/**
 * Grilla tonta con render incremental: los catálogos traen cientos de voces y
 * montar todas las tarjetas de golpe congela la vista. Un sentinel con
 * IntersectionObserver revela de a 30 y, agotada la lista, pide la página
 * siguiente si la hay. El padre remonta (key) al cambiar tab o filtros.
 */
export function VoiceGrid({
  voices,
  selectedKey,
  playingUrl,
  isFavorite,
  onSelect,
  onTogglePreview,
  onToggleFavorite,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}: VoiceGridProps) {
  const { t } = useTranslation()
  const [visibleCount, setVisibleCount] = useState(VOICE_RENDER_BATCH_SIZE)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const allRendered = visibleCount >= voices.length
  const sentinelActive = !allRendered || hasMore

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !sentinelActive) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setVisibleCount((count) => count + VOICE_RENDER_BATCH_SIZE)
        if (allRendered) onLoadMore?.()
      },
      { rootMargin: '400px 0px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [sentinelActive, allRendered, onLoadMore])

  const visible = voices.slice(0, visibleCount)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {visible.map((voice) => {
          const key = voiceKey(voice)
          return (
            <VoiceCard
              key={key}
              voice={voice}
              isSelected={key === selectedKey}
              isFavorite={isFavorite(voice)}
              isPlaying={
                voice.previewUrl !== undefined &&
                voice.previewUrl === playingUrl
              }
              onSelect={onSelect}
              onTogglePreview={onTogglePreview}
              onToggleFavorite={onToggleFavorite}
            />
          )
        })}
      </div>

      {sentinelActive && <div ref={sentinelRef} className="h-1" />}

      {loadingMore && (
        <p className="py-2 text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
        </p>
      )}

      <p className="text-center font-body text-xs text-muted-foreground">
        {t('voices.grilla.contador', {
          visible: visible.length,
          total: voices.length,
        })}
      </p>
    </div>
  )
}
