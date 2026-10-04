import { useEffect, useRef } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Check, Loader2 } from 'lucide-react'
import { Alert } from '@/modules/common/components/Alert'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { CatalogStyleCard } from '@/modules/videos/components/CatalogStyleCard'
import { CatalogStyleModal } from '@/modules/videos/components/CatalogStyleModal'
import {
  closeCatalogStyleViewer,
  openCatalogStyleViewer,
  useCatalogStyleViewer,
} from '@/modules/videos/hooks/useCatalogStyleViewer'
import { useCatalogStyles } from '@/modules/videos/hooks/useCatalogStyles'
import { useCustomStyles } from '@/modules/videos/hooks/useCustomStyles'
import { CATALOG_ORIGIN_BADGE_CLASS } from '@/modules/videos/constants'
import {
  readCatalogCharacter,
  rememberCatalogCharacter,
} from '@/modules/videos/utilities/catalogCharacterMemory'
import { localizedText } from '@/modules/videos/utilities/catalogLocale'
import { selectedCatalogStyleFrom } from '@/modules/videos/utilities/selectedCatalogStyle'
import type { SelectedCustomStyle } from '@/modules/videos/types/styles'
import type { CatalogGem } from '@pipeline/types/catalog.ts'
import type {
  CustomStyleSummary,
  StyleCharacter,
} from '@pipeline/types/styles.ts'

interface CatalogStyleGalleryProps {
  // El estilo del formulario; solo cuenta si es del catálogo (trae
  // `catalogStyleId`).
  selected: SelectedCustomStyle | null
  disabled: boolean
  // Guion y modelo del formulario: el selector de personaje de «Ver» los usa
  // para diseñar un personaje nuevo coherente con la gema (ADR-0020).
  script: string
  promptModel: string | null
  onSelect: (style: SelectedCustomStyle) => void
  // «Pasar a mi estilo» terminó bien con esta galería a la vista: el
  // formulario pasa a Mi estilo con el modal de la copia abierto. Recibe la
  // copia guardada.
  onCopied: (style: CustomStyleSummary) => void
}

// Los avisos de la copia (en curso o fallida) aparecen debajo de una grilla
// larga (38 estilos): al montarse se traen a la vista, o el clic en «Pasar a
// mi estilo» no mostraría nada. Función estable (fuera del componente): React
// la llama solo cuando el aviso se monta, no en cada render; cada aviso lleva
// su `key`.
function revealNotice(element: HTMLElement | null) {
  element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

// Galería del catálogo de Vimo (Entrega 2): una tarjeta por estilo, iguales a
// las de Mi estilo, en el orden del catálogo. Arranca sin selección, como Mi
// estilo (plan E2, P4): sin tarjeta elegida el video no sale. Qué estilo está
// abierto en «Ver» vive en un store compartido: la sección de personaje lo
// abre desde su chip para el estilo en uso. El modo de personaje de cada
// estilo se recuerda por estilo (plan E2 §5.5); con el estilo en uso, cambiarlo
// en «Ver» actualiza el formulario en el mismo gesto.
export function CatalogStyleGallery({
  selected,
  disabled,
  script,
  promptModel,
  onSelect,
  onCopied,
}: CatalogStyleGalleryProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'es'
  const {
    gems,
    isLoading,
    errorKey,
    copyStyle,
    copying,
    copyRequest,
    copiedStyle,
    copyFailed,
    copyErrorKey,
  } = useCatalogStyles()
  const { showSavedStyle } = useCustomStyles()
  const selectedId = selected?.catalogStyleId ?? null

  const viewing = useCatalogStyleViewer()
  const viewingGem = viewing
    ? gems.find((gem) => gem.id === viewing.catalogStyleId)
    : undefined

  // Si la galería se desmonta con «Ver» abierto (cambio a Mi estilo), el
  // pedido no queda colgado para la próxima vez.
  useEffect(() => closeCatalogStyleViewer, [])

  // La última copia que ya se llevó a Mi estilo: cada copia navega una vez.
  const announcedCopy = useRef<CustomStyleSummary | null>(null)

  // La copia terminó con la galería a la vista: entra a la lista de Mi estilo
  // al toque (sin esperar el refetch) y el formulario pasa a esa pestaña.
  // Efecto y no la continuación del `await` de `copy`: así corre con el
  // formulario de ahora y no con el del clic (la copia tarda y la persona
  // pudo tocar otra cosa), y solo con la galería montada: a quien ya salió de
  // la pestaña no se lo arrastra, y la copia le aparece igual en Mi estilo
  // (useCatalogStyles invalida la lista).
  useEffect(() => {
    if (!copiedStyle || announcedCopy.current === copiedStyle) return
    announcedCopy.current = copiedStyle
    showSavedStyle(copiedStyle)
    onCopied(copiedStyle)
  }, [copiedStyle, showSavedStyle, onCopied])

  // El modo de un estilo: el del formulario si está en uso; si no, el
  // recordado (o el de sus muestras).
  const characterOf = (gem: CatalogGem): StyleCharacter => {
    if (selectedId === gem.id && selected?.character) return selected.character
    return readCatalogCharacter(gem, localStorage)
  }

  const select = (gem: CatalogGem, character: StyleCharacter) => {
    onSelect(selectedCatalogStyleFrom(gem, language, character))
  }

  // Cada cambio de modo en «Ver» se recuerda al toque; con el estilo en uso,
  // el formulario pasa al snapshot nuevo.
  const changeCharacter = (gem: CatalogGem, character: StyleCharacter) => {
    rememberCatalogCharacter(gem.id, character, localStorage)
    if (selectedId === gem.id) select(gem, character)
  }

  const use = (gem: CatalogGem, character: StyleCharacter) => {
    rememberCatalogCharacter(gem.id, character, localStorage)
    select(gem, character)
    closeCatalogStyleViewer(gem.id)
  }

  // «Pasar a mi estilo». Pedida desde «Ver», el modal se cierra al terminar:
  // si falló, para que se vea el aviso; si salió bien, porque el formulario
  // pasa a Mi estilo (el efecto de arriba).
  const copy = async (gem: CatalogGem, character: StyleCharacter) => {
    try {
      await copyStyle({
        gem,
        name: localizedText(gem.name, language),
        character,
      })
    } catch {
      // El porqué lo muestra el aviso, desde el estado de la copia.
    } finally {
      closeCatalogStyleViewer(gem.id)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500">
          <Check className="h-4 w-4 text-white" strokeWidth={3} />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-lg font-extrabold leading-tight text-foreground">
            {t('create.style.label')}
          </h3>
          <p className="font-body text-sm leading-snug text-muted-foreground">
            {t('create.catalog.galleryHint')}
          </p>
        </div>
      </div>

      {/* Sin tarjeta elegida el video no sale: se dice acá, entre el título y
          la galería (con 38 tarjetas, debajo no se veía), además de en la
          lista de bloqueos del envío. */}
      {!selectedId && !isLoading && !errorKey && (
        <p className="rounded-xl border-2 border-saffron/60 bg-saffron/10 px-4 py-3 font-body text-sm text-foreground">
          {t('create.catalog.pickNotice')}
        </p>
      )}

      {isLoading && (
        <p className="py-6 text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
        </p>
      )}

      {errorKey && <ErrorMessage>{t(errorKey)}</ErrorMessage>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {gems.map((gem) => (
          <CatalogStyleCard
            key={gem.id}
            gem={gem}
            selected={selectedId === gem.id}
            disabled={disabled}
            copying={copying}
            onSelect={() => select(gem, characterOf(gem))}
            onView={() => openCatalogStyleViewer({ catalogStyleId: gem.id })}
            onCopy={() => void copy(gem, characterOf(gem))}
          />
        ))}
      </div>

      {copying && copyRequest && (
        <p
          key={`copying:${copyRequest.gem.id}`}
          ref={revealNotice}
          role="status"
          className="flex items-center gap-2 rounded-xl border-2 border-saffron/30 bg-saffron/5 px-4 py-3 font-body text-sm text-foreground"
        >
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-saffron" />
          <span>
            <Trans
              i18nKey="create.catalog.copyingNamed"
              values={{ name: copyRequest.name }}
              components={{
                badge: <span className={CATALOG_ORIGIN_BADGE_CLASS} />,
              }}
            />
          </span>
        </p>
      )}

      {/* El titular basta cuando el texto del código es del formulario de
          Crear (videosApi.catalogCopyErrorKey devuelve null). */}
      {!copying && copyFailed && copyRequest && (
        <Alert
          key={`failed:${copyRequest.gem.id}`}
          ref={revealNotice}
          tone="danger"
          title={t('create.catalog.copyFailed', { name: copyRequest.name })}
        >
          {copyErrorKey && <p>{t(copyErrorKey)}</p>}
        </Alert>
      )}

      {viewingGem && (
        <CatalogStyleModal
          // Un estilo distinto = un borrador distinto: el modal siembra su
          // modo desde `initialCharacter` UNA sola vez.
          key={viewingGem.id}
          gem={viewingGem}
          initialCharacter={characterOf(viewingGem)}
          inUse={selectedId === viewingGem.id}
          // Lo que dice el botón y el modo quieto, solo si se copia ESTE
          // estilo; el botón no lanza otra copia mientras corre cualquiera.
          copying={copying && copyRequest?.gem.id === viewingGem.id}
          copyDisabled={copying}
          script={script}
          promptModel={promptModel}
          onCharacterChange={(character) =>
            changeCharacter(viewingGem, character)
          }
          onUse={(character) => use(viewingGem, character)}
          onCopy={(character) => void copy(viewingGem, character)}
          onClose={() => closeCatalogStyleViewer()}
        />
      )}
    </div>
  )
}
