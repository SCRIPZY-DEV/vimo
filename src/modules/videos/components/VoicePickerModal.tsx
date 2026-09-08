import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Loader2, Pause, Play } from 'lucide-react'
import { apiKeysFocusPath } from '@/modules/api-keys/constants'
import { VOICE_VENDOR_API_KEY_REQUIREMENTS } from '@/modules/api-keys/constants'
import { useRequiredApiKeys } from '@/modules/api-keys/hooks/useRequiredApiKeys'
import { commonApi } from '@/modules/common/api'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { VoiceVendorSwitch } from '@/modules/common/components/VoiceVendorSwitch'
import { VOICE_VENDOR_LABELS } from '@/modules/common/constants'
import { Button } from '@/modules/common/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/modules/common/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/modules/common/ui/tabs'
import { cn } from '@/modules/common/utilities/cn'
import { videosApi } from '@/modules/videos/api'
import { useVoiceCatalog } from '@/modules/videos/hooks/useVoiceCatalog'
import { VoiceFilters } from '@/modules/voices/components/VoiceFilters'
import {
  ELEVENLABS_LIBRARY_CATEGORIES,
  SEARCH_DEBOUNCE_MS,
  VOICE_FILTERS_INITIAL_VALUE,
  VOICE_PICKER_TABS_BY_VENDOR,
  VOICE_TAB_CATALOGS,
} from '@/modules/voices/constants'
import { useDebouncedValue } from '@/modules/voices/hooks/useDebouncedValue'
import { useVoicePreview } from '@/modules/voices/hooks/useVoicePreview'
import { useVoiceVendor } from '@/modules/voices/hooks/useVoiceVendor'
import { filterVoices } from '@/modules/voices/utilities/filterVoices'
import { vendorOfProvider } from '@/modules/voices/utilities/vendorOfProvider'
import type { SelectedVoice } from '@/modules/videos/types/create'
import type { VoiceSummary, VoiceVendorId } from '@pipeline/types/voices.ts'
import type { VoiceTab } from '@/modules/voices/types/voices'

interface VoicePickerModalProps {
  current: SelectedVoice | null
  onSelect: (voice: SelectedVoice) => void
  onClose: () => void
}

type PickerTab = Exclude<VoiceTab, 'favorites'>

// Pestaña que muestra la voz ya elegida, si existe en el vendor activo.
function tabForProvider(
  tabs: PickerTab[],
  provider: SelectedVoice['provider'] | undefined,
): PickerTab | null {
  if (!provider) return null
  return (
    tabs.find((tab) => VOICE_TAB_CATALOGS[tab].provider === provider) ?? null
  )
}

export function VoicePickerModal({
  current,
  onSelect,
  onClose,
}: VoicePickerModalProps) {
  const { t } = useTranslation()
  const { playingUrl, togglePreview, stopPreview } = useVoicePreview()
  // Proveedor por defecto de Ajustes (ADR-0024); si ya hay una voz elegida se
  // arranca en el suyo. El switch del modal cambia solo esta elección, nunca
  // la preferencia.
  const { vendor: defaultVendor } = useVoiceVendor()
  const [vendorOverride, setVendorOverride] = useState<VoiceVendorId | null>(
    null,
  )
  const vendor =
    vendorOverride ??
    (current ? vendorOfProvider(current.provider) : defaultVendor)
  const { missingKeys } = useRequiredApiKeys({
    requirements: VOICE_VENDOR_API_KEY_REQUIREMENTS[vendor],
  })

  const [chosenTab, setChosenTab] = useState<PickerTab | null>(null)
  // Los mismos filtros de la sección Voces (búsqueda, idioma, género, y los
  // extras por proveedor); se conservan al cambiar de tab.
  const [filters, setFilters] = useState(VOICE_FILTERS_INITIAL_VALUE)
  // Se guarda el VoiceSummary entero: una voz de la biblioteca de ElevenLabs
  // trae libraryOwnerId y hay que añadirla a la cuenta al confirmar.
  const [selected, setSelected] = useState<VoiceSummary | null>(null)
  const [adding, setAdding] = useState(false)
  const [addErrorKey, setAddErrorKey] = useState<string | null>(null)

  // Pestañas según el vendor (ADR-0024); una que ya no existe cae a la de la
  // voz actual o a la primera, derivado en render.
  const tabs = VOICE_PICKER_TABS_BY_VENDOR[vendor]
  const tab =
    chosenTab && tabs.includes(chosenTab)
      ? chosenTab
      : (tabForProvider(tabs, current?.provider) ?? tabs[0])
  const { provider, source } = VOICE_TAB_CATALOGS[tab]

  const debouncedSearch = useDebouncedValue(filters.search, SEARCH_DEBOUNCE_MS)
  const effectiveFilters = { ...filters, search: debouncedSearch }

  const catalog = useVoiceCatalog({
    provider,
    source,
    search: debouncedSearch,
    language: filters.language,
    gender: filters.gender,
    category: filters.category,
    enabled: !missingKeys,
  })

  const visibleVoices = filterVoices(catalog.voices, effectiveFilters, {
    serverFiltered: !catalog.filtersAreClientSide,
    serverFilteredCategory: catalog.categoryIsServerSide,
  })
  // Opciones derivadas de lo cargado (solo los motores ElevenLabs las
  // traen); la biblioteca filtra categoría en el server con opciones fijas.
  const accents = [
    ...new Set(catalog.voices.map((voice) => voice.accent).filter(Boolean)),
  ] as string[]
  const categories =
    source === 'library'
      ? [...ELEVENLABS_LIBRARY_CATEGORIES]
      : ([
          ...new Set(
            catalog.voices.map((voice) => voice.category).filter(Boolean),
          ),
        ] as string[])

  const isCurrent = (voice: VoiceSummary) =>
    current?.voiceId === voice.voiceId && current.provider === voice.provider
  const isChosen = (voice: VoiceSummary) =>
    selected
      ? selected.voiceId === voice.voiceId &&
        selected.provider === voice.provider
      : isCurrent(voice)

  const changeVendor = (next: VoiceVendorId) => {
    stopPreview()
    setVendorOverride(next)
    setChosenTab(null)
    setSelected(null)
    setAddErrorKey(null)
  }

  const close = () => {
    stopPreview()
    onClose()
  }

  // Sin selección nueva se confirma la voz actual (si sigue en este vendor).
  const confirm = async () => {
    stopPreview()
    if (!selected) {
      if (current) onSelect(current)
      return
    }

    let voiceId = selected.voiceId
    if (selected.libraryOwnerId) {
      setAdding(true)
      setAddErrorKey(null)
      try {
        voiceId = await commonApi.addLibraryVoice({
          libraryOwnerId: selected.libraryOwnerId,
          voiceId: selected.voiceId,
          name: selected.name,
        })
      } catch (error) {
        setAddErrorKey(videosApi.errorMessageKey(error))
        return
      } finally {
        setAdding(false)
      }
    }

    onSelect({ provider: selected.provider, voiceId, name: selected.name })
  }

  const canConfirm =
    !adding &&
    (selected !== null ||
      (current !== null && tabForProvider(tabs, current.provider) !== null))

  return (
    <Dialog open onOpenChange={(open) => !open && !adding && close()}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle className="font-display">
            {t('create.voice.pickerTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('create.voice.pickerDescription')}
          </DialogDescription>
        </DialogHeader>

        <VoiceVendorSwitch
          value={vendor}
          size="sm"
          disabled={adding}
          onChange={changeVendor}
        />

        {missingKeys ? (
          <div className="space-y-3 rounded-2xl border-2 border-coral/40 bg-coral/10 p-4">
            <p className="font-body text-sm text-foreground">
              {t('create.voice.missingVendorKey', {
                vendor: VOICE_VENDOR_LABELS[vendor],
              })}
            </p>
            <Button asChild size="sm" className="rounded-lg font-display">
              <Link
                to={apiKeysFocusPath(
                  VOICE_VENDOR_API_KEY_REQUIREMENTS[vendor].flat(),
                )}
              >
                {t('apiKeys.missing.configure')}
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <Tabs
              value={tab}
              onValueChange={(value) => {
                stopPreview()
                setChosenTab(value as PickerTab)
              }}
            >
              <TabsList className="w-full">
                {tabs.map((tabId) => (
                  <TabsTrigger key={tabId} value={tabId} className="flex-1">
                    {t(`create.voice.tabs.${tabId}`)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <VoiceFilters
              provider={provider}
              source={source}
              value={filters}
              onChange={setFilters}
              accents={accents}
              categories={categories}
            />

            {provider === 'edge' && (
              <p className="font-body text-xs text-muted-foreground">
                {t('create.voice.edgeNote')}
              </p>
            )}

            {source === 'library' && (
              <p className="font-body text-xs text-muted-foreground">
                {t('create.voice.libraryNote')}
              </p>
            )}

            {catalog.errorKey && (
              <ErrorMessage>{t(catalog.errorKey)}</ErrorMessage>
            )}
            {addErrorKey && <ErrorMessage>{t(addErrorKey)}</ErrorMessage>}

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {catalog.isLoading && (
                <p className="py-8 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </p>
              )}

              {!catalog.isLoading && visibleVoices.length === 0 && (
                <p className="py-8 text-center font-body text-sm text-muted-foreground">
                  {t('create.voice.empty')}
                </p>
              )}

              {visibleVoices.map((voice) => {
                const isSelected = isChosen(voice)
                const isPlaying = Boolean(
                  voice.previewUrl && playingUrl === voice.previewUrl,
                )
                return (
                  <div
                    key={`${voice.provider}-${voice.voiceId}`}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border-2 bg-card p-3 transition-colors',
                      isSelected
                        ? 'border-saffron bg-saffron/10'
                        : 'border-border hover:border-saffron/40',
                    )}
                  >
                    <button
                      type="button"
                      disabled={adding}
                      onClick={() => setSelected(voice)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate font-display text-sm font-bold text-foreground">
                        {voice.name}
                        {voice.libraryOwnerId && (
                          <span className="ml-1.5 rounded-full bg-saffron/20 px-1.5 py-0.5 font-body text-[10px] font-semibold text-foreground">
                            {t('create.voice.libraryBadge')}
                          </span>
                        )}
                      </p>
                      <p className="truncate font-body text-xs text-muted-foreground">
                        {[voice.language, voice.gender, voice.accent]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </button>

                    {voice.previewUrl && (
                      <button
                        type="button"
                        onClick={() => togglePreview(voice.previewUrl!)}
                        aria-label={
                          isPlaying
                            ? t('create.voice.pause')
                            : t('create.voice.play')
                        }
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors',
                          isPlaying
                            ? 'border-saffron bg-saffron text-charcoal'
                            : 'border-border text-muted-foreground hover:border-saffron/50',
                        )}
                      >
                        {isPlaying ? (
                          <Pause className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                )
              })}

              {catalog.hasNextPage && (
                <Button
                  variant="outline"
                  disabled={catalog.isFetchingNextPage}
                  onClick={catalog.loadMore}
                  className="w-full rounded-xl font-display"
                >
                  {catalog.isFetchingNextPage && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t('create.voice.loadMore')}
                </Button>
              )}
            </div>
          </>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            disabled={adding}
            onClick={close}
            className="rounded-xl font-display"
          >
            {t('create.form.cancel')}
          </Button>
          <Button
            disabled={!canConfirm || missingKeys}
            onClick={() => void confirm()}
            className="rounded-xl font-display font-bold"
          >
            {adding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {adding
              ? t('create.voice.addingLibraryVoice')
              : t('create.voice.use')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
