import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Loader2 } from 'lucide-react'
import { useAccessFeature } from '@/modules/common/hooks/useAccessFeature'
import { CustomStyleCard } from '@/modules/videos/components/CustomStyleCard'
import { CustomStyleModal } from '@/modules/videos/components/CustomStyleModal'
import { GemMigrationNotice } from '@/modules/videos/components/GemMigrationNotice'
import { NewStyleCard } from '@/modules/videos/components/NewStyleCard'
import {
  closeCustomStyleEditor,
  markCustomStyleEditorSaved,
  openCustomStyleEditor,
  useCustomStyleEditor,
} from '@/modules/videos/hooks/useCustomStyleEditor'
import { useCustomStyles } from '@/modules/videos/hooks/useCustomStyles'
import {
  adaptPastedGem,
  beginGemMigrationVisit,
  dismissGemMigration,
  markGemMigrationsSeen,
  migrateGemOnce,
  retryGemMigration,
  useGemMigrations,
} from '@/modules/videos/hooks/useGemMigrations'
import { newCustomStyleId } from '@/modules/videos/constants'
import { showsGalleryNotice } from '@/modules/videos/utilities/gemMigrations'
import {
  customStyleDraftFrom,
  selectedCustomStyleFrom,
} from '@/modules/videos/utilities/selectedCustomStyle'
import type { CustomStyleEditorRequest } from '@/modules/videos/hooks/useCustomStyleEditor'
import type {
  CustomStyleDraft,
  SelectedCustomStyle,
} from '@/modules/videos/types/styles'
import type {
  CustomStyleSummary,
  StyleSavePayload,
} from '@pipeline/types/styles.ts'

interface CustomStyleGalleryProps {
  selected: SelectedCustomStyle | null
  disabled: boolean
  // Guion y modelo del formulario: el selector de personaje del modal los usa
  // para diseñar un personaje nuevo coherente con esta gema (ADR-0020).
  script: string
  promptModel: string | null
  // La copia de «Pasar a mi estilo» que acaba de llegar del catálogo: la
  // galería abre su modal apenas se monta y avisa; null = ninguna.
  arrivingStyleId: string | null
  onSelect: (style: SelectedCustomStyle | null) => void
  onArrivalOpened: () => void
}

const EMPTY_DRAFT: CustomStyleDraft = { name: '', systemPrompt: '', shots: [] }

// Qué editor dibuja el modal. Una gema nueva conserva el suyo al guardarse;
// una vieja que termina de migrarse pasa a «template» y la clave nueva del
// modal lo vuelve a sembrar con sus secciones.
function editorLayoutOf(
  request: CustomStyleEditorRequest,
  style: CustomStyleSummary | undefined,
): string {
  if (request.isNew) return 'new'
  if (style?.sections) return 'template'
  return 'legacy'
}

// Galería de estilos propios (port de GaleriaEstilosPropios del origen): una
// tarjeta por estilo guardado + «Crear estilo» SIEMPRE al final, con la misma
// silueta. Arranca VACÍA (v1.35.0 del origen: el estilo de la casa no existe
// acá) y el submit queda bloqueado hasta elegir una tarjeta (formBlockers).
// Qué gema está abierta en el editor vive en un store compartido: la sección
// de personaje abre desde sus chips el editor de la gema EN USO. Con la
// plantilla encendida (ADR-0048), una gema vieja se actualiza sola la primera
// vez que se abre o se elige (spec §4.4), sin bloquear su uso; como se guarda
// sin que la persona vea las secciones, queda un aviso para revisarlas, arriba
// de las tarjetas, hasta que lo descarta o sale de la pestaña (una gema ya
// adaptada lo dice después en su tarjeta).
export function CustomStyleGallery({
  selected,
  disabled,
  script,
  promptModel,
  arrivingStyleId,
  onSelect,
  onArrivalOpened,
}: CustomStyleGalleryProps) {
  const { t } = useTranslation()
  const { styles, isLoading, saveStyle, showSavedStyle, deleteStyle, saving } =
    useCustomStyles()
  const gemTemplateEnabled = useAccessFeature('gemTemplate')
  const migrations = useGemMigrations()
  // Esta visita a la pestaña (la galería se monta al entrar): el aviso de una
  // gema ya adaptada dura lo que dura la visita en que se vio.
  const [visit] = useState(beginGemMigrationVisit)

  // Estilo abierto en el modal; null = cerrado. El borrador inicial sale de
  // la LISTA VIVA: el editor abre siempre con lo que hay en disco.
  const editing = useCustomStyleEditor()
  const editingStyle = editing
    ? styles.find((style) => style.id === editing.styleId)
    : undefined

  // Si la galería se desmonta con el editor abierto (cambio a Catálogo), el
  // pedido no queda colgado para la próxima vez.
  useEffect(() => closeCustomStyleEditor, [])

  // La copia que llega del catálogo abre su modal. Lo pide la galería ya
  // montada y no el formulario al cambiar de pestaña: un pedido hecho antes
  // lo cerraría el efecto de arriba cuando React, en desarrollo, desmonta y
  // vuelve a montar los efectos de un componente nuevo (StrictMode).
  useEffect(() => {
    if (!arrivingStyleId) return
    openCustomStyleEditor({ styleId: arrivingStyleId })
    onArrivalOpened()
  }, [arrivingStyleId, onArrivalOpened])

  // Abrir una gema vieja en el editor la manda a migrar, una vez por sesión.
  // Efecto y no manejador: el editor también se abre desde el chip de
  // personaje de Crear, no solo desde esta galería.
  useEffect(() => {
    if (!gemTemplateEnabled || !editingStyle) return
    migrateGemOnce(editingStyle)
  }, [gemTemplateEnabled, editingStyle])

  const openCreate = () => {
    if (disabled) return
    openCustomStyleEditor({ styleId: newCustomStyleId(), isNew: true })
  }

  const openEdit = (style: CustomStyleSummary, generateOnOpen: boolean) => {
    openCustomStyleEditor({ styleId: style.id, generateOnOpen })
  }

  // Elegir una gema vieja también la manda a migrar; mientras tanto se usa
  // como está y el envío de Crear no espera.
  const selectStyle = (style: CustomStyleSummary) => {
    onSelect(selectedCustomStyleFrom(style))
    if (gemTemplateEnabled) migrateGemOnce(style)
  }

  const removeStyle = async (style: CustomStyleSummary) => {
    if (
      !window.confirm(
        t('create.customStyles.deleteConfirm', { name: style.name }),
      )
    )
      return
    await deleteStyle(style.id)
    if (selected?.styleId === style.id) onSelect(null)
  }

  const save = async (payload: StyleSavePayload) => {
    const wasNew = !styles.some((style) => style.id === payload.id)
    const { entry } = await saveStyle(payload)
    // Una tarjeta recién creada queda EN USO: la persona la acaba de armar
    // para usarla. Una editada solo si ya lo estaba — editar un estilo no
    // cambia cuál se usa (origen). El snapshot sale de lo que quedó guardado
    // (con sus secciones, si es de plantilla), no del pedido.
    if (wasNew || selected?.styleId === payload.id)
      onSelect(selectedCustomStyleFrom(entry))
    return entry
  }

  // «Preparar con IA»: la gema pegada se guarda como texto y se adapta en
  // segundo plano (el mismo trabajo que migra una gema vieja), aunque se
  // cierre el modal. La adaptación arranca antes de que la lista traiga la
  // gema: así la migración automática de esa gema de texto no se adelanta con
  // otro origin. Con la gema ya en la lista, el modal pasa a ella (con su aviso
  // «Generando adaptación…») y, al terminar, a sus secciones.
  const adaptPasted = async (payload: StyleSavePayload) => {
    const entry = await save(payload)
    adaptPastedGem(entry)
    showSavedStyle(entry)
    markCustomStyleEditorSaved(entry.id)
  }

  // La adaptación de cada gema, para su tarjeta (en vuelo: el avance encima).
  const migrationOf = (style: CustomStyleSummary) =>
    gemTemplateEnabled ? (migrations.get(style.id) ?? null) : null
  // Avisos de migración de las gemas de la lista, en su orden: las fallidas y
  // las hechas que todavía se avisan en esta visita. Una en vuelo se ve en su
  // tarjeta, no acá.
  const migrationNotices = styles.flatMap((style) => {
    const migration = migrationOf(style)
    return migration && showsGalleryNotice(migration, visit)
      ? [{ style, migration }]
      : []
  })
  const noticedStyleIds = migrationNotices.map(({ style }) => style.id)

  // La galería le cuenta al store qué avisos tiene a la vista: así los de las
  // gemas ya adaptadas no vuelven a salir en la próxima visita. Sin
  // dependencias a propósito: lo que ya está anotado no cambia nada.
  useEffect(() => {
    markGemMigrationsSeen(noticedStyleIds, visit)
  })
  const editingMigration =
    gemTemplateEnabled && editingStyle
      ? (migrations.get(editingStyle.id) ?? null)
      : null

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
            {t('create.customStyles.galleryHint')}
          </p>
        </div>
      </div>

      {/* Entre el título y la galería: debajo de una lista larga de estilos el
          aviso quedaba fuera de la vista. */}
      {migrationNotices.map(({ style, migration }) => (
        <GemMigrationNotice
          key={style.id}
          migration={migration}
          named
          onRetry={() => retryGemMigration(style)}
          reviewDisabled={disabled}
          onReview={() => openEdit(style, false)}
          onDismiss={() => dismissGemMigration(style.id)}
        />
      ))}

      {isLoading && (
        <p className="py-6 text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {styles.map((style) => (
          <CustomStyleCard
            key={style.id}
            style={style}
            selected={selected?.styleId === style.id}
            disabled={disabled}
            migration={migrationOf(style)}
            onSelect={() => selectStyle(style)}
            onEdit={() => openEdit(style, false)}
            onGenerateSamples={() => openEdit(style, true)}
            onDelete={() => void removeStyle(style)}
          />
        ))}

        <NewStyleCard
          title={t('create.customStyles.createCard')}
          hint={t('create.customStyles.createCardHint')}
          disabled={disabled}
          onCreate={openCreate}
        />
      </div>

      {/* Sin tarjeta elegida el video no sale: se dice acá, junto a la
          galería (origen), además de en la lista de bloqueos del envío. */}
      {!selected && !isLoading && (
        <p className="rounded-xl border-2 border-saffron/60 bg-saffron/10 px-4 py-3 font-body text-sm text-foreground">
          {t('create.customStyles.pickNotice')}
        </p>
      )}

      {editing && (editing.isNew || editingStyle) && (
        <CustomStyleModal
          // Una gema distinta = un borrador distinto: el modal siembra su
          // estado desde `initial` UNA sola vez, así que la clave es el id (y
          // el editor, que cambia cuando una gema vieja termina de migrarse)
          // y no el contenido: una invalidación de la lista con el modal
          // abierto no re-siembra lo tipeado.
          key={`${editing.styleId}:${editorLayoutOf(editing, editingStyle)}`}
          styleId={editing.styleId}
          initial={
            editingStyle ? customStyleDraftFrom(editingStyle) : EMPTY_DRAFT
          }
          isNew={editing.isNew}
          migration={editingMigration}
          onRetryMigration={() => {
            if (editingStyle) retryGemMigration(editingStyle)
          }}
          onDismissMigration={() => dismissGemMigration(editing.styleId)}
          // Derivadas de la query viva: al terminar de generar, la
          // invalidación refetchea y el modal muestra las muestras solo.
          samples={editingStyle?.samples ?? []}
          saving={saving}
          generateOnOpen={editing.generateOnOpen}
          script={script}
          promptModel={promptModel}
          onSave={async (payload) => {
            await save(payload)
          }}
          onAdaptPastedGem={adaptPasted}
          onClose={closeCustomStyleEditor}
        />
      )}
    </div>
  )
}
