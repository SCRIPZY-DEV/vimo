import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Archive, Check, Loader2, X } from 'lucide-react'
import { Alert } from '@/modules/common/components/Alert'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { useAccessAdmin } from '@/modules/common/hooks/useAccessAdmin'
import { Button } from '@/modules/common/ui/button'
import { videosApi } from '@/modules/videos/api'
import { CatalogAdminModal } from '@/modules/videos/components/CatalogAdminModal'
import { CatalogStyleCard } from '@/modules/videos/components/CatalogStyleCard'
import { CatalogStyleModal } from '@/modules/videos/components/CatalogStyleModal'
import { NewStyleCard } from '@/modules/videos/components/NewStyleCard'
import { useCatalogAdmin } from '@/modules/videos/hooks/useCatalogAdmin'
import {
  closeCatalogStyleViewer,
  openCatalogStyleViewer,
  useCatalogStyleViewer,
} from '@/modules/videos/hooks/useCatalogStyleViewer'
import { useCatalogStyles } from '@/modules/videos/hooks/useCatalogStyles'
import { useCustomStyles } from '@/modules/videos/hooks/useCustomStyles'
import { CATALOG_ORIGIN_BADGE_CLASS } from '@/modules/videos/constants'
import { cn } from '@/modules/common/utilities/cn'
import {
  catalogAdminBadge,
  catalogAdminSampleImages,
  catalogGemFromContent,
  catalogPublishBlockers,
  catalogPurgeDaysLeft,
  splitCatalogAdminStyles,
} from '@/modules/videos/utilities/catalogAdminDraft'
import {
  readCatalogCharacter,
  rememberCatalogCharacter,
} from '@/modules/videos/utilities/catalogCharacterMemory'
import { localizedText } from '@/modules/videos/utilities/catalogLocale'
import {
  catalogSampleSources,
  selectedCatalogStyleListed,
} from '@/modules/videos/utilities/catalogSync'
import { selectedCatalogStyleFrom } from '@/modules/videos/utilities/selectedCatalogStyle'
import type {
  AdminCatalogStyle,
  CatalogAdminView,
} from '@/modules/videos/types/catalogRemote'
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

// Una tarjeta de la galería: la gema que se ve, sus muestras resueltas y, para
// el admin, la fila del servidor de la que sale.
interface CatalogEntry {
  gem: CatalogGem
  images: string[]
  style: AdminCatalogStyle | null
}

// El modal del admin abierto: un estilo (por id) o uno nuevo (null).
interface AdminEditing {
  styleId: string | null
  generateOnOpen: boolean
}

// Galería del catálogo de Vimo (Entrega 2): una tarjeta por estilo, iguales a
// las de Mi estilo, en el orden del catálogo. Arranca sin selección, como Mi
// estilo (plan E2, P4): sin tarjeta elegida el video no sale. Qué estilo está
// abierto en «Ver» vive en un store compartido: la sección de personaje lo
// abre desde su chip para el estilo en uso. El modo de personaje de cada
// estilo se recuerda por estilo (plan E2 §5.5); con el estilo en uso, cambiarlo
// en «Ver» actualiza el formulario en el mismo gesto.
//
// Con el catálogo remoto encendido (Entrega 3, ADR-0049) la lista es la
// sincronizada y, para un admin con conexión, la del servidor: todos los
// estilos con su borrador y su estado, la tarjeta «Crear estilo» y el menú de
// administrar. Eliminar archiva por 30 días: lo archivado se ve aparte, con el
// filtro «Archivados», solo para restaurarlo antes de que el servidor lo
// purgue. Sin conexión, o si esa lista falla, el admin ve el catálogo como
// cualquier usuario.
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
    remote,
    isLoading,
    errorKey,
    copyStyle,
    copying,
    copyRequest,
    copiedStyle,
    copyFailed,
    copyErrorKey,
    dismissCopyFailure,
  } = useCatalogStyles()
  const { showSavedStyle } = useCustomStyles()
  const isAdmin = useAccessAdmin()
  const adminMode = isAdmin && remote && videosApi.isNative()
  const admin = useCatalogAdmin(adminMode)
  const [editing, setEditing] = useState<AdminEditing | null>(null)
  const [view, setView] = useState<CatalogAdminView>('catalog')
  const selectedId = selected?.catalogStyleId ?? null

  // Lo que se ve: la lista del admin cuando cargó; si no, el catálogo del
  // sidecar (sincronizado o empaquetado) con sus muestras.
  const adminList = adminMode && admin.samplesBaseUrl !== null && !admin.isError
  const samplesBaseUrl = admin.samplesBaseUrl ?? ''
  const adminStyles = splitCatalogAdminStyles(admin.styles)
  // Archivados se muestra solo mientras haya alguno: restaurar el último
  // vuelve solo al catálogo, con el estilo de nuevo en su lugar.
  const showingArchived =
    adminList && view === 'archived' && adminStyles.archived.length > 0
  const entryOf = (style: AdminCatalogStyle): CatalogEntry => ({
    gem: catalogGemFromContent(style.id, style.draft),
    images: catalogAdminSampleImages(style.id, style.draft, samplesBaseUrl),
    style,
  })
  const catalogEntries: CatalogEntry[] = adminList
    ? adminStyles.active.map(entryOf)
    : gems.map((gem) => ({ gem, images: sampleUrls(gem), style: null }))
  const entries = showingArchived
    ? adminStyles.archived.map(entryOf)
    : catalogEntries
  // El estilo en uso se busca en el catálogo, se esté viendo lo que se vea.
  const listedGems = catalogEntries.map((entry) => entry.gem)

  const viewing = useCatalogStyleViewer()
  const viewingEntry = viewing
    ? entries.find((entry) => entry.gem.id === viewing.catalogStyleId)
    : undefined
  // Un estilo archivado no se edita (el servidor lo rechaza): si otro admin lo
  // archivó con el modal abierto, el modal se cierra como si lo hubiera eliminado.
  const editingStyle =
    editing?.styleId === null
      ? null
      : (adminStyles.active.find((style) => style.id === editing?.styleId) ??
        null)

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

  // Las acciones del admin desde la tarjeta. Cada una deja su aviso (el hook);
  // el error de una no corta nada más.
  const adminName = (style: AdminCatalogStyle) =>
    localizedText(style.draft.name, language) || style.id
  const publish = (style: AdminCatalogStyle) => {
    admin.publishStyle(style, adminName(style)).catch(() => {})
  }
  const hide = (style: AdminCatalogStyle) => {
    admin.hideStyle(style, adminName(style)).catch(() => {})
  }
  // Nativo, como al borrar un estilo propio: nunca otro modal encima. Eliminar
  // archiva: el estilo pasa a Archivados 30 días, donde se puede restaurar.
  const remove = (style: AdminCatalogStyle) => {
    const name = adminName(style)
    if (!window.confirm(t('create.catalogAdmin.deleteConfirm', { name })))
      return
    admin.deleteStyle(style, name).catch(() => {})
  }
  const restore = (style: AdminCatalogStyle) => {
    admin.restoreStyle(style, adminName(style)).catch(() => {})
  }

  const notice = admin.notice

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

      {/* El admin elige entre el catálogo y lo archivado (eliminado, a la
          espera de la purga). Sin archivados, el filtro no se puede elegir. */}
      {adminList && (
        <div
          role="group"
          aria-label={t('create.catalogAdmin.viewLabel')}
          className="flex flex-wrap items-center gap-2"
        >
          <ViewButton
            active={!showingArchived}
            onClick={() => setView('catalog')}
          >
            {t('create.catalogAdmin.viewCatalog', {
              count: adminStyles.active.length,
            })}
          </ViewButton>
          <ViewButton
            active={showingArchived}
            disabled={adminStyles.archived.length === 0}
            onClick={() => setView('archived')}
          >
            <Archive className="h-3.5 w-3.5" />
            {t('create.catalogAdmin.viewArchived', {
              count: adminStyles.archived.length,
            })}
          </ViewButton>
        </div>
      )}

      {showingArchived && (
        <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 font-body text-sm text-muted-foreground">
          {t('create.catalogAdmin.archivedHint')}
        </p>
      )}

      {/* Sin tarjeta elegida el video no sale: se dice acá, entre el título y
          la galería (con 38 tarjetas, debajo no se veía), además de en la
          lista de bloqueos del envío. */}
      {!selectedId && !isLoading && !errorKey && !showingArchived && (
        <p className="rounded-xl border-2 border-saffron/60 bg-saffron/10 px-4 py-3 font-body text-sm text-foreground">
          {t('create.catalog.pickNotice')}
        </p>
      )}

      {/* El estilo elegido se ocultó o se eliminó del catálogo mientras estaba
          en uso: el formulario sigue con su copia (el proyecto viaja con ella). */}
      {!isLoading &&
        !showingArchived &&
        !selectedCatalogStyleListed(selected, listedGems) && (
          <p className="rounded-xl border-2 border-saffron/60 bg-saffron/10 px-4 py-3 font-body text-sm text-foreground">
            {t('create.catalog.selectedMissing')}
          </p>
        )}

      {/* El admin sin su lista (sin conexión o el servidor falló) ve el
          catálogo como cualquier usuario, y se le dice. */}
      {adminMode && admin.isError && (
        <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 font-body text-sm text-muted-foreground">
          {t('create.catalogAdmin.listFailed')}
          {admin.errorKey && ` ${t(admin.errorKey, { detail: '' })}`}
        </p>
      )}

      {(isLoading || (adminMode && admin.isLoading)) && (
        <p className="py-6 text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
        </p>
      )}

      {errorKey && <ErrorMessage>{t(errorKey)}</ErrorMessage>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {entries.map(({ gem, images, style }) => (
          <CatalogStyleCard
            key={gem.id}
            gem={gem}
            images={images}
            selected={!showingArchived && selectedId === gem.id}
            disabled={disabled}
            copying={copying}
            admin={
              style
                ? {
                    badge: catalogAdminBadge(style),
                    busy: admin.busy,
                    canPublish:
                      catalogPublishBlockers(style.draft).length === 0,
                    purgeDaysLeft: catalogPurgeDaysLeft(style.purgeAt),
                    onEdit: () =>
                      setEditing({ styleId: style.id, generateOnOpen: false }),
                    onGenerateSamples: () =>
                      setEditing({ styleId: style.id, generateOnOpen: true }),
                    onPublish: () => publish(style),
                    onHide: () => hide(style),
                    onDelete: () => remove(style),
                    onRestore: () => restore(style),
                  }
                : undefined
            }
            // Una archivada no se elige para el video: el clic la muestra.
            onSelect={() =>
              showingArchived
                ? openCatalogStyleViewer({ catalogStyleId: gem.id })
                : select(gem, characterOf(gem))
            }
            onView={() => openCatalogStyleViewer({ catalogStyleId: gem.id })}
            onCopy={() => void copy(gem, characterOf(gem))}
          />
        ))}
        {adminList && !showingArchived && (
          <NewStyleCard
            title={t('create.catalogAdmin.createCard')}
            hint={t('create.catalogAdmin.createCardHint')}
            disabled={disabled || admin.busy}
            onCreate={() =>
              setEditing({ styleId: null, generateOnOpen: false })
            }
          />
        )}
      </div>

      {/* Los avisos (la copia a Mi estilo y las acciones del admin) van
          después de una grilla larga (38 estilos) y se quedan pegados al borde
          de abajo de lo que se ve mientras la galería está en pantalla: así el
          clic siempre muestra algo. Traerlos a la vista con scroll no servía:
          al cerrarse, el menú de la tarjeta le devuelve el foco a su botón y
          eso corta el scroll. El fondo opaco tapa las tarjetas que pasan por
          debajo. */}
      {notice ? (
        <div className="sticky bottom-4 z-10 rounded-xl bg-background shadow-card-hover">
          {notice.status === 'failed' ? (
            <Alert
              tone="danger"
              title={t(`create.catalogAdmin.failed.${notice.action}`, {
                name: notice.name,
              })}
              actions={
                <DismissButton
                  label={t('create.catalogAdmin.dismiss')}
                  onClick={admin.dismissNotice}
                />
              }
            >
              {notice.errorKey && (
                <p>{t(notice.errorKey, { detail: notice.errorDetail })}</p>
              )}
            </Alert>
          ) : (
            <p
              role="status"
              className="flex items-center gap-2 rounded-xl border-2 border-saffron/30 bg-saffron/5 px-4 py-3 font-body text-sm text-foreground"
            >
              {notice.status === 'working' ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-saffron" />
              ) : (
                <Check className="h-4 w-4 shrink-0 text-emerald-500" />
              )}
              <span className="min-w-0 flex-1">
                <Trans
                  i18nKey={`create.catalogAdmin.${notice.status}.${notice.action}`}
                  values={{ name: notice.name }}
                  components={{
                    badge: <span className={CATALOG_ORIGIN_BADGE_CLASS} />,
                  }}
                />
              </span>
              {notice.status === 'done' && (
                <DismissButton
                  label={t('create.catalogAdmin.dismiss')}
                  onClick={admin.dismissNotice}
                />
              )}
            </p>
          )}
        </div>
      ) : (
        copyRequest &&
        (copying || copyFailed) && (
          <div className="sticky bottom-4 z-10 rounded-xl bg-background shadow-card-hover">
            {copying ? (
              <p
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
            ) : (
              // El titular basta cuando el texto del código es del formulario
              // de Crear (videosApi.catalogCopyErrorKey devuelve null).
              <Alert
                tone="danger"
                title={t('create.catalog.copyFailed', {
                  name: copyRequest.name,
                })}
                actions={
                  <DismissButton
                    label={t('create.catalog.copyFailedDismiss')}
                    onClick={dismissCopyFailure}
                  />
                }
              >
                {copyErrorKey && <p>{t(copyErrorKey)}</p>}
              </Alert>
            )}
          </div>
        )
      )}

      {viewingEntry && (
        <CatalogStyleModal
          // Un estilo distinto = un borrador distinto: el modal siembra su
          // modo desde `initialCharacter` UNA sola vez.
          key={viewingEntry.gem.id}
          gem={viewingEntry.gem}
          images={viewingEntry.images}
          initialCharacter={characterOf(viewingEntry.gem)}
          inUse={selectedId === viewingEntry.gem.id}
          // Lo que dice el botón y el modo quieto, solo si se copia ESTE
          // estilo; el botón no lanza otra copia mientras corre cualquiera.
          copying={copying && copyRequest?.gem.id === viewingEntry.gem.id}
          copyDisabled={copying}
          script={script}
          promptModel={promptModel}
          onCharacterChange={(character) =>
            changeCharacter(viewingEntry.gem, character)
          }
          onUse={(character) => use(viewingEntry.gem, character)}
          onCopy={(character) => void copy(viewingEntry.gem, character)}
          onClose={() => closeCatalogStyleViewer()}
        />
      )}

      {/* El modal del admin: un estilo nuevo, o uno de la lista mientras siga
          en ella (si otro admin lo eliminó, se cierra solo). */}
      {editing && adminList && (editing.styleId === null || editingStyle) && (
        <CatalogAdminModal
          key={editing.styleId ?? 'new'}
          style={editingStyle}
          samplesBaseUrl={samplesBaseUrl}
          generateOnOpen={editing.generateOnOpen}
          admin={admin}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

// Las muestras de una gema del sidecar como URLs: las empaquetadas tal cual y
// las sincronizadas por convertFileSrc, con su mtime para romper la caché.
function sampleUrls(gem: CatalogGem): string[] {
  return catalogSampleSources(gem).map((source) =>
    source.kind === 'packaged'
      ? source.url
      : videosApi.imageSource(source.path, source.mtimeMs),
  )
}

interface ViewButtonProps {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}

// Una pastilla del filtro del admin: la activa en amarillo, como las etiquetas
// de comportamiento.
function ViewButton({ active, disabled, onClick, children }: ViewButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 font-display text-xs font-bold transition-colors disabled:cursor-default disabled:opacity-50',
        active
          ? 'border-saffron bg-saffron/15 text-foreground'
          : 'border-border bg-background text-muted-foreground hover:border-saffron/60 hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

interface DismissButtonProps {
  label: string
  onClick: () => void
}

function DismissButton({ label, onClick }: DismissButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      onClick={onClick}
      className="h-7 w-7 shrink-0 rounded-lg text-muted-foreground"
    >
      <X className="h-4 w-4" />
    </Button>
  )
}
