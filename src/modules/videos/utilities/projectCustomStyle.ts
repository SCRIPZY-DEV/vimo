import type { SelectedCustomStyle } from '@/modules/videos/types/styles'
import type { ProjectCustomStyle } from '@pipeline/types/video-project.ts'

// El estilo elegido como snapshot del proyecto (options.customStyle). Una gema
// de plantilla viaja con sus secciones, su versión y su filtro, sin
// `systemPrompt` (ni siquiera el '' que trae su snapshot) ni `shots`:
// create-video-project exige uno de los dos caminos, nunca ambos (spec §4.2).
// Una gema del catálogo nuevo es de plantilla y suma su `catalogStyleId` (plan
// E2 §5.4); una de Mi estilo no lo trae, ni siquiera la copia de «Pasar a mi
// estilo». Una vieja viaja EXACTAMENTE como antes de ADR-0048 (mismos campos,
// mismo orden), así el carril verbatim la recibe byte por byte. Decide el
// dato, no el interruptor: una gema de plantilla sigue viajando por secciones
// aunque el interruptor se apague. Puro: lo corre
// scripts/test/check-app-custom-style-payload.mjs.
export function projectCustomStyleFrom(
  style: SelectedCustomStyle,
): ProjectCustomStyle {
  const character = style.character ? { character: style.character } : {}
  if (style.sections)
    return {
      styleId: style.styleId,
      ...(style.catalogStyleId ? { catalogStyleId: style.catalogStyleId } : {}),
      name: style.name,
      sections: style.sections,
      ...(style.templateVersion === undefined
        ? {}
        : { templateVersion: style.templateVersion }),
      ...(style.colorFilter ? { colorFilter: style.colorFilter } : {}),
      ...character,
    }

  return {
    styleId: style.styleId,
    name: style.name,
    systemPrompt: style.systemPrompt,
    shots: style.shots,
    ...character,
  }
}
