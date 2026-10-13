import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Loader2 } from 'lucide-react'
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
import { videosApi } from '@/modules/videos/api'
import { VoiceCount } from '@/modules/voices/components/VoiceCount'
import { VoiceFilters } from '@/modules/voices/components/VoiceFilters'
import { VoiceGrid } from '@/modules/voices/components/VoiceGrid'
import { VoicePagination } from '@/modules/voices/components/VoicePagination'
import {
  VOICE_FILTERS_INITIAL_VALUE,
  VOICE_PICKER_TABS_BY_VENDOR,
  VOICE_TAB_CATALOGS,
} from '@/modules/voices/constants'
import { useVoiceCatalogPage } from '@/modules/voices/hooks/useVoiceCatalogPage'
import { useVoiceFavorites } from '@/modules/voices/hooks/useVoiceFavorites'
import { useVoicePreview } from '@/modules/voices/hooks/useVoicePreview'
import { useVoiceVendor } from '@/modules/voices/hooks/useVoiceVendor'
import { vendorOfProvider } from '@/modules/voices/utilities/vendorOfProvider'
import { voiceKey } from '@/modules/voices/utilities/voiceKey'
import type { SelectedVoice } from '@/modules/videos/types/create'
import type { VoiceSummary, VoiceVendorId } from '@pipeline/types/voices.ts'
import type { VoiceFilterState, VoiceTab } from '@/modules/voices/types/voices'

interface VoicePickerModalProps {
  current: SelectedVoice | null
  onSelect: (voice: SelectedVoice) => void
  onClose: () => void
}

// Pestaña que muestra la voz ya elegida, si existe en el vendor activo.
// Favoritos no es un catálogo: no cuenta. En ai33 el catálogo sale del
// prefijo del voice_id ("minimax_…" → pestaña Minimax).
function tabForVoice(
  tabs: VoiceTab[],
  voice: SelectedVoice | null,
): VoiceTab | null {
  if (!voice) return null
  return (
    tabs.find((tab) => {
      if (tab === 'favorites') return false
      const catalog = VOICE_TAB_CATALOGS[tab]
      if (catalog.provider !== voice.provider) return false
      return !catalog.catalog || voice.voiceId.startsWith(`${catalog.catalog}_`)
    }) ?? null
  )
}

// La tarjeta resaltada: la elegida en este modal o, hasta elegir otra, la voz
// que ya tiene el formulario.
function highlightedKey(
  selected: VoiceSummary | null,
  current: SelectedVoice | null,
): string | null {
  if (selected) return voiceKey(selected)
  if (current) return voiceKey(current)
  return null
}

// Selector de voz de Crear y del editor: el mismo catálogo que la página
// Voces (grilla de tres columnas con muestra y favorito, contador, filtros y
// paginación), en un modal tan ancho como esa página para que se vea igual.
export function VoicePickerModal({
  current,
  onSelect,
  onClose,
}: VoicePickerModalProps) {
  const { t } = useTranslation()
  const { playingUrl, togglePreview, stopPreview } = useVoicePreview()
  const { isFavorite, toggleFavorite } = useVoiceFavorites()
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
  const { missingKeys, ready } = useRequiredApiKeys({
    requirements: VOICE_VENDOR_API_KEY_REQUIREMENTS[vendor],
  })

  const [chosenTab, setChosenTab] = useState<VoiceTab | null>(null)
  // Los mismos filtros de la página Voces (búsqueda, idioma, género y los
  // extras por proveedor); se conservan al cambiar de pestaña.
  const [filters, setFilters] = useState(VOICE_FILTERS_INITIAL_VALUE)
  const [page, setPage] = useState(1)
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
      : (tabForVoice(tabs, current) ?? tabs[0])
  const {
    provider,
    source,
    vendorFavorites,
    pageVoices,
    totalVoices,
    totalPages,
    canGoNext,
    isLoading,
    isFetching,
    errorKey,
    accents,
    categories,
  } = useVoiceCatalogPage({ vendor, tab, filters, page, ready })

  const selectedKey = highlightedKey(selected, current)

  // Cambiar de vendor, de pestaña o de filtros vuelve a la primera página.
  const changeVendor = (next: VoiceVendorId) => {
    stopPreview()
    setVendorOverride(next)
    setChosenTab(null)
    setSelected(null)
    setAddErrorKey(null)
    setPage(1)
  }
  const changeTab = (value: string) => {
    stopPreview()
    setChosenTab(value as VoiceTab)
    setPage(1)
  }
  const changeFilters = (value: VoiceFilterState) => {
    setFilters(value)
    setPage(1)
  }
  const choose = (voice: VoiceSummary) => {
    if (!adding) setSelected(voice)
  }
  const togglePreviewFor = (voice: VoiceSummary) => {
    if (voice.previewUrl) togglePreview(voice.previewUrl)
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
      (current !== null && tabForVoice(tabs, current) !== null))

  return (
    <Dialog open onOpenChange={(open) => !open && !adding && close()}>
      {/* Tan ancho como la página Voces: la grilla de tres columnas necesita
          ese espacio; la lista angosta de antes escondía el catálogo. */}
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-3rem)] max-w-7xl flex-col">
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
            <Tabs value={tab} onValueChange={changeTab}>
              <TabsList>
                {tabs.map((tabId) => (
                  <TabsTrigger key={tabId} value={tabId}>
                    {t(`create.voice.tabs.${tabId}`)}
                    {tabId === 'favorites' && vendorFavorites.length > 0
                      ? ` (${vendorFavorites.length})`
                      : ''}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

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

            {errorKey && <ErrorMessage>{t(errorKey)}</ErrorMessage>}
            {addErrorKey && <ErrorMessage>{t(addErrorKey)}</ErrorMessage>}

            {pageVoices.length > 0 && <VoiceCount count={totalVoices} />}

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {isLoading && (
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

              {pageVoices.length > 0 && (
                <VoiceGrid
                  voices={pageVoices}
                  selectedKey={selectedKey}
                  playingUrl={playingUrl}
                  isFavorite={isFavorite}
                  onSelect={choose}
                  onTogglePreview={togglePreviewFor}
                  onToggleFavorite={toggleFavorite}
                />
              )}
            </div>

            {!isLoading && (pageVoices.length > 0 || page > 1) && (
              <VoicePagination
                page={page}
                totalPages={totalPages}
                hasNextPage={canGoNext}
                loading={isFetching}
                onPageChange={setPage}
              />
            )}
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
