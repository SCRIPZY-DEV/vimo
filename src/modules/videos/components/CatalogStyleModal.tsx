import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, Loader2 } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/modules/common/ui/dialog'
import { CatalogStyleTags } from '@/modules/videos/components/CatalogStyleTags'
import { CharacterPickerModal } from '@/modules/videos/components/CharacterPickerModal'
import { StyleCharacterBlock } from '@/modules/videos/components/StyleCharacterBlock'
import { StyleSamplesCarousel } from '@/modules/videos/components/StyleSamplesCarousel'
import { localizedText } from '@/modules/videos/utilities/catalogLocale'
import { catalogSampleImages } from '@/modules/videos/utilities/catalogSamples'
import { nextCharacterDraft } from '@/modules/videos/utilities/characterDraft'
import {
  gemBringsCharacter,
  styleContextGemOf,
} from '@/modules/videos/utilities/gemTemplate'
import type { SelectedCharacter } from '@/modules/videos/types/create'
import type { CharacterDraft } from '@/modules/videos/types/styles'
import type { CatalogGem } from '@pipeline/types/catalog.ts'
import type { StyleCharacter } from '@pipeline/types/styles.ts'

interface CatalogStyleModalProps {
  gem: CatalogGem
  // Con qué modo abre: el del formulario si el estilo está en uso; si no, el
  // recordado (o el de sus muestras).
  initialCharacter: StyleCharacter
  // El estilo ya es el del formulario: cambiar el modo lo actualiza ahí.
  inUse: boolean
  // ESTE estilo se está copiando a Mi estilo: el botón lo dice y el modo
  // queda quieto mientras tanto.
  copying: boolean
  // Hay una copia en curso, de este estilo o de otro: no se lanza otra.
  copyDisabled: boolean
  // Guion y modelo del formulario: el selector de personaje los usa para
  // diseñar un personaje nuevo coherente con esta gema (ADR-0020).
  script: string
  promptModel: string | null
  // La persona cambió el modo (la galería lo recuerda y, si el estilo está en
  // uso, actualiza el formulario).
  onCharacterChange: (character: StyleCharacter) => void
  onUse: (character: StyleCharacter) => void
  onCopy: (character: StyleCharacter) => void
  onClose: () => void
}

// «Ver» de un estilo del catálogo (Entrega 2): sus etiquetas, el modo de
// personaje (solo con los modos que permite) y sus muestras, en el mismo orden
// que el modal de Mi estilo: el personaje se elige arriba, antes de las
// muestras. No muestra el texto de la gema (decisión E2-D3) ni una descripción
// (pedido del dueño, 2026-10-05). Cada cambio de modo se
// recuerda al toque; «Usar en este video» lo pone en el formulario y «Pasar a
// mi estilo» crea una copia propia con el modo elegido. Regla de modales del
// origen: nunca dos Radix abiertos — mientras se elige el personaje fijo, este
// se ESCONDE en vez de apilarse, como el modal de Mi estilo.
export function CatalogStyleModal({
  gem,
  initialCharacter,
  inUse,
  copying,
  copyDisabled,
  script,
  promptModel,
  onCharacterChange,
  onUse,
  onCopy,
  onClose,
}: CatalogStyleModalProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'es'
  const [draft, setDraft] = useState<CharacterDraft>({
    character: initialCharacter,
    lastDefaultCharacterId: initialCharacter.defaultCharacterId,
  })
  // Selector de personaje abierto, con el ya elegido preseleccionado.
  const [picking, setPicking] = useState<SelectedCharacter[] | null>(null)
  const character = draft.character
  const name = localizedText(gem.name, language)
  const images = catalogSampleImages(gem)

  const changeCharacter = (next: StyleCharacter) => {
    const nextDraft = nextCharacterDraft(draft, next)
    setDraft(nextDraft)
    onCharacterChange(nextDraft.character)
  }

  return (
    <>
      <Dialog
        open={picking === null}
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
      >
        {/* Sin autofoco al abrir: Radix enfocaría el signo de pregunta de la
            opción activa del personaje y abriría su tooltip. Sin descripción,
            así que se le avisa a Radix que no la espere. */}
        <DialogContent
          className="max-h-[90vh] max-w-3xl overflow-y-auto"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <p className="font-display text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {t('create.catalog.modalTitle')}
            </p>
            <DialogTitle className="font-display">{name}</DialogTitle>
            <CatalogStyleTags tags={gem.tags} singleRow={false} />
          </DialogHeader>

          {/* Un solo bloque con el contenido y el pie: el pie fijo se pega
              dentro de su contenedor, y un hijo directo de la grilla del
              diálogo solo podría moverse dentro de su propia fila. */}
          <div>
            <div className="space-y-4">
              <StyleCharacterBlock
                value={character}
                disabled={copying}
                styleId={gem.id}
                allowedModes={gem.allowedModes}
                variant="catalog"
                fixedCharacter={gemBringsCharacter(gem.sections)}
                onChange={changeCharacter}
                onPickCharacter={(current) =>
                  setPicking(current ? [current] : [])
                }
              />

              {images.length > 0 ? (
                <StyleSamplesCarousel images={images} name={name} />
              ) : (
                <div className="flex aspect-video items-center justify-center rounded-xl border-2 border-dashed border-border text-center">
                  <p className="px-6 font-body text-sm text-muted-foreground">
                    {t('create.catalog.noSamples')}
                  </p>
                </div>
              )}
            </div>

            {/* Pie fijo: con el carrusel 16:9 el modal casi siempre scrollea
                y los botones quedaban cortados bajo el borde. Pegado al fondo
                y a los lados del diálogo, compensando el p-6 de DialogContent:
                -mx-6 y -mb-6 lo estiran hasta los bordes, y -bottom-6 porque
                Chrome y WebKit miden el `bottom` de un sticky desde el
                contenido del contenedor que scrollea, sin su padding. px-6 y
                pb-6 dejan los botones donde estaban. Con el fondo del diálogo
                y un borde arriba, el contenido pasa por debajo. Va fuera del
                `space-y-4`, que le pisaría el margen de abajo. */}
            <div className="sticky -bottom-6 z-10 -mx-6 -mb-6 mt-4 flex flex-wrap justify-end gap-2 border-t border-border bg-background px-6 pb-6 pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={copyDisabled}
                onClick={() => onCopy(character)}
              >
                {copying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('create.catalog.copying')}
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    {t('create.catalog.copyToCustom')}
                  </>
                )}
              </Button>
              <Button
                type="button"
                disabled={inUse}
                onClick={() => onUse(character)}
              >
                <Check className="mr-2 h-4 w-4" />
                {inUse
                  ? t('create.catalog.alreadyInUse')
                  : t('create.catalog.useButton')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {picking !== null && (
        <CharacterPickerModal
          previewStyleKey={gem.id}
          selected={picking}
          max={1}
          styleContext={{
            styleId: gem.id,
            // El modal de personaje no conoce los estilos del catálogo nuevo:
            // sin el nombre, su chip y su retrato quedarían sin texto.
            styleName: name,
            // La gema viaja por secciones: el sidecar la pasa a texto sin su
            // sección de personaje (ADR-0048).
            ...styleContextGemOf({ sections: gem.sections }),
            script,
            ...(promptModel ? { promptModel } : {}),
          }}
          onConfirm={(characters) => {
            const chosen = characters.at(0)
            changeCharacter(
              chosen
                ? { mode: 'own', defaultCharacterId: chosen.characterId }
                : { mode: 'own' },
            )
            setPicking(null)
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </>
  )
}
