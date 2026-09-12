import type { ReactNode } from 'react'
import { cn } from '@/modules/common/utilities/cn'

export type StyleCharacterChipTone = 'ocean' | 'destructive' | 'saffron'
export type StyleCharacterChipKind =
  'fixed' | 'fixed-missing' | 'style-decides' | 'withdrawn'

interface StyleCharacterChipProps {
  kind: StyleCharacterChipKind
  tone: StyleCharacterChipTone
  // Con una gema editable el chip es un botón que abre su editor; sin ella
  // es un cartel (sin clic, sin «toca aquí»): nunca un botón muerto.
  editable: boolean
  onEdit: () => void
  children: ReactNode
}

const TONE_CLASS: Record<StyleCharacterChipTone, string> = {
  ocean: 'border-ocean/40 bg-ocean/10',
  destructive: 'border-destructive/40 bg-destructive/5',
  saffron: 'border-saffron/60 bg-saffron/10',
}

const HOVER_CLASS: Record<StyleCharacterChipTone, string> = {
  ocean: 'hover:bg-ocean/15',
  destructive: 'hover:bg-destructive/10',
  saffron: 'hover:bg-saffron/15',
}

// Cartel de la sección de personaje que cuenta una decisión del ESTILO en
// uso (port de los chips de EditorGuion del origen). `type="button"` es
// obligatorio: un chip dentro de un formulario sin él sería un submit (E38).
export function StyleCharacterChip({
  kind,
  tone,
  editable,
  onEdit,
  children,
}: StyleCharacterChipProps) {
  const baseClass = cn(
    'w-full rounded-xl border-2 px-4 py-3 text-left',
    TONE_CLASS[tone],
  )

  if (!editable) {
    return (
      <div data-style-character-chip={kind} role="status" className={baseClass}>
        {children}
      </div>
    )
  }

  return (
    <button
      type="button"
      data-style-character-chip={kind}
      aria-haspopup="dialog"
      onClick={onEdit}
      className={cn(baseClass, 'transition-colors', HOVER_CLASS[tone])}
    >
      {children}
    </button>
  )
}
