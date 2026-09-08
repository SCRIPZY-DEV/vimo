import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Loader2, Wallet } from 'lucide-react'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import DoodleVoice from '@/modules/common/doodles/DoodleVoice'
import { usePageTitle } from '@/modules/common/hooks/usePageTitle'
import { Dialog, DialogContent } from '@/modules/common/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/modules/common/ui/tabs'
import { cn } from '@/modules/common/utilities/cn'
import { MissingApiKeysNotice } from '@/modules/api-keys/components/MissingApiKeysNotice'
import { MODULE_API_KEY_REQUIREMENTS } from '@/modules/api-keys/constants'
import { useRequiredApiKeys } from '@/modules/api-keys/hooks/useRequiredApiKeys'
import { VoiceCloningInfoCard } from '@/modules/voices/components/VoiceCloningInfoCard'
import { VoiceCount } from '@/modules/voices/components/VoiceCount'
import { VoiceFilters } from '@/modules/voices/components/VoiceFilters'
import { VoiceGrid } from '@/modules/voices/components/VoiceGrid'
import { VoiceHistoryPanel } from '@/modules/voices/components/VoiceHistoryPanel'
import { VoicePagination } from '@/modules/voices/components/VoicePagination'
import { VoiceTesterPanel } from '@/modules/voices/components/VoiceTesterPanel'
import {
  CREDITS_SETTLE_DELAY_MS,
  ELEVENLABS_PAGE_SIZE,
  SEARCH_DEBOUNCE_MS,
  VOICE_FILTERS_INITIAL_VALUE,
  VOICE_PAGE_SIZE,
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
import type { VoiceFilterState, VoiceTab } from '@/modules/voices/types/voices'

// Edge queda fuera del catálogo visible (sin muestras del proveedor).
const TABS: VoiceTab[] = ['minimax', 'elevenlabs', 'favorites']

export function Voices() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { isNative, missingKeys, ready } = useRequiredApiKeys({
    requirements: MODULE_API_KEY_REQUIREMENTS.voices,
  })
  const { credits } = useVoiceCredits()
  const { favorites, isFavorite, toggleFavorite } = useVoiceFavorites()
  const { playingUrl, togglePreview } = useVoicePreview()
  const { task } = useVoiceTask()

  const [tab, setTab] = useState<VoiceTab>('minimax')
  const [filters, setFilters] = useState(VOICE_FILTERS_INITIAL_VALUE)
  const [page, setPage] = useState(1)
  const [selectedVoice, setSelectedVoice] = useState<VoiceSummary | null>(null)

  usePageTitle(t('voices.pageTitle'))

  const debouncedSearch = useDebouncedValue(filters.search, SEARCH_DEBOUNCE_MS)
  const effectiveFilters = { ...filters, search: debouncedSearch }
  const provider = tab === 'favorites' ? null : tab
  const {
    voices,
    isLoading,
    isFetching,
    errorKey,
    serverPaged,
    hasNextPage,
    serverTotal,
  } = useVoices({ provider, filters: effectiveFilters, page, ready })

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

  // Cambiar de tab o de filtros vuelve a la primera página.
  const changeTab = (value: string) => {
    setTab(value as VoiceTab)
    setPage(1)
  }
  const changeFilters = (value: VoiceFilterState) => {
    setFilters(value)
    setPage(1)
  }

  const source = tab === 'favorites' ? favorites : voices
  const filteredVoices = filterVoices(source, effectiveFilters, {
    serverFiltered: tab === 'elevenlabs',
  })
  // ElevenLabs ya viene paginado del server: sus páginas salen del total que
  // informa el proveedor (null si no lo trae); el resto se rebana en cliente.
  const serverTotalPages =
    serverTotal === null
      ? null
      : Math.max(1, Math.ceil(serverTotal / ELEVENLABS_PAGE_SIZE))
  const totalPages = serverPaged
    ? serverTotalPages
    : Math.max(1, Math.ceil(filteredVoices.length / VOICE_PAGE_SIZE))
  const pageVoices = serverPaged
    ? filteredVoices
    : filteredVoices.slice((page - 1) * VOICE_PAGE_SIZE, page * VOICE_PAGE_SIZE)
  const canGoNext = serverPaged ? hasNextPage : page < (totalPages ?? 1)
  // ElevenLabs solo conoce su total por el server; el resto se cuenta local.
  const totalVoices = serverPaged ? serverTotal : filteredVoices.length
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
    <div className="mx-auto max-w-7xl space-y-8 px-8 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex max-w-5xl items-center justify-between gap-3"
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
        <p className="max-w-5xl font-body text-sm text-saffron">
          {t('voices.soloEscritorio')}
        </p>
      )}

      {missingKeys && (
        <div className="max-w-5xl">
          <MissingApiKeysNotice
            requirements={MODULE_API_KEY_REQUIREMENTS.voices}
          />
        </div>
      )}

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className={cn(
          'space-y-4',
          !isNative &&
            'rounded-2xl border-2 border-saffron/30 bg-saffron/5 p-6',
          (!isNative || missingKeys) && 'pointer-events-none opacity-60',
        )}
      >
        <Tabs value={tab} onValueChange={changeTab}>
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
            onChange={changeFilters}
            accents={accents}
            categories={categories}
          />
        )}

        {errorKey && tab !== 'favorites' && (
          <ErrorMessage>{t(errorKey)}</ErrorMessage>
        )}

        {isLoading && tab !== 'favorites' && (
          <div className="py-12 text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
            <p className="mt-2 font-body text-sm text-muted-foreground">
              {t('voices.cargando')}
            </p>
          </div>
        )}

        {!isLoading && pageVoices.length === 0 && !errorKey && (
          <p className="py-12 text-center font-body text-sm text-muted-foreground">
            {tab === 'favorites'
              ? t('voices.favoritos.vacio')
              : t('voices.filtros.sinResultados')}
          </p>
        )}

        {pageVoices.length > 0 && <VoiceCount count={totalVoices} />}

        {pageVoices.length > 0 && (
          <VoiceGrid
            voices={pageVoices}
            selectedKey={selectedVoice ? voiceKey(selectedVoice) : null}
            playingUrl={playingUrl}
            isFavorite={isFavorite}
            onSelect={setSelectedVoice}
            onTogglePreview={togglePreviewFor}
            onToggleFavorite={toggleFavorite}
          />
        )}

        {!isLoading && (pageVoices.length > 0 || page > 1) && (
          <VoicePagination
            page={page}
            totalPages={totalPages}
            hasNextPage={canGoNext}
            loading={isFetching}
            onPageChange={setPage}
          />
        )}
      </motion.section>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="max-w-5xl space-y-8"
      >
        <VoiceCloningInfoCard />
        <VoiceHistoryPanel />
      </motion.div>

      {/* Probador centrado: se cierra con la X, Esc o click fuera. */}
      <Dialog
        open={selectedVoice !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedVoice(null)
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto rounded-2xl">
          {selectedVoice && (
            <VoiceTesterPanel
              key={selectedVoice.provider}
              voice={selectedVoice}
              disabled={!isNative || missingKeys}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
