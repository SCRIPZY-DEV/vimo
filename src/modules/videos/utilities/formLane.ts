import type {
  CreateFormValue,
  FormLane,
  TabSwitchSelection,
} from '@/modules/videos/types/create'
import type {
  SelectedCustomStyle,
  StyleSource,
} from '@/modules/videos/types/styles'

type LaneChoice = Pick<CreateFormValue, 'styleSource' | 'customStyle'>

// Por qué carril sale el video. La pestaña Mi estilo es siempre `custom`; en
// la pestaña Catálogo, un estilo elegido con id de catálogo es una gema del
// catálogo nuevo (Entrega 2) y cualquier otra cosa sigue por el catálogo viejo
// (sin el interruptor o sin elegir). Puro: lo corre
// scripts/test/check-app-catalog-style.mjs con Node.
export function laneOf(form: LaneChoice): FormLane {
  if (form.styleSource === 'custom') return 'custom'
  if (form.customStyle?.catalogStyleId) return 'catalog-gem'
  return 'legacy-catalog'
}

// Con qué carril se arma la pantalla de Crear. Con el catálogo nuevo activo
// (interruptor encendido, o la demo: spec demo v4 §2), la pestaña Catálogo
// se ve como el carril de sus estilos aun antes de elegir tarjeta (P4): sin
// cantidad de escenas, frecuencia ni «Confirmar escenas», y con el modelo de
// prompts, como Mi estilo. El envío sigue a `laneOf`; sin tarjeta lo frena
// formBlockers.
export function displayLaneOf(form: LaneChoice, newCatalog: boolean): FormLane {
  if (newCatalog && form.styleSource === 'catalog') return 'catalog-gem'
  return laneOf(form)
}

// El estilo elegido que vale en la pestaña. Un estilo del catálogo solo vale
// en la pestaña Catálogo con el catálogo nuevo activo: en Mi estilo no es un
// estilo propio (create-video-project rechazaría su `styleId`), y sin el
// catálogo nuevo la pestaña Catálogo elige por `styleId`. Una gema de Mi
// estilo queda como está, el mismo objeto: sin el interruptor sigue guardada
// en la pestaña Catálogo para cuando se vuelva, como siempre.
export function customStyleForTab(
  form: LaneChoice,
  newCatalog: boolean,
): SelectedCustomStyle | null {
  if (!form.customStyle?.catalogStyleId) return form.customStyle
  if (newCatalog && form.styleSource === 'catalog') return form.customStyle
  return null
}

// Una selección por pestaña con el catálogo nuevo: al pasar a `styleSource`,
// qué estilo queda en uso y cuál se guarda para la otra pestaña. Lo decide el
// dato, no de qué pestaña viene: a Catálogo solo entra un estilo del catálogo
// (con `catalogStyleId`) y a Mi estilo solo una gema propia (sin él). Se
// prefiere lo guardado para la pestaña de destino; si no hay, sirve lo que
// estaba en uso si es de ella (una gema propia que quedó en Catálogo al
// encenderse el interruptor vuelve a Mi estilo en vez de perderse). Lo que es
// de la otra pestaña queda guardado; nada cae en la pestaña equivocada.
export function tabSwitchSelection(
  current: SelectedCustomStyle | null,
  stored: SelectedCustomStyle | null,
  styleSource: StyleSource,
): TabSwitchSelection {
  const otherSource = styleSource === 'catalog' ? 'custom' : 'catalog'

  return {
    customStyle:
      [stored, current].find((style) => belongsToTab(style, styleSource)) ??
      null,
    otherTabStyle:
      [current, stored].find((style) => belongsToTab(style, otherSource)) ??
      null,
  }
}

// ¿Es una selección de esa pestaña? Las de Catálogo traen `catalogStyleId`;
// las de Mi estilo (también la copia de «Pasar a mi estilo»), no.
function belongsToTab(
  style: SelectedCustomStyle | null,
  styleSource: StyleSource,
): style is SelectedCustomStyle {
  if (!style) return false
  return Boolean(style.catalogStyleId) === (styleSource === 'catalog')
}
