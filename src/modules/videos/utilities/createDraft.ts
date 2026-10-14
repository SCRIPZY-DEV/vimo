import type { CreateFormValue } from '@/modules/videos/types/create'
import type { SelectedCustomStyle } from '@/modules/videos/types/styles'

// Borrador de Crear que sobrevive a la navegación dentro de la sesión (spec
// §9): «Crear escenario», «Administrar avatares» o «Ir a Claves API» sacan de
// Crear y, al volver, el formulario sigue como estaba. Vive en memoria del
// módulo (no en disco): cerrar sesión no lo borra, como la tarea en curso; un
// reinicio sí. Crear lo siembra al montarse, lo escribe en cada cambio y al
// volver al formulario («Crear otro» o cerrar la confirmación de escenas), y
// lo descarta cuando el proyecto de una generación ya existe. En la demo no
// se usa. Sin imports de runtime: lo corre scripts/test/check-create-draft.mjs
// con Node, sin bundler.
export interface CreateDraft {
  form: CreateFormValue
  // La selección de la pestaña que no está a la vista (catálogo nuevo).
  otherTabStyle: SelectedCustomStyle | null
}

// Guarda la referencia tal cual, sin copiar: es el estado de Crear, que nunca
// se muta (cada cambio arma un objeto nuevo). Copiar en cada tecla no
// protegería nada y clonaría el guion entero.
let draft: CreateDraft | null = null

export function readCreateDraft(): CreateDraft | null {
  return draft
}

export function writeCreateDraft(next: CreateDraft): void {
  draft = next
}

export function clearCreateDraft(): void {
  draft = null
}
