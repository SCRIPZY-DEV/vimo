import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Loader2, Wallet } from 'lucide-react'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { VoiceVendorSwitch } from '@/modules/common/components/VoiceVendorSwitch'
import DoodleVoice from '@/modules/common/doodles/DoodleVoice'
import { usePageTitle } from '@/modules/common/hooks/usePageTitle'
import { Dialog, DialogContent } from '@/modules/common/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/modules/common/ui/tabs'
import { cn } from '@/modules/common/utilities/cn'
import { formatDateTime } from '@/modules/common/utilities/formatDateTime'
import { MissingApiKeysNotice } from '@/modules/api-keys/components/MissingApiKeysNotice'
import { VOICE_VENDOR_API_KEY_REQUIREMENTS } from '@/modules/api-keys/constants'
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
  ELEVENLABS_LIBRARY_CATEGORIES,
  ELEVENLABS_PAGE_SIZE,
  SEARCH_DEBOUNCE_MS,
  VOICE_FILTERS_INITIAL_VALUE,
  VOICE_PAGE_SIZE,
  VOICE_PROVIDERS_BY_VENDOR,
  VOICE_TABS_BY_VENDOR,
  VOICE_TAB_CATALOGS,
  voicesQueryKeys,
} from '@/modules/voices/constants'
import { useDebouncedValue } from '@/modules/voices/hooks/useDebouncedValue'
import { useVoiceCredits } from '@/modules/voices/hooks/useVoiceCredits'
import { useVoiceFavorites } from '@/modules/voices/hooks/useVoiceFavorites'
import { useVoicePreview } from '@/modules/voices/hooks/useVoicePreview'
import { useVoiceTask } from '@/modules/voices/hooks/useVoiceTask'
import { useVoiceVendor } from '@/modules/voices/hooks/useVoiceVendor'
import { useVoices } from '@/modules/voices/hooks/useVoices'
import { filterVoices } from '@/modules/voices/utilities/filterVoices'
import { voiceKey } from '@/modules/voices/utilities/voiceKey'
import type { VoiceSummary, VoiceVendorId } from '@pipeline/types/voices.ts'
import type { VoiceFilterState, VoiceTab } from '@/modules/voices/types/voices'

export function Voices() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  // El proveedor por defecto sale de Ajustes (ADR-0024); el switch de esta
  // vista lo cambia solo mientras se navega, sin tocar la preferencia.
  const { vendor: defaultVendor } = useVoiceVendor()
  const [vendorOverride, setVendorOverride] = useState<VoiceVendorId | null>(
    null,
  )
  const vendor = vendorOverride ?? defaultVendor
  const { isNative, missingKeys, ready } = useRequiredApiKeys({
    requirements: VOICE_VENDOR_API_KEY_REQUIREMENTS[vendor],
  })
  const { credits } = useVoiceCredits({ vendor })
  const { favorites, isFavorite, toggleFavorite } = useVoiceFavorites()
  const { playingUrl, togglePreview } = useVoicePreview()
  const { task } = useVoiceTask()

  const [chosenTab, setChosenTab] = useState<VoiceTab | null>(null)
  const [filters, setFilters] = useState(VOICE_FILTERS_INITIAL_VALUE)
  const [page, setPage] = useState(1)
  const [selectedVoice, setSelectedVoice] = useState<VoiceSummary | null>(null)

  usePageTitle(t('voices.pageTitle'))

  // Las pestañas dependen del vendor (ADR-0024): al cambiarlo, una pestaña
  // que ya no existe cae a la primera, derivado en render y sin efecto.
  const tabs = VOICE_TABS_BY_VENDOR[vendor]
  const tab = chosenTab && tabs.includes(chosenTab) ? chosenTab : tabs[0]
  const catalog = tab === 'favorites' ? null : VOICE_TAB_CATALOGS[tab]
  const provider = catalog?.provider ?? null
  const source = catalog?.source
  // Favoritos del vendor visible: los del otro siguen guardados.
  const vendorFavorites = favorites.filter((favorite) =>
    VOICE_PROVIDERS_BY_VENDOR[vendor].includes(favorite.provider),
  )

  const debouncedSearch = useDebouncedValue(filters.search, SEARCH_DEBOUNCE_MS)
  const effectiveFilters = { ...filters, search: debouncedSearch }
  const {
    voices,
    isLoading,
    isFetching,
    errorKey,
    serverPaged,
    hasNextPage,
    serverTotal,
  } = useVoices({ provider, source, filters: effectiveFilters, page, ready })

  // Los vendors descuentan el saldo async al sintetizar: se refresca al
  // completar y otra vez unos segundos después (mismo patrón que música).
  const taskStatus = task?.status
  useEffect(() => {
    if (taskStatus !== 'completed') return undefined
    void queryClient.invalidateQueries({
      queryKey: voicesQueryKeys.creditsRoot,
    })
    void queryClient.invalidateQueries({ queryKey: voicesQueryKeys.history })
    const timer = setTimeout(() => {
      void queryClient.invalidateQueries({
        queryKey: voicesQueryKeys.creditsRoot,
      })
    }, CREDITS_SETTLE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [taskStatus, queryClient])

  // Cambiar de vendor, de tab o de filtros vuelve a la primera página.
  const changeVendor = (next: VoiceVendorId) => {
    setVendorOverride(next)
    setChosenTab(null)
    setSelectedVoice(null)
    setPage(1)
  }
  const changeTab = (value: string) => {
    setChosenTab(value as VoiceTab)
    setPage(1)
  }
  const changeFilters = (value: VoiceFilterState) => {
    setFilters(value)
    setPage(1)
  }

  const catalogVoices = tab === 'favorites' ? vendorFavorites : voices
  const filteredVoices = filterVoices(catalogVoices, effectiveFilters, {
    serverFiltered: serverPaged,
    serverFilteredCategory: source === 'library',
  })
  // Un catálogo paginado server-side saca sus páginas del total que informa
  // el proveedor (null si no lo trae); el resto se rebana en cliente.
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
  const totalVoices = serverPaged ? serverTotal : filteredVoices.length
  const accents = [
    ...new Set(voices.map((voice) => voice.accent).filter(Boolean)),
  ] as string[]
  // La biblioteca filtra categoría en el server: las opciones son fijas.
  const categories =
    source === 'library'
      ? [...ELEVENLABS_LIBRARY_CATEGORIES]
      : ([
          ...new Set(voices.map((voice) => voice.category).filter(Boolean)),
        ] as string[])

  const togglePreviewFor = (voice: VoiceSummary) => {
    if (voice.previewUrl) togglePreview(voice.previewUrl)
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-8 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex max-w-5xl flex-wrap items-center justify-between gap-3"
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
        <div className="flex flex-wrap items-center gap-3">
          <VoiceVendorSwitch
            value={vendor}
            size="sm"
            disabled={!isNative}
            onChange={changeVendor}
          />
          {credits && (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
              <Wallet className="h-4 w-4 text-saffron" />
              <div className="text-right">
                <p className="font-body text-xs text-muted-foreground">
                  {credits.unit === 'characters'
                    ? t('voices.credits.characters')
                    : (credits.email ?? t('voices.saldo'))}
                </p>
                <p className="font-display text-sm font-bold tabular-nums text-foreground">
                  {credits.quota
                    ? t('voices.credits.remainingOf', {
                        remaining: Math.floor(credits.credits).toLocaleString(),
                        limit: credits.quota.limit.toLocaleString(),
                      })
                    : Math.floor(credits.credits).toLocaleString()}
                </p>
                {credits.quota?.resetsAt && (
                  <p className="font-body text-[10px] text-muted-foreground">
                    {t('voices.credits.resetsAt', {
                      date: formatDateTime(
                        credits.quota.resetsAt,
                        i18n.resolvedLanguage,
                      ),
                    })}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {!isNative && (
        <p className="max-w-5xl font-body text-sm text-saffron">
          {t('voices.soloEscritorio')}
        </p>
      )}

      {missingKeys && (
        <div className="max-w-5xl">
          <MissingApiKeysNotice
            key={vendor}
            requirements={VOICE_VENDOR_API_KEY_REQUIREMENTS[vendor]}
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
            {tabs.map((tabId) => (
              <TabsTrigger key={tabId} value={tabId}>
                {t(`voices.tabs.${tabId}`)}
                {tabId === 'favorites' && vendorFavorites.length > 0
                  ? ` (${vendorFavorites.length})`
                  : ''}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {source === 'library' && (
          <p className="font-body text-xs text-muted-foreground">
            {t('voices.biblioteca.nota')}
          </p>
        )}

        {provider && (
          <VoiceFilters
            provider={provider}
            source={source}
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
