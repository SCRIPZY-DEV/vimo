import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Archive, Check, Loader2, X } from 'lucide-react'
import { Alert } from '@/modules/common/components/Alert'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { useAccessAdmin } from '@/modules/common/hooks/useAccessAdmin'
import { useAccessFeature } from '@/modules/common/hooks/useAccessFeature'
import { Button } from '@/modules/common/ui/button'
import { videosApi } from '@/modules/videos/api'
import { CatalogAdminModal } from '@/modules/videos/components/CatalogAdminModal'
import { CatalogStyleCard } from '@/modules/videos/components/CatalogStyleCard'
import { CatalogStyleModal } from '@/modules/videos/components/CatalogStyleModal'
import { NewStyleCard } from '@/modules/videos/components/NewStyleCard'
import { StyleCloneCreateCard } from '@/modules/videos/components/StyleCloneCreateCard'
import { StyleCloneModal } from '@/modules/videos/components/StyleCloneModal'
import { StyleCloneSessionCard } from '@/modules/videos/components/StyleCloneSessionCard'
import { useCatalogAdmin } from '@/modules/videos/hooks/useCatalogAdmin'
import {
  closeCatalogStyleViewer,
  openCatalogStyleViewer,
  useCatalogStyleViewer,
} from '@/modules/videos/hooks/useCatalogStyleViewer'
import { useCatalogStyles } from '@/modules/videos/hooks/useCatalogStyles'
import { useCustomStyles } from '@/modules/videos/hooks/useCustomStyles'
import {
  closeStyleCloneModal,
  openStyleCloneModal,
  useStyleCloneModal,
} from '@/modules/videos/hooks/useStyleCloneModal'
import {
  discardStyleClone,
  dismissFinishedStyleClone,
  useStyleClones,
} from '@/modules/videos/hooks/useStyleClones'
import { CATALOG_ORIGIN_BADGE_CLASS } from '@/modules/videos/constants'
import { cn } from '@/modules/common/utilities/cn'
import {
  catalogAdminBadge,
  catalogAdminSampleImages,
  catalogDraftFromStyleClone,
  catalogGemFromContent,
  catalogPublishBlockers,
  catalogPurgeDaysLeft,
  splitCatalogAdminStyles,
} from '@/modules/videos/utilities/catalogAdminDraft'
import { STYLE_CLONE_SESSION_LIMIT } from '@/modules/videos/utilities/styleCloneSessions'
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
import type {
  CatalogGem,
  CatalogStyleContent,
} from '@pipeline/types/catalog.ts'
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
  // Si viene, solo estos estilos se muestran, en el orden del catálogo (la
  // demo: los que tienen historia en el formato elegido). Ausente = todos.
  visibleIds?: string[]
  // La demo (spec demo v4 §2): nada escribe en el catálogo compartido ni en
  // Mi estilo, así que no hay «Pasar a mi estilo», herramientas del admin ni
  // «Crear estilo con IA». «Ver» sigue, sin elegir el modo de personaje.
  demo?: boolean
  // En la demo, el modo de personaje de cada estilo: el de su historia. Ni se
  // elige ni se recuerda, ni sale de la memoria de la app o de las muestras.
  // Ausente fuera de la demo.
  storyCharacterOf?: (catalogStyleId: string) => StyleCharacter
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

// El modal del admin abierto: un estilo (por id) o uno nuevo (null), que
// puede venir ya armado por «Crear estilo con IA» (ADR-0050).
interface AdminEditing {
  styleId: string | null
  generateOnOpen: boolean
  initialDraft?: CatalogStyleContent
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
// administrar. Archivar guarda el estilo 30 días: lo archivado se ve aparte,
// con el filtro «Archivados», solo para restaurarlo antes de que el servidor
// lo purgue. Cada acción del admin avisa con un toast de la app. Sin
// conexión, o si esa lista falla, el admin ve el catálogo como cualquier
// usuario.
//
// Con el creador de estilo con IA (ADR-0050, nota del 2026-10-06) el admin
// tiene además «Crear estilo con IA», la misma tarjeta y el mismo recorrido
// que en Mi estilo, con destino catálogo: la clonación aprobada no se guarda
// en disco, pasa al modal del admin como un borrador ya armado (nombre,
// secciones, modos) y él la termina ahí (los otros idiomas, las etiquetas,
// las muestras) y la publica. Las clonaciones en curso de este destino se ven
// al principio de la grilla, como en Mi estilo.
//
// En la demo (spec demo v4 §2) muestra solo los estilos con historia en el
// formato y nada que escriba: ni la copia a Mi estilo ni lo del admin, aunque
// la cuenta lo sea, ni la memoria de modos. El modo de cada estilo es el de su
// historia.
export function CatalogStyleGallery({
  selected,
  disabled,
  script,
  promptModel,
  visibleIds,
  demo = false,
  storyCharacterOf,
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
  const adminMode = isAdmin && remote && videosApi.isNative() && !demo
  const admin = useCatalogAdmin(adminMode)
  const [editing, setEditing] = useState<AdminEditing | null>(null)
  const [view, setView] = useState<CatalogAdminView>('catalog')
  const selectedId = selected?.catalogStyleId ?? null
  const aiStyleCreatorEnabled = useAccessFeature('aiStyleCreator')
  // Las clonaciones de estilo con destino catálogo (las de Mi estilo viven en
  // su galería) y el modal.
  const clones = useStyleClones()
  const cloneModal = useStyleCloneModal()
  const cloneSessions = [...clones.sessions.values()].filter(
    (session) => session.target === 'catalog',
  )

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
  // Con `visibleIds`, un estilo que no está en la lista no aparece y uno de
  // la lista que no está en `visibleIds`, tampoco.
  const shownEntries = visibleIds
    ? catalogEntries.filter((entry) => visibleIds.includes(entry.gem.id))
    : catalogEntries
  const entries = showingArchived
    ? adminStyles.archived.map(entryOf)
    : shownEntries
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
  // Lo mismo con el modal de una clonación: la sesión sigue en su store.
  useEffect(() => closeStyleCloneModal, [])

  // Una clonación aprobada para el catálogo es el modal del admin con la gema
  // ya armada, derivado del store y sin estado propio: la clonación sigue ahí
  // hasta que el admin cierra el modal (si cambia de pestaña con el modal
  // abierto, lo encuentra de nuevo al volver). Lo abierto a mano manda; la
  // clonación espera a que se cierre. Si el modal de la clonación seguía
  // abierto, se cierra solo al desaparecer su sesión.
  const approvedClone = clones.finished.find(
    (item) => item.target === 'catalog',
  )
  const cloneEditing: AdminEditing | null =
    approvedClone?.target === 'catalog'
      ? {
          styleId: null,
          generateOnOpen: false,
          initialDraft: catalogDraftFromStyleClone(approvedClone.style),
        }
      : null
  const activeEditing = editing ?? cloneEditing
  const closeAdminModal = () => {
    if (editing) {
      setEditing(null)
      return
    }
    if (approvedClone) dismissFinishedStyleClone(approvedClone.sessionId)
  }

  // Descartar una clonación en curso desde su tarjeta, con la misma
  // confirmación que desde el modal.
  const discardClone = (sessionId: string) => {
    if (!window.confirm(t('create.styleClone.discardConfirm'))) return
    void discardStyleClone(sessionId)
  }

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

  // El modo de un estilo: en la demo, el de su historia; si no, el del
  // formulario si está en uso, y si no, el recordado (o el de sus muestras).
  const characterOf = (gem: CatalogGem): StyleCharacter => {
    if (storyCharacterOf) return storyCharacterOf(gem.id)
    if (selectedId === gem.id && selected?.character) return selected.character
    return readCatalogCharacter(gem, localStorage)
  }

  const select = (gem: CatalogGem, character: StyleCharacter) => {
    onSelect(selectedCatalogStyleFrom(gem, language, character))
  }

  // El modo elegido en «Ver» se recuerda para la próxima vez, salvo en la
  // demo: ahí es el de la historia y la memoria de la app no se toca.
  const remember = (gem: CatalogGem, character: StyleCharacter) => {
    if (demo) return

    rememberCatalogCharacter(gem.id, character, localStorage)
  }

  // Cada cambio de modo en «Ver» se recuerda al toque; con el estilo en uso,
  // el formulario pasa al snapshot nuevo.
  const changeCharacter = (gem: CatalogGem, character: StyleCharacter) => {
    remember(gem, character)
    if (selectedId === gem.id) select(gem, character)
  }

  const use = (gem: CatalogGem, character: StyleCharacter) => {
    remember(gem, character)
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
  // Nativo, como al borrar un estilo propio: nunca otro modal encima. Archivar
  // (el «eliminar» del catálogo): el estilo pasa a Archivados 30 días, donde
  // se puede restaurar.
  const remove = (style: AdminCatalogStyle) => {
    const name = adminName(style)
    if (!window.confirm(t('create.catalogAdmin.deleteConfirm', { name })))
      return
    admin.deleteStyle(style, name).catch(() => {})
  }
  const restore = (style: AdminCatalogStyle) => {
    admin.restoreStyle(style, adminName(style)).catch(() => {})
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
        {adminList &&
          !showingArchived &&
          cloneSessions.map((session) => (
            <StyleCloneSessionCard
              key={session.id}
              session={session}
              onOpen={() =>
                openStyleCloneModal({ kind: 'session', sessionId: session.id })
              }
              onDiscard={() => discardClone(session.id)}
            />
          ))}

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
            onCopy={demo ? undefined : () => void copy(gem, characterOf(gem))}
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
        {adminList && !showingArchived && aiStyleCreatorEnabled && (
          <StyleCloneCreateCard
            disabled={disabled || admin.busy}
            // El tope de tres cuenta las clonaciones de los dos destinos.
            full={clones.sessions.size >= STYLE_CLONE_SESSION_LIMIT}
            hint={t('create.styleClone.createCardHintCatalog')}
            onOpen={() =>
              openStyleCloneModal({ kind: 'new', target: 'catalog' })
            }
          />
        )}
      </div>

      {/* El aviso de la copia a Mi estilo va después de una grilla larga (38
          estilos) y se queda pegado al borde de abajo de lo que se ve mientras
          la galería está en pantalla: así el clic siempre muestra algo. Traerlo
          a la vista con scroll no servía: al cerrarse, el menú de la tarjeta le
          devuelve el foco a su botón y eso corta el scroll. El fondo opaco tapa
          las tarjetas que pasan por debajo. Las acciones del admin avisan con
          un toast de la app (useCatalogAdmin), no acá. */}
      {copyRequest && (copying || copyFailed) && (
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
          onCopy={
            demo
              ? undefined
              : (character) => void copy(viewingEntry.gem, character)
          }
          demo={demo}
          onClose={() => closeCatalogStyleViewer()}
        />
      )}

      {cloneModal && <StyleCloneModal target={cloneModal} />}

      {/* El modal del admin: un estilo nuevo (en blanco o con la gema de una
          clonación; el modal necesita la lista del admin, así que sin ella la
          clonación espera en el store), o uno de la lista mientras siga en
          ella (si otro admin lo eliminó, se cierra solo). La clave de una
          clonación es su sesión: un modal nuevo abierto a mano y cerrado no
          le presta su estado. */}
      {activeEditing &&
        adminList &&
        (activeEditing.styleId === null || editingStyle) && (
          <CatalogAdminModal
            key={
              editing
                ? (editing.styleId ?? 'new')
                : `clone:${approvedClone?.sessionId}`
            }
            style={editingStyle}
            initialDraft={activeEditing.initialDraft}
            samplesBaseUrl={samplesBaseUrl}
            generateOnOpen={activeEditing.generateOnOpen}
            admin={admin}
            onClose={closeAdminModal}
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
