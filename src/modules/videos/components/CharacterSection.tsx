import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Film, Pencil, Sparkles, UserRound, X } from 'lucide-react'
import { CharacterPortrait } from '@/modules/common/components/CharacterPortrait'
import { Label } from '@/modules/common/ui/label'
import { cn } from '@/modules/common/utilities/cn'
import { videosApi } from '@/modules/videos/api'
import { CharacterFrequencyPicker } from '@/modules/videos/components/CharacterFrequencyPicker'
import { CharacterPickerModal } from '@/modules/videos/components/CharacterPickerModal'
import { StyleCharacterChip } from '@/modules/videos/components/StyleCharacterChip'
import { openCatalogStyleViewer } from '@/modules/videos/hooks/useCatalogStyleViewer'
import { openCustomStyleEditor } from '@/modules/videos/hooks/useCustomStyleEditor'
import { useStyleCharacter } from '@/modules/videos/hooks/useStyleCharacter'
import { characterPortraitPath } from '@/modules/videos/utilities/findStylePreview'
import {
  gemBringsCharacter,
  styleContextGemOf,
} from '@/modules/videos/utilities/gemTemplate'
import { previewStyleKeyOf } from '@/modules/videos/utilities/previewStyleKeyOf'
import { toSelectedCharacter } from '@/modules/videos/utilities/toSelectedCharacter'
import type { CreateFormValue, FormLane } from '@/modules/videos/types/create'
import type { StyleCharacterMode } from '@pipeline/types/styles.ts'

interface CharacterSectionProps {
  value: CreateFormValue
  // Con qué carril se arma la pantalla (displayLaneOf): la pestaña Catálogo
  // nueva se ve como su carril aun antes de elegir tarjeta.
  lane: FormLane
  disabled: boolean
  // La demo (spec demo v4 §2): el modo es el de la historia y no se cambia,
  // así que el chip del estilo es un cartel que no abre la gema.
  demo?: boolean
  onChange: (patch: Partial<CreateFormValue>) => void
}

// Sección de personaje del formulario. Con el catálogo viejo es el selector
// de siempre; con «Mi estilo» o un estilo del catálogo nuevo cuenta qué
// decidió la gema en uso sobre su protagonista (ADR-0020) con un chip que, al
// tocarlo, abre ESA gema: el editor de Mi estilo o «Ver» del catálogo (port de
// los chips de EditorGuion del origen, v1.19.4–v1.31.2): el fijo, el fijo que
// se borró de la biblioteca, el genérico/sin personaje y el recibo de los
// personajes retirados. En la demo Crear la monta solo con un estilo con
// personaje fijo, y su chip no se toca.
export function CharacterSection({
  value,
  lane,
  disabled,
  demo = false,
  onChange,
}: CharacterSectionProps) {
  const { t } = useTranslation()
  const [pickerOpen, setPickerOpen] = useState(false)

  // El preview se busca por el estilo propio en uso o el del catálogo.
  const previewStyleKey = previewStyleKeyOf(value)
  const {
    mode,
    fixedCharacterId,
    fixedCharacter,
    fixedLoading,
    fixedMissing,
    styleWritesCharacter,
    canEditStyle,
  } = useStyleCharacter(value)
  const fixedSeeded = value.characters.some(
    (character) => character.characterId === fixedCharacterId,
  )
  // Los chips del estilo abren la gema para cambiar su modo; en la demo el
  // modo no se cambia y son carteles.
  const styleEditable = canEditStyle && !demo

  // El personaje fijo de la gema se siembra solo, sin pedir un clic: el
  // catálogo llega asíncrono y el formulario lo tiene el padre, así que la
  // sincronización va en un efecto (no se puede llamar a onChange en render).
  useEffect(() => {
    if (!fixedCharacter || fixedSeeded || disabled) return
    onChange({
      characters: [toSelectedCharacter(fixedCharacter, previewStyleKey)],
    })
  }, [fixedCharacter, fixedSeeded, disabled, previewStyleKey, onChange])

  // Todos los chips del estilo abren la gema EN USO (v1.19.5 del origen): el
  // editor de Mi estilo, o «Ver» si es un estilo del catálogo (lo dibuja la
  // galería del catálogo, montada en su pestaña). En los dos vive el bloque
  // «¿Tu estilo lleva personaje?».
  const editStyleInUse = () => {
    if (!value.customStyle) return

    const { catalogStyleId } = value.customStyle
    if (lane === 'catalog-gem' && catalogStyleId) {
      openCatalogStyleViewer({ catalogStyleId })
      return
    }

    openCustomStyleEditor({ styleId: value.customStyle.styleId })
  }

  const label = (
    <Label className="flex items-center gap-2 font-display font-semibold">
      <UserRound className="h-4 w-4 text-saffron" />
      {mode === 'own'
        ? t('create.characters.labelOfStyle')
        : t('create.characters.label')}
    </Label>
  )

  // Recibo de los personajes retirados al cambiar de estilo
  // (characterPatchForStyle): el estilo escribe (o no lleva) el protagonista,
  // o es un estilo del catálogo con «mi personaje», que lleva uno solo y
  // retira los que sobraban. Ahí no se nombra al que la persona volvió a
  // elegir: cambiarlo en el selector no vacía la lista de retirados.
  const withdrawn =
    mode === 'own'
      ? value.withdrawnCharacters.filter(
          (character) =>
            !value.characters.some(
              (item) => item.characterId === character.characterId,
            ),
        )
      : value.withdrawnCharacters
  const withdrawnNames = withdrawn
    .map((character) => character.name)
    .filter(Boolean)
    .join(' + ')
  const withdrawnReceipt = withdrawn.length > 0 && (
    <StyleCharacterChip
      kind="withdrawn"
      tone="saffron"
      editable={styleEditable}
      onEdit={editStyleInUse}
    >
      <p className="font-display text-sm font-bold text-foreground">
        {withdrawnNames
          ? t('create.characters.withdrawnTitle', { names: withdrawnNames })
          : t('create.characters.withdrawnTitleNoName')}
      </p>
      <p className="mt-0.5 font-body text-xs text-muted-foreground">
        {withdrawnHintKeys(mode, styleEditable)
          .map((key) => t(key))
          .join(' ')}
      </p>
    </StyleCharacterChip>
  )

  // Con «mi personaje» el recibo solo sale en un estilo del catálogo nuevo:
  // Mi estilo y el catálogo viejo aceptan dos y no retiran a nadie al entrar.
  const singleCharacterReceipt =
    lane === 'catalog-gem' && mode === 'own' && withdrawnReceipt

  if (styleWritesCharacter) {
    // Una gema que trae su personaje (sección `character`), sea del catálogo
    // o de Mi estilo: en «genérico» sale ESE personaje, no uno que Vimo
    // invente; el chip lo dice como el modal de la gema.
    const styleBringsCharacter = gemBringsCharacter(value.customStyle?.sections)
    const genericTitleKey = styleBringsCharacter
      ? 'create.styleCharacter.fromStyle.title'
      : 'create.characters.styleUsesGeneric'
    const genericHintKey = styleBringsCharacter
      ? 'create.styleCharacter.fromStyle.subtitle'
      : 'create.characters.styleUsesGenericHint'

    return (
      <div className="space-y-2">
        {label}

        {value.characters.length === 0 && (
          <StyleCharacterChip
            kind="style-decides"
            tone="ocean"
            editable={styleEditable}
            onEdit={editStyleInUse}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ocean/20">
                {mode === 'none' ? (
                  <Film className="h-5 w-5 text-ocean" />
                ) : (
                  <Sparkles className="h-5 w-5 text-ocean" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-bold text-ocean">
                  {t(
                    mode === 'none'
                      ? 'create.characters.styleUsesNone'
                      : genericTitleKey,
                  )}
                </p>
                <p className="mt-0.5 font-body text-xs text-muted-foreground">
                  {t(
                    mode === 'none'
                      ? 'create.characters.styleUsesNoneHint'
                      : genericHintKey,
                  )}
                </p>
              </div>
              {styleEditable && (
                <Pencil
                  aria-hidden
                  className="h-4 w-4 shrink-0 text-ocean/70"
                />
              )}
            </div>
            {styleEditable && (
              <p className="mt-3 border-t border-ocean/25 pt-2.5 font-body text-xs text-muted-foreground">
                {t('create.characters.wantYours')}
              </p>
            )}
          </StyleCharacterChip>
        )}

        {withdrawnReceipt}
      </div>
    )
  }

  if (fixedCharacterId) {
    // La carita sale del catálogo (no de la siembra) para no depender del
    // orden del efecto, y de cualquier ilustración suya: una gema recién
    // creada todavía no tiene preview propio del personaje.
    const fixedPortrait = fixedCharacter
      ? characterPortraitPath(fixedCharacter, previewStyleKey)
      : null

    return (
      <div className="space-y-2">
        {label}

        {fixedLoading && (
          <p className="font-body text-xs text-muted-foreground">
            {t('create.characters.fixedLoading')}
          </p>
        )}

        {fixedMissing && (
          <StyleCharacterChip
            kind="fixed-missing"
            tone="destructive"
            editable
            onEdit={editStyleInUse}
          >
            <p className="font-display text-sm font-bold text-destructive-text">
              {t('create.characters.fixedMissingTitle')}
            </p>
            <p className="font-body text-xs text-foreground/65">
              {t('create.characters.fixedMissingHint')}
            </p>
          </StyleCharacterChip>
        )}

        {fixedCharacter && fixedSeeded && (
          <StyleCharacterChip
            kind="fixed"
            tone="ocean"
            editable
            onEdit={editStyleInUse}
          >
            <div className="flex items-center gap-3">
              <CharacterPortrait
                src={
                  fixedPortrait ? videosApi.imageSource(fixedPortrait) : null
                }
                doodleSize={20}
                className="h-10 w-10 shrink-0 overflow-hidden rounded-full"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm font-bold text-ocean">
                  {fixedCharacter.name}
                </p>
                <p className="font-body text-xs text-muted-foreground">
                  {t('create.characters.broughtByStyle')}
                </p>
              </div>
              <Pencil aria-hidden className="h-4 w-4 shrink-0 text-ocean/70" />
            </div>
          </StyleCharacterChip>
        )}

        {singleCharacterReceipt}
      </div>
    )
  }

  const firstCharacter = value.characters[0] ?? null
  // Con «Mi estilo» y el catálogo nuevo nadie elige cada cuánto sale: dónde
  // aparece el protagonista lo decide el prompt que escribe la gema
  // (ADR-0019), así que la promesa de la pista también cambia.
  const hint =
    lane === 'legacy-catalog'
      ? t('create.characters.hint')
      : t('create.characters.hintOfStyle')
  const subtitle =
    value.characters.length > 1
      ? t('create.characters.selectedCount', { count: value.characters.length })
      : (firstCharacter?.description ?? '') || hint

  return (
    <div className="space-y-2">
      {label}
      {mode === 'own' && (
        <p className="font-body text-xs text-saffron">
          {t('create.characters.asksForCharacter')}
        </p>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={() => setPickerOpen(true)}
        className={cn(
          'w-full rounded-xl border-2 px-4 py-3 text-left transition-all',
          firstCharacter
            ? 'border-saffron bg-saffron/5'
            : 'border-dashed border-border bg-card hover:border-saffron/40',
        )}
      >
        {firstCharacter ? (
          <div className="flex items-center gap-3">
            <CharacterPortrait
              src={
                firstCharacter.portraitPath
                  ? videosApi.imageSource(firstCharacter.portraitPath)
                  : null
              }
              doodleSize={20}
              className="h-10 w-10 shrink-0 overflow-hidden rounded-full"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-bold text-foreground">
                {value.characters
                  .map((character) => character.name)
                  .join(' + ')}
              </p>
              <p className="truncate font-body text-xs text-muted-foreground">
                {subtitle}
              </p>
            </div>
            <span className="rounded bg-saffron px-2 py-1 font-display text-[10px] font-bold text-charcoal">
              {t('create.characters.change')}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <UserRound className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="font-display text-sm font-bold text-foreground">
                {t('create.characters.choose')}
              </p>
              <p className="font-body text-xs text-muted-foreground">{hint}</p>
            </div>
          </div>
        )}
      </button>

      {value.characters.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.characters.map((character) => (
            <li
              key={character.characterId}
              className="flex items-center gap-2 rounded-xl border border-border bg-card p-2"
            >
              <CharacterPortrait
                src={
                  character.portraitPath
                    ? videosApi.imageSource(character.portraitPath)
                    : null
                }
                doodleSize={20}
                className="h-8 w-8 shrink-0 overflow-hidden rounded-lg"
              />
              <span className="font-display text-sm font-bold text-foreground">
                {character.name}
              </span>
              <button
                type="button"
                disabled={disabled}
                aria-label={t('create.characters.remove')}
                onClick={() =>
                  onChange({
                    characters: value.characters.filter(
                      (item) => item.characterId !== character.characterId,
                    ),
                  })
                }
                className="text-muted-foreground hover:text-destructive-text"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {singleCharacterReceipt}

      {/* Solo con el catálogo viejo: el carril verbatim de «Mi estilo» (y del
          catálogo nuevo) saltea el clasificador de presencia (ADR-0019), así
          que ahí la pregunta prometería un control que ese flujo no tiene. */}
      {value.characters.length > 0 && lane === 'legacy-catalog' && (
        <CharacterFrequencyPicker
          value={value.characterFrequency}
          disabled={disabled}
          onChange={(characterFrequency) => onChange({ characterFrequency })}
        />
      )}

      {pickerOpen && (
        <CharacterPickerModal
          previewStyleKey={previewStyleKey}
          selected={value.characters}
          // Un estilo del catálogo lleva un personaje como máximo (spec §8),
          // como «Mi personaje» en «Ver».
          max={lane === 'catalog-gem' ? 1 : undefined}
          script={value.script}
          styleContext={
            mode !== null && value.customStyle
              ? {
                  styleId: value.customStyle.styleId,
                  // Un estilo del catálogo nuevo no está en las listas del
                  // modal de personaje: va con el nombre del snapshot para
                  // que su chip y su retrato lo lleven.
                  ...(lane === 'catalog-gem'
                    ? { styleName: value.customStyle.name }
                    : {}),
                  // Una gema de plantilla (y un estilo del catálogo, que
                  // siempre lo es) viaja por secciones: el sidecar la pasa a
                  // texto sin su sección de personaje (ADR-0048).
                  ...styleContextGemOf(value.customStyle),
                  script: value.script,
                  ...(value.promptModel
                    ? { promptModel: value.promptModel }
                    : {}),
                }
              : undefined
          }
          onConfirm={(characters) => {
            onChange({ characters })
            setPickerOpen(false)
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

// Las claves del recibo de retirados: por qué se fueron y cómo vuelven. Con
// «mi personaje» (un estilo del catálogo, que lleva uno solo) no vuelven
// solos: se cambia el elegido.
function withdrawnHintKeys(
  mode: StyleCharacterMode | null,
  canEditStyle: boolean,
): string[] {
  if (mode === 'own') return ['create.characters.withdrawnBecauseSingle']

  const reasonKey =
    mode === 'none'
      ? 'create.characters.withdrawnBecauseNone'
      : 'create.characters.withdrawnBecauseGeneric'
  const restoreKey = canEditStyle
    ? 'create.characters.withdrawnRestoreHint'
    : 'create.characters.withdrawnRestoreAuto'
  return [reasonKey, restoreKey]
}
