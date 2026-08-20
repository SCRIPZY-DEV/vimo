import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Loader2, Wallet } from 'lucide-react'
import DoodleVoice from '@/modules/common/doodles/DoodleVoice'
import { usePageTitle } from '@/modules/common/hooks/usePageTitle'
import { Button } from '@/modules/common/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/modules/common/ui/tabs'
import { cn } from '@/modules/common/utilities/cn'
import { ApiKeysRoutes } from '@/modules/api-keys/constants'
import { useRequiredApiKeys } from '@/modules/api-keys/hooks/useRequiredApiKeys'
import { VoiceCloningInfoCard } from '@/modules/voices/components/VoiceCloningInfoCard'
import { VoiceFilters } from '@/modules/voices/components/VoiceFilters'
import { VoiceGrid } from '@/modules/voices/components/VoiceGrid'
import { VoiceHistoryPanel } from '@/modules/voices/components/VoiceHistoryPanel'
import { VoiceTesterPanel } from '@/modules/voices/components/VoiceTesterPanel'
import {
  CREDITS_SETTLE_DELAY_MS,
  SEARCH_DEBOUNCE_MS,
  VOICE_FILTERS_INITIAL_VALUE,
  voicesQueryKeys,
} from '@/modules/voices/constants'
import { useDebouncedValue } from '@/modules/voices/hooks/useDebouncedValue'
import { useVoiceCredits } from '@/modules/voices/hooks/useVoiceCredits'
import { useVoiceFavorites } from '@/modules/voices/hooks/useVoiceFavorites'
import { useVoicePreview } from '@/modules/voices/hooks/useVoicePreview'
import { useVoiceTask } from '@/modules/voices/hooks/useVoiceTask'
import { useVoices } from '@/modules/voices/hooks/useVoices'
import { filterVoices } from '@/modules/voices/utilities/filterVoices'
import { voiceKey } from '@/modules/voices/utilities/voiceKey'
import type { VoiceSummary } from '@pipeline/types/voices.ts'
import type { VoiceTab } from '@/modules/voices/types/voices'

const TABS: VoiceTab[] = ['minimax', 'elevenlabs', 'edge', 'favorites']

export function Voices() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const {
    isNative,
    missingProviders,
    isLoading: keysLoading,
    ready,
  } = useRequiredApiKeys({ providers: ['dubvoice'] })
  const { credits } = useVoiceCredits()
  const { favorites, isFavorite, toggleFavorite } = useVoiceFavorites()
  const { playingUrl, togglePreview } = useVoicePreview()
  const { task } = useVoiceTask()

  const [tab, setTab] = useState<VoiceTab>('minimax')
  const [filters, setFilters] = useState(VOICE_FILTERS_INITIAL_VALUE)
  const [selectedVoice, setSelectedVoice] = useState<VoiceSummary | null>(null)

  usePageTitle(t('voices.pageTitle'))

  const debouncedSearch = useDebouncedValue(filters.search, SEARCH_DEBOUNCE_MS)
  const effectiveFilters = { ...filters, search: debouncedSearch }
  const provider = tab === 'favorites' ? null : tab
  const { voices, isLoading, errorKey, hasMore, loadingMore, loadMore } =
    useVoices({ provider, filters: effectiveFilters, ready })

  const missingDubvoiceKey =
    isNative && !keysLoading && missingProviders.length > 0

  // DubVoice descuenta créditos async al sintetizar: se refresca el saldo al
  // completar y otra vez unos segundos después (mismo patrón que música).
  const taskStatus = task?.status
  useEffect(() => {
    if (taskStatus !== 'completed') return undefined
    void queryClient.invalidateQueries({ queryKey: voicesQueryKeys.credits })
    void queryClient.invalidateQueries({ queryKey: voicesQueryKeys.history })
    const timer = setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: voicesQueryKeys.credits })
    }, CREDITS_SETTLE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [taskStatus, queryClient])

  const source = tab === 'favorites' ? favorites : voices
  const visibleVoices = filterVoices(source, effectiveFilters, {
    serverFiltered: tab === 'elevenlabs',
  })
  const accents = [
    ...new Set(voices.map((voice) => voice.accent).filter(Boolean)),
  ] as string[]
  const categories = [
    ...new Set(voices.map((voice) => voice.category).filter(Boolean)),
  ] as string[]

  const togglePreviewFor = (voice: VoiceSummary) => {
    if (voice.previewUrl) togglePreview(voice.previewUrl)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-8 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3">
          <DoodleVoice size={48} delay={100} />
          <div>
            <h1 className="font-display text-3xl font-extrabold text-foreground">
              {t('voices.titulo')}
            </h1>
            <p className="font-handwritten text-lg text-muted-foreground">
              {t('voices.tagline')}
            </p>
          </div>
        </div>
        {credits && (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
            <Wallet className="h-4 w-4 text-saffron" />
            <div className="text-right">
              <p className="font-body text-xs text-muted-foreground">
                {credits.email ?? t('voices.saldo')}
              </p>
              <p className="font-display text-sm font-bold tabular-nums text-foreground">
                {Math.floor(credits.credits).toLocaleString()}
              </p>
            </div>
          </div>
        )}
      </motion.div>

      {!isNative && (
        <p className="font-body text-sm text-saffron">
          {t('voices.soloEscritorio')}
        </p>
      )}

      {missingDubvoiceKey && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between gap-3 rounded-2xl border-2 border-coral/40 bg-coral/10 p-4"
        >
          <p className="font-body text-sm text-foreground">
            {t('voices.faltaClave')}
          </p>
          <Button
            asChild
            size="sm"
            className="shrink-0 rounded-lg font-display"
          >
            <Link to={ApiKeysRoutes.apiKeys}>{t('voices.irAClaves')}</Link>
          </Button>
        </motion.div>
      )}

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className={cn(
          'space-y-4',
          !isNative &&
            'rounded-2xl border-2 border-saffron/30 bg-saffron/5 p-6',
          (!isNative || missingDubvoiceKey) && 'pointer-events-none opacity-60',
        )}
      >
        <Tabs value={tab} onValueChange={(value) => setTab(value as VoiceTab)}>
          <TabsList>
            {TABS.map((tabId) => (
              <TabsTrigger key={tabId} value={tabId}>
                {t(`voices.tabs.${tabId}`)}
                {tabId === 'favorites' && favorites.length > 0
                  ? ` (${favorites.length})`
                  : ''}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {tab !== 'favorites' && (
          <VoiceFilters
            provider={tab}
            value={filters}
            onChange={setFilters}
            accents={accents}
            categories={categories}
          />
        )}

        {tab === 'edge' && (
          <p className="font-body text-xs text-muted-foreground">
            {t('voices.notaEdge')}
          </p>
        )}

        {errorKey && tab !== 'favorites' && (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 font-body text-sm text-destructive">
            {t(errorKey)}
          </p>
        )}

        {isLoading && tab !== 'favorites' && (
          <div className="py-12 text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
            <p className="mt-2 font-body text-sm text-muted-foreground">
              {t('voices.cargando')}
            </p>
          </div>
        )}

        {!isLoading && visibleVoices.length === 0 && !errorKey && (
          <p className="py-12 text-center font-body text-sm text-muted-foreground">
            {tab === 'favorites'
              ? t('voices.favoritos.vacio')
              : t('voices.filtros.sinResultados')}
          </p>
        )}

        {visibleVoices.length > 0 && (
          <VoiceGrid
            key={`${tab}:${JSON.stringify(effectiveFilters)}`}
            voices={visibleVoices}
            selectedKey={selectedVoice ? voiceKey(selectedVoice) : null}
            playingUrl={playingUrl}
            isFavorite={isFavorite}
            onSelect={setSelectedVoice}
            onTogglePreview={togglePreviewFor}
            onToggleFavorite={toggleFavorite}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={loadMore}
          />
        )}
      </motion.section>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="space-y-8"
      >
        <VoiceCloningInfoCard />
        <VoiceHistoryPanel />
      </motion.div>

      {/* Anclado al borde inferior del scroll mientras haya voz elegida: el
          probador aparece donde el usuario clickeó, sin viajar por la grilla.
          Último hijo del contenedor para que el sticky acompañe toda la vista. */}
      {selectedVoice && (
        <div className="sticky bottom-0 z-20 pb-2">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-h-[70vh] overflow-y-auto rounded-2xl bg-background shadow-2xl"
          >
            <VoiceTesterPanel
              key={selectedVoice.provider}
              voice={selectedVoice}
              disabled={!isNative || missingDubvoiceKey}
              onClose={() => setSelectedVoice(null)}
            />
          </motion.div>
        </div>
      )}
    </div>
  )
}
