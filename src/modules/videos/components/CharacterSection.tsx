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
import { openCustomStyleEditor } from '@/modules/videos/hooks/useCustomStyleEditor'
import { useStyleCharacter } from '@/modules/videos/hooks/useStyleCharacter'
import { characterPortraitPath } from '@/modules/videos/utilities/findStylePreview'
import { previewStyleKeyOf } from '@/modules/videos/utilities/previewStyleKeyOf'
import { toSelectedCharacter } from '@/modules/videos/utilities/toSelectedCharacter'
import type { CreateFormValue } from '@/modules/videos/types/create'

interface CharacterSectionProps {
  value: CreateFormValue
  disabled: boolean
  onChange: (patch: Partial<CreateFormValue>) => void
}

// Sección de personaje del formulario. Con un estilo de catálogo es el
// selector de siempre; con «Mi estilo» cuenta qué decidió la gema en uso
// sobre su protagonista (ADR-0020) con un chip que, al tocarlo, abre el
// editor de ESA gema (port de los chips de EditorGuion del origen,
// v1.19.4–v1.31.2): el fijo, el fijo que se borró de la biblioteca, el
// genérico/sin personaje y el recibo de los personajes retirados.
export function CharacterSection({
  value,
  disabled,
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

  // El personaje fijo de la gema se siembra solo, sin pedir un clic: el
  // catálogo llega asíncrono y el formulario lo tiene el padre, así que la
  // sincronización va en un efecto (no se puede llamar a onChange en render).
  useEffect(() => {
    if (!fixedCharacter || fixedSeeded || disabled) return
    onChange({
      characters: [toSelectedCharacter(fixedCharacter, previewStyleKey)],
    })
  }, [fixedCharacter, fixedSeeded, disabled, previewStyleKey, onChange])

  // Todos los chips del estilo abren el editor de la gema EN USO (v1.19.5
  // del origen): ahí vive el bloque «¿Tu estilo lleva personaje?».
  const editStyleInUse = () => {
    if (!value.customStyle) return
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

  if (styleWritesCharacter) {
    const withdrawnNames = value.withdrawnCharacters
      .map((character) => character.name)
      .filter(Boolean)
      .join(' + ')

    return (
      <div className="space-y-2">
        {label}

        {value.characters.length === 0 && (
          <StyleCharacterChip
            kind="style-decides"
            tone="ocean"
            editable={canEditStyle}
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
                      : 'create.characters.styleUsesGeneric',
                  )}
                </p>
                <p className="mt-0.5 font-body text-xs text-muted-foreground">
                  {t(
                    mode === 'none'
                      ? 'create.characters.styleUsesNoneHint'
                      : 'create.characters.styleUsesGenericHint',
                  )}
                </p>
              </div>
              {canEditStyle && (
                <Pencil
                  aria-hidden
                  className="h-4 w-4 shrink-0 text-ocean/70"
                />
              )}
            </div>
            {canEditStyle && (
              <p className="mt-3 border-t border-ocean/25 pt-2.5 font-body text-xs text-muted-foreground">
                {t('create.characters.wantYours')}
              </p>
            )}
          </StyleCharacterChip>
        )}

        {value.withdrawnCharacters.length > 0 && (
          <StyleCharacterChip
            kind="withdrawn"
            tone="saffron"
            editable={canEditStyle}
            onEdit={editStyleInUse}
          >
            <p className="font-display text-sm font-bold text-foreground">
              {withdrawnNames
                ? t('create.characters.withdrawnTitle', {
                    names: withdrawnNames,
                  })
                : t('create.characters.withdrawnTitleNoName')}
            </p>
            <p className="mt-0.5 font-body text-xs text-muted-foreground">
              {t(
                mode === 'none'
                  ? 'create.characters.withdrawnBecauseNone'
                  : 'create.characters.withdrawnBecauseGeneric',
              )}{' '}
              {t(
                canEditStyle
                  ? 'create.characters.withdrawnRestoreHint'
                  : 'create.characters.withdrawnRestoreAuto',
              )}
            </p>
          </StyleCharacterChip>
        )}
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
            <p className="font-display text-sm font-bold text-destructive">
              {t('create.characters.fixedMissingTitle')}
            </p>
            <p className="font-body text-xs text-muted-foreground">
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
      </div>
    )
  }

  const firstCharacter = value.characters[0] ?? null
  // Con «Mi estilo» nadie elige cada cuánto sale: dónde aparece el
  // protagonista lo decide el prompt que escribe la gema (ADR-0019), así que
  // la promesa de la pista también cambia.
  const hint =
    value.styleSource === 'custom'
      ? t('create.characters.hintOfStyle')
      : t('create.characters.hint')
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
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Solo con el catálogo: el carril verbatim de «Mi estilo» saltea el
          clasificador de presencia (ADR-0019), así que ahí la pregunta
          prometería un control que ese flujo no tiene. */}
      {value.characters.length > 0 && value.styleSource === 'catalog' && (
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
          script={value.script}
          styleContext={
            mode !== null && value.customStyle
              ? {
                  styleId: value.customStyle.styleId,
                  gem: value.customStyle.systemPrompt,
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
