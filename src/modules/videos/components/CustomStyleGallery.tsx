import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Plus } from 'lucide-react'
import { CustomStyleCard } from '@/modules/videos/components/CustomStyleCard'
import { CustomStyleModal } from '@/modules/videos/components/CustomStyleModal'
import { useCustomStyles } from '@/modules/videos/hooks/useCustomStyles'
import { newCustomStyleId } from '@/modules/videos/constants'
import type { SelectedCustomStyle } from '@/modules/videos/types/styles'
import type { CustomStyleSummary } from '@pipeline/types/styles.ts'

interface CustomStyleGalleryProps {
  selected: SelectedCustomStyle | null
  disabled: boolean
  onSelect: (style: SelectedCustomStyle | null) => void
}

function toSelected(style: CustomStyleSummary): SelectedCustomStyle {
  return {
    styleId: style.id,
    name: style.name,
    systemPrompt: style.systemPrompt,
    shots: style.shots,
  }
}

// Galería de estilos propios: tarjetas + «Crear estilo» siempre al final.
// Arranca VACÍA (v1.35.0 del origen: el estilo de la casa no existe acá) y
// el submit queda bloqueado hasta elegir una tarjeta (formBlockers).
export function CustomStyleGallery({
  selected,
  disabled,
  onSelect,
}: CustomStyleGalleryProps) {
  const { t } = useTranslation()
  const { styles, isLoading, saveStyle, deleteStyle, saving } =
    useCustomStyles()

  // Estilo abierto en el modal; null = cerrado.
  const [editing, setEditing] = useState<{
    styleId: string
    initial: { name: string; systemPrompt: string; shots: string[] }
  } | null>(null)

  const openCreate = () => {
    setEditing({
      styleId: newCustomStyleId(),
      initial: { name: '', systemPrompt: '', shots: [] },
    })
  }

  const openEdit = (style: CustomStyleSummary) => {
    setEditing({
      styleId: style.id,
      initial: {
        name: style.name,
        systemPrompt: style.systemPrompt,
        shots: style.shots,
      },
    })
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

  return (
    <div className="space-y-3">
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
            onSelect={() => onSelect(toSelected(style))}
            onEdit={() => openEdit(style)}
            onDelete={() => void removeStyle(style)}
          />
        ))}

        {/* Siempre al final, con la silueta de una tarjeta para que la fila
            no colapse cuando está sola (detalle del origen). */}
        <button
          type="button"
          disabled={disabled}
          onClick={openCreate}
          className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-card text-muted-foreground transition-all hover:border-saffron/60 hover:text-foreground"
        >
          <Plus className="h-6 w-6" />
          <span className="font-display text-sm font-bold">
            {t('create.customStyles.createCard')}
          </span>
        </button>
      </div>

      {editing && (
        <CustomStyleModal
          styleId={editing.styleId}
          initial={editing.initial}
          // Derivadas de la query viva: al terminar de generar, la
          // invalidación refetchea y el modal muestra las muestras solo.
          samples={
            styles.find((style) => style.id === editing.styleId)?.samples ?? []
          }
          saving={saving}
          onSave={async (payload) => {
            await saveStyle(payload)
            // El estilo recién guardado queda «en uso» (flujo del origen:
            // crear ya lo marca elegido para este video).
            onSelect({
              styleId: payload.id,
              name: payload.name,
              systemPrompt: payload.systemPrompt,
              shots: payload.shots ?? [],
            })
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
