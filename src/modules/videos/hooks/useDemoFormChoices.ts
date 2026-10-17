import { useState } from 'react'
import { useCatalogStyles } from '@/modules/videos/hooks/useCatalogStyles'
import { useCustomStyles } from '@/modules/videos/hooks/useCustomStyles'
import { characterPatchForStyle } from '@/modules/videos/utilities/characterPatchForStyle'
import {
  demoAnimationAvailable,
  demoAudioFileLabel,
  demoAvatar,
  demoAvatarGem,
  demoAvatarToggle,
  demoCatalogCharacter,
  demoComingSoonFormats,
  demoGemStyleIds,
  demoShowsCharacterSection,
  demoStyleRequest,
  demoVisibleCatalogGems,
} from '@/modules/videos/utilities/demoForm'
import { defaultQualityFor } from '@/modules/videos/utilities/imageQuality'
import { selectedCustomStyleFrom } from '@/modules/videos/utilities/selectedCustomStyle'
import type { CreateFormValue } from '@/modules/videos/types/create'
import type {
  SelectedCustomStyle,
  StyleSource,
} from '@/modules/videos/types/styles'
import type { DemoManifest } from '@pipeline/types/demo.ts'

interface UseDemoFormChoicesOptions {
  // Manifest del pack con que abrió Crear (ADR-0029); null fuera de la demo.
  demo: DemoManifest | null
  // El formulario tal como se ve: con la tarjeta que Create deriva.
  value: CreateFormValue
  onChange: (patch: Partial<CreateFormValue>) => void
}

// Las elecciones del formulario de Crear en la demo (spec demo v4 §2): qué
// ofrece cada galería y el selector de formato, el avatar del pack, el nombre
// del audio de la historia, el modo de personaje de cada estilo del catálogo
// y si se ven la sección de personajes y el switch de animación, y los
// manejadores que aplican las reglas de utilities/demoForm.ts. Con el switch
// de avatar encendido, pedir otro estilo o la otra pestaña vuelve a la gema
// del avatar y se avisa junto a la galería hasta el próximo cambio de estilo,
// pestaña, formato o switch (pedido del dueño del 2026-10-14). Fuera de la
// demo devuelve null y el formulario sigue como siempre.
export function useDemoFormChoices({
  demo,
  value,
  onChange,
}: UseDemoFormChoicesOptions) {
  const [avatarStyleNotice, setAvatarStyleNotice] = useState(false)
  // Mi estilo tal como lo lista la galería (la puerta sembró las gemas del
  // pack) y la lista del catálogo, la misma de la galería.
  const { styles } = useCustomStyles()
  const { gems } = useCatalogStyles({ enabled: demo !== null })

  if (!demo) return null

  // La gema del avatar del pack como snapshot de Mi estilo: con el switch
  // encendido es la única que vale; null si la lista no la trae.
  const avatarGem = demoAvatarGem(demo)
  const avatarGemSummary = avatarGem
    ? styles.find((style) => style.id === avatarGem.styleId)
    : undefined
  const avatarGemStyle = avatarGemSummary
    ? selectedCustomStyleFrom(avatarGemSummary)
    : null

  // Un cambio que decide la demo: retira o devuelve los personajes según el
  // estilo que queda activo y, si cambia el formato (el avatar lleva a 16:9),
  // trae la calidad del formato nuevo, como el selector de formato.
  const applyChange = (patch: Partial<CreateFormValue>) => {
    const next = { ...value, ...patch }
    const quality =
      next.videoFormat === value.videoFormat
        ? {}
        : {
            imageQuality: defaultQualityFor(
              value.imageProvider,
              next.videoFormat,
            ),
          }
    onChange({ ...patch, ...characterPatchForStyle(value, next), ...quality })
  }

  return {
    // Los estilos del catálogo a la vista: la galería los muestra y el texto
    // de la pestaña los cuenta (en Catálogo, «Los N estilos con demo lista»).
    catalogIds: demoVisibleCatalogGems(demo, value.videoFormat, gems).map(
      (gem) => gem.id,
    ),
    gemStyleIds: demoGemStyleIds(demo, value.videoFormat),
    comingSoonFormats: demoComingSoonFormats(demo, value),
    avatar: demoAvatar(demo),
    audioFileLabel: demoAudioFileLabel(demo, value),
    // El modo de personaje de un estilo del catálogo: el de su historia en
    // el formato, al elegirlo en la galería o en «Ver».
    catalogCharacterOf: (catalogStyleId: string) =>
      demoCatalogCharacter(demo, value.videoFormat, catalogStyleId),
    // La sección de personajes, solo con un estilo con personaje fijo.
    showsCharacterSection: demoShowsCharacterSection(demo, value),
    // El switch de animación, solo con una historia animada.
    animationAvailable: demoAnimationAvailable(demo, value),
    avatarStyleNotice,
    // Pedir un estilo o la otra pestaña (demoStyleRequest). Devuelve si quedó
    // lo pedido: con el switch de avatar encendido la pestaña no cambia.
    requestStyle: (
      styleSource: StyleSource,
      customStyle: SelectedCustomStyle | null,
    ) => {
      const { patch, redirected } = demoStyleRequest(
        demo,
        value,
        { styleSource, customStyle },
        avatarGemStyle,
      )
      setAvatarStyleNotice(redirected)
      applyChange(patch)
      return !redirected
    },
    // El switch de avatar (demoAvatarToggle): encenderlo lleva a la gema del
    // avatar en su formato; apagarlo con ella, a la pestaña Catálogo.
    toggleAvatar: (useAvatar: boolean) => {
      setAvatarStyleNotice(false)
      applyChange(demoAvatarToggle(demo, value, useAvatar, avatarGemStyle))
    },
    // Cambiar de formato también se lleva el aviso.
    changeFormat: (patch: Partial<CreateFormValue>) => {
      setAvatarStyleNotice(false)
      onChange(patch)
    },
  }
}
