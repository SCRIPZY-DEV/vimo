import { useTranslation } from 'react-i18next'
import { Languages, Loader2 } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { cn } from '@/modules/common/utilities/cn'
import { CatalogTagsField } from '@/modules/videos/components/CatalogTagsField'
import {
  CATALOG_STYLE_ID_LIMIT,
  CUSTOM_STYLE_FIELD_CLASS,
  CUSTOM_STYLE_NAME_LIMIT,
} from '@/modules/videos/constants'
import { catalogTagSlots } from '@/modules/videos/utilities/catalogAdminDraft'
import { COLOR_FILTER_IDS } from '@/modules/videos/utilities/gemTemplate'
import type {
  CatalogLocale,
  CatalogSampleMode,
  CatalogStyleContent,
  LocalizedText,
} from '@pipeline/types/catalog.ts'
import type {
  ColorFilterId,
  StyleCharacterMode,
} from '@pipeline/types/styles.ts'

interface CatalogAdminFieldsProps {
  // El id solo se escribe al crear (plan E3 §2: no cambia después).
  id: string
  idEditable: boolean
  position: number
  content: CatalogStyleContent
  disabled: boolean
  translating: boolean
  onIdChange: (id: string) => void
  onPositionChange: (position: number) => void
  onContentChange: (content: CatalogStyleContent) => void
  // «Traducir con IA» (plan E3, P8): completa inglés y portugués desde el español.
  onTranslate: () => void
}

const LOCALES: readonly CatalogLocale[] = ['es', 'en', 'pt']
const MODES: readonly StyleCharacterMode[] = ['generic', 'own', 'none']
const SAMPLE_MODES: readonly CatalogSampleMode[] = ['generic', 'none']

const MODE_KEYS: Record<StyleCharacterMode, string> = {
  own: 'create.catalogAdmin.modeOwn',
  generic: 'create.catalogAdmin.modeGeneric',
  none: 'create.catalogAdmin.modeNone',
}

// Con qué salen las muestras. Las dos primeras son el mismo modo del carril
// (`generic`): con la sección de personaje de la gema, el modo genérico usa ese
// personaje fijo (en los videos y en las muestras); sin ella, la Fase 1 diseña
// uno. Se ofrecen las dos para que se vea cuál aplica a esta gema.
interface SampleChoice {
  key: 'generic' | 'styleCharacter' | 'none'
  mode: CatalogSampleMode
  labelKey: string
  // Solo tiene sentido con (o sin) la sección de personaje.
  needsStyleCharacter: boolean | null
}

const SAMPLE_CHOICES: readonly SampleChoice[] = [
  {
    key: 'generic',
    mode: 'generic',
    labelKey: MODE_KEYS.generic,
    needsStyleCharacter: false,
  },
  {
    key: 'styleCharacter',
    mode: 'generic',
    labelKey: 'create.catalogAdmin.sampleStyleCharacter',
    needsStyleCharacter: true,
  },
  {
    key: 'none',
    mode: 'none',
    labelKey: MODE_KEYS.none,
    needsStyleCharacter: null,
  },
]

const isSampleMode = (mode: StyleCharacterMode): mode is CatalogSampleMode =>
  SAMPLE_MODES.includes(mode as CatalogSampleMode)

const COLOR_FILTER_KEYS: Record<ColorFilterId, string> = {
  none: 'create.catalogAdmin.colorFilterNone',
  fantasy: 'create.catalogAdmin.colorFilterFantasy',
  'horror-bw': 'create.catalogAdmin.colorFilterHorrorBw',
}

const NAME_KEYS: Record<CatalogLocale, string> = {
  es: 'create.catalogAdmin.nameEs',
  en: 'create.catalogAdmin.nameEn',
  pt: 'create.catalogAdmin.namePt',
}

// Los campos del catálogo de un estilo en el modal del admin (plan E3, tarea
// C4): id, posición, nombre en los tres idiomas, etiquetas, modos de
// personaje permitidos, modo de las muestras y filtro de color. Las secciones
// de la gema van aparte (GemSectionsEditor).
export function CatalogAdminFields({
  id,
  idEditable,
  position,
  content,
  disabled,
  translating,
  onIdChange,
  onPositionChange,
  onContentChange,
  onTranslate,
}: CatalogAdminFieldsProps) {
  const { t } = useTranslation()

  const changeName = (locale: CatalogLocale, value: string) => {
    onContentChange({ ...content, name: { ...content.name, [locale]: value } })
  }

  const hasStyleCharacter = Boolean(content.sections.character?.trim())
  const isAllowed = (mode: StyleCharacterMode) =>
    content.allowedModes.includes(mode)
  // Las muestras salen en genérico o sin personaje: uno de los dos queda
  // siempre permitido (plan E3, P17), así que el último no se puede apagar.
  const canDisableMode = (mode: StyleCharacterMode) =>
    !isSampleMode(mode) ||
    SAMPLE_MODES.some((other) => other !== mode && isAllowed(other))
  const sampleModeLocked = SAMPLE_MODES.some(
    (mode) => isAllowed(mode) && !canDisableMode(mode),
  )

  // Apagar un modo nunca deja a las muestras sin modo: pasan al otro
  // permitido. Encenderlo no cambia las muestras.
  const toggleMode = (mode: StyleCharacterMode) => {
    if (isAllowed(mode) && !canDisableMode(mode)) return
    const allowedModes = isAllowed(mode)
      ? content.allowedModes.filter((existing) => existing !== mode)
      : MODES.filter((existing) => existing === mode || isAllowed(existing))
    const sampleMode = allowedModes.includes(content.sampleMode)
      ? content.sampleMode
      : (allowedModes.find(isSampleMode) ?? content.sampleMode)
    onContentChange({ ...content, allowedModes, sampleMode })
  }

  // Solo entre los modos permitidos: elegir las muestras no enciende un modo
  // por la espalda (pedido del dueño, 2026-10-06).
  const chooseSampleMode = (sampleMode: CatalogSampleMode) => {
    if (!isAllowed(sampleMode)) return
    onContentChange({ ...content, sampleMode })
  }

  const sampleChoiceEnabled = (choice: SampleChoice) =>
    isAllowed(choice.mode) &&
    (choice.needsStyleCharacter === null ||
      choice.needsStyleCharacter === hasStyleCharacter)

  const changeTags = (tags: LocalizedText[]) => {
    onContentChange({ ...content, tags })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_8rem]">
        <div>
          <label
            htmlFor="catalog-style-id"
            className="mb-1 block text-xs font-medium"
          >
            {t('create.catalogAdmin.idLabel')}
          </label>
          <input
            id="catalog-style-id"
            value={id}
            maxLength={CATALOG_STYLE_ID_LIMIT}
            disabled={disabled || !idEditable}
            spellCheck={false}
            onChange={(event) =>
              onIdChange(event.target.value.toLowerCase().trim())
            }
            className={cn(CUSTOM_STYLE_FIELD_CLASS, 'font-mono text-sm')}
          />
          {idEditable && (
            <p className="mt-1 font-body text-xs text-muted-foreground">
              {t('create.catalogAdmin.idHint')}
            </p>
          )}
        </div>
        <div>
          <label
            htmlFor="catalog-style-position"
            className="mb-1 block text-xs font-medium"
          >
            {t('create.catalogAdmin.positionLabel')}
          </label>
          <input
            id="catalog-style-position"
            type="number"
            min={0}
            step={1}
            value={position}
            disabled={disabled}
            onChange={(event) => {
              const next = Number.parseInt(event.target.value, 10)
              onPositionChange(Number.isFinite(next) ? Math.max(0, next) : 0)
            }}
            className={cn(CUSTOM_STYLE_FIELD_CLASS, 'text-sm')}
          />
          <p className="mt-1 font-body text-xs text-muted-foreground">
            {t('create.catalogAdmin.positionHint')}
          </p>
        </div>
      </div>

      <div>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium">
            {t('create.catalogAdmin.nameLabel')}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || translating || !content.name.es.trim()}
            onClick={onTranslate}
          >
            {translating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Languages className="mr-2 h-4 w-4" />
            )}
            {translating
              ? t('create.catalogAdmin.translating')
              : t('create.catalogAdmin.translate')}
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {LOCALES.map((locale) => (
            <div key={locale}>
              <label
                htmlFor={`catalog-style-name-${locale}`}
                className="mb-1 block text-xs text-muted-foreground"
              >
                {t(NAME_KEYS[locale])}
              </label>
              <input
                id={`catalog-style-name-${locale}`}
                value={content.name[locale]}
                maxLength={CUSTOM_STYLE_NAME_LIMIT}
                disabled={disabled}
                onChange={(event) => changeName(locale, event.target.value)}
                className={cn(CUSTOM_STYLE_FIELD_CLASS, 'text-sm')}
              />
            </div>
          ))}
        </div>
      </div>

      <CatalogTagsField
        tags={content.tags}
        slots={catalogTagSlots(content)}
        disabled={disabled}
        onChange={changeTags}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <fieldset>
          <legend className="mb-1 text-xs font-medium">
            {t('create.catalogAdmin.modesLabel')}
          </legend>
          <div className="space-y-1">
            {MODES.map((mode) => {
              const locked = isAllowed(mode) && !canDisableMode(mode)
              return (
                <label
                  key={mode}
                  className={cn(
                    'flex items-center gap-2 font-body text-sm',
                    locked && 'text-muted-foreground',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isAllowed(mode)}
                    disabled={disabled || locked}
                    onChange={() => toggleMode(mode)}
                    className="accent-saffron"
                  />
                  {t(MODE_KEYS[mode])}
                </label>
              )
            })}
          </div>
          {sampleModeLocked && (
            <p className="mt-1 font-body text-xs text-muted-foreground">
              {t('create.catalogAdmin.modesHintSamples')}
            </p>
          )}
        </fieldset>
        <fieldset>
          <legend className="mb-1 text-xs font-medium">
            {t('create.catalogAdmin.sampleModeLabel')}
          </legend>
          <div className="space-y-1">
            {SAMPLE_CHOICES.map((choice) => {
              const enabled = sampleChoiceEnabled(choice)
              return (
                <label
                  key={choice.key}
                  className={cn(
                    'flex items-center gap-2 font-body text-sm',
                    !enabled && 'text-muted-foreground',
                  )}
                >
                  <input
                    type="radio"
                    name="catalog-sample-mode"
                    checked={enabled && content.sampleMode === choice.mode}
                    disabled={disabled || !enabled}
                    onChange={() => chooseSampleMode(choice.mode)}
                    className="accent-saffron"
                  />
                  {t(choice.labelKey)}
                </label>
              )
            })}
          </div>
          <p className="mt-1 font-body text-xs text-muted-foreground">
            {t(
              hasStyleCharacter
                ? 'create.catalogAdmin.sampleHintStyleCharacter'
                : 'create.catalogAdmin.sampleHintNoCharacter',
            )}
          </p>
        </fieldset>
        <div>
          <label
            htmlFor="catalog-style-color-filter"
            className="mb-1 block text-xs font-medium"
          >
            {t('create.catalogAdmin.colorFilterLabel')}
          </label>
          <select
            id="catalog-style-color-filter"
            value={content.colorFilter}
            disabled={disabled}
            onChange={(event) =>
              onContentChange({
                ...content,
                colorFilter: event.target.value as ColorFilterId,
              })
            }
            className={cn(CUSTOM_STYLE_FIELD_CLASS, 'text-sm')}
          >
            {COLOR_FILTER_IDS.map((filter) => (
              <option key={filter} value={filter}>
                {t(COLOR_FILTER_KEYS[filter])}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
