import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Loader2, Plus } from 'lucide-react'
import { CustomStyleCard } from '@/modules/videos/components/CustomStyleCard'
import { CustomStyleModal } from '@/modules/videos/components/CustomStyleModal'
import {
  closeCustomStyleEditor,
  openCustomStyleEditor,
  useCustomStyleEditor,
} from '@/modules/videos/hooks/useCustomStyleEditor'
import { useCustomStyles } from '@/modules/videos/hooks/useCustomStyles'
import { newCustomStyleId } from '@/modules/videos/constants'
import { selectedCustomStyleFrom } from '@/modules/videos/utilities/selectedCustomStyle'
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
  onSelect: (style: SelectedCustomStyle | null) => void
}

const EMPTY_DRAFT: CustomStyleDraft = { name: '', systemPrompt: '', shots: [] }

function toDraft(style: CustomStyleSummary): CustomStyleDraft {
  return {
    name: style.name,
    systemPrompt: style.systemPrompt ?? '',
    shots: style.shots,
    ...(style.character ? { character: style.character } : {}),
  }
}

// Galería de estilos propios (port de GaleriaEstilosPropios del origen): una
// tarjeta por estilo guardado + «Crear estilo» SIEMPRE al final, con la misma
// silueta. Arranca VACÍA (v1.35.0 del origen: el estilo de la casa no existe
// acá) y el submit queda bloqueado hasta elegir una tarjeta (formBlockers).
// Qué gema está abierta en el editor vive en un store compartido: la sección
// de personaje abre desde sus chips el editor de la gema EN USO.
export function CustomStyleGallery({
  selected,
  disabled,
  script,
  promptModel,
  onSelect,
}: CustomStyleGalleryProps) {
  const { t } = useTranslation()
  const { styles, isLoading, saveStyle, deleteStyle, saving } =
    useCustomStyles()

  // Estilo abierto en el modal; null = cerrado. El borrador inicial sale de
  // la LISTA VIVA: el editor abre siempre con lo que hay en disco.
  const editing = useCustomStyleEditor()
  const editingStyle = editing
    ? styles.find((style) => style.id === editing.styleId)
    : undefined

  // Si la galería se desmonta con el editor abierto (cambio a Catálogo), el
  // pedido no queda colgado para la próxima vez.
  useEffect(() => closeCustomStyleEditor, [])

  const openCreate = () => {
    if (disabled) return
    openCustomStyleEditor({ styleId: newCustomStyleId(), isNew: true })
  }

  const openEdit = (style: CustomStyleSummary, generateOnOpen: boolean) => {
    openCustomStyleEditor({ styleId: style.id, generateOnOpen })
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
    await saveStyle(payload)
    // Una tarjeta recién creada queda EN USO: la persona la acaba de armar
    // para usarla. Una editada solo si ya lo estaba — editar un estilo no
    // cambia cuál se usa (origen).
    if (!wasNew && selected?.styleId !== payload.id) return
    onSelect({
      styleId: payload.id,
      name: payload.name,
      systemPrompt: payload.systemPrompt ?? '',
      shots: payload.shots ?? [],
      ...(payload.character ? { character: payload.character } : {}),
    })
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
            {t('create.customStyles.galleryHint')}
          </p>
        </div>
      </div>

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
            onSelect={() => onSelect(selectedCustomStyleFrom(style))}
            onEdit={() => openEdit(style, false)}
            onGenerateSamples={() => openEdit(style, true)}
            onDelete={() => void removeStyle(style)}
          />
        ))}

        {/* La tarjeta de CREAR es fija: solo crea, nunca se transforma en un
            estilo. MISMA silueta que una tarjeta de estilo (zona 4:3 arriba +
            pie de dos líneas): mide lo mismo esté donde esté, y la grilla
            crece hacia abajo. */}
        <div
          role="button"
          tabIndex={disabled ? undefined : 0}
          onClick={openCreate}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            openCreate()
          }}
          className="group flex cursor-pointer select-none flex-col overflow-hidden rounded-2xl border-2 border-dashed border-border bg-card text-muted-foreground outline-none transition-all hover:border-saffron/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-saffron/50"
        >
          <div className="flex aspect-[4/3] items-center justify-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-current transition-transform group-hover:scale-110">
              <Plus className="h-6 w-6" />
            </span>
          </div>
          <div className="px-3.5 py-2.5 text-left">
            <p className="truncate font-display text-base font-bold text-foreground">
              {t('create.customStyles.createCard')}
            </p>
            <p className="truncate font-body text-xs text-muted-foreground">
              {t('create.customStyles.createCardHint')}
            </p>
          </div>
        </div>
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
          // estado desde `initial` UNA sola vez, así que la clave es el id y
          // no el contenido (una invalidación de la lista con el modal
          // abierto no re-siembra lo tipeado).
          key={editing.styleId}
          styleId={editing.styleId}
          initial={editingStyle ? toDraft(editingStyle) : EMPTY_DRAFT}
          // Derivadas de la query viva: al terminar de generar, la
          // invalidación refetchea y el modal muestra las muestras solo.
          samples={editingStyle?.samples ?? []}
          saving={saving}
          generateOnOpen={editing.generateOnOpen}
          script={script}
          promptModel={promptModel}
          onSave={save}
          onClose={closeCustomStyleEditor}
        />
      )}
    </div>
  )
}
