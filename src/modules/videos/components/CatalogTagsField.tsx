import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, X } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { cn } from '@/modules/common/utilities/cn'
import {
  CATALOG_TAG_LABEL_LIMIT,
  CUSTOM_STYLE_FIELD_CLASS,
} from '@/modules/videos/constants'
import { localizedText } from '@/modules/videos/utilities/catalogLocale'
import {
  CATALOG_TAG_CHOICES,
  isBehaviorTag,
  sameCatalogTag,
} from '@/modules/videos/utilities/catalogTagPalette'
import type { CatalogLocale, LocalizedText } from '@pipeline/types/catalog.ts'

interface CatalogTagsFieldProps {
  // Las etiquetas del borrador, con las de comportamiento incluidas (esas no
  // se tocan acá: las pone y las saca la app según las secciones).
  tags: LocalizedText[]
  // Cuántas puede elegir el admin además de las de comportamiento.
  slots: number
  disabled: boolean
  onChange: (tags: LocalizedText[]) => void
}

const LOCALES: readonly CatalogLocale[] = ['es', 'en', 'pt']
const EMPTY_CUSTOM: LocalizedText = { es: '', en: '', pt: '' }

// Las etiquetas de un estilo del catálogo (plan E3, P7): se eligen de la
// paleta de Vimo o se escriben a mano en los tres idiomas. «Dinamismo» y
// «Personaje fijo» se muestran pero no se eligen: salen de las secciones.
export function CatalogTagsField({
  tags,
  slots,
  disabled,
  onChange,
}: CatalogTagsFieldProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'es'
  const [custom, setCustom] = useState<LocalizedText>(EMPTY_CUSTOM)
  const chosen = tags.filter((tag) => !isBehaviorTag(tag))
  const full = chosen.length >= slots

  const isChosen = (tag: LocalizedText) =>
    chosen.some((existing) => sameCatalogTag(existing, tag))

  const toggle = (tag: LocalizedText) => {
    if (isChosen(tag)) {
      onChange(tags.filter((existing) => !sameCatalogTag(existing, tag)))
      return
    }
    if (full) return
    onChange([...tags, tag])
  }

  const customReady = LOCALES.every((locale) => {
    const text = custom[locale].trim()
    return text.length > 0 && text.length <= CATALOG_TAG_LABEL_LIMIT
  })

  const addCustom = () => {
    if (!customReady || full) return
    const tag: LocalizedText = {
      es: custom.es.trim(),
      en: custom.en.trim(),
      pt: custom.pt.trim(),
    }
    if (isChosen(tag) || isBehaviorTag(tag)) return
    onChange([...tags, tag])
    setCustom(EMPTY_CUSTOM)
  }

  return (
    <div>
      <p className="mb-1 text-xs font-medium">
        {t('create.catalogAdmin.tagsLabel')}
      </p>
      <p className="mb-2 font-body text-xs text-muted-foreground">
        {t('create.catalogAdmin.tagsHint', { count: slots })}
      </p>

      {/* Lo elegido, con las de comportamiento fijas al frente. */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {tags.map((tag) => {
          const behavior = isBehaviorTag(tag)
          const label = localizedText(tag, language)
          return (
            <span
              key={tag.es}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-display text-xs font-bold',
                behavior
                  ? 'bg-saffron text-charcoal'
                  : 'bg-charcoal text-white',
              )}
            >
              {label}
              {!behavior && (
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={t('create.catalogAdmin.tagRemove', {
                    name: label,
                  })}
                  onClick={() => toggle(tag)}
                  className="rounded-full p-0.5 hover:bg-white/20 disabled:opacity-60"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          )
        })}
      </div>

      {/* La paleta: cada chip se enciende o se apaga; llena, las que no
          están se atenúan. */}
      <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-border p-2">
        {CATALOG_TAG_CHOICES.map((tag) => {
          const active = isChosen(tag)
          return (
            <button
              key={tag.es}
              type="button"
              disabled={disabled || (full && !active)}
              onClick={() => toggle(tag)}
              className={cn(
                'rounded-full border px-2.5 py-0.5 font-display text-xs font-bold transition-colors disabled:cursor-default',
                active
                  ? 'border-charcoal bg-charcoal text-white'
                  : 'border-border bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40',
              )}
            >
              {localizedText(tag, language)}
            </button>
          )
        })}
      </div>
      {full && (
        <p className="mt-1 font-body text-xs text-muted-foreground">
          {t('create.catalogAdmin.tagsFull')}
        </p>
      )}

      {/* Una etiqueta propia, en los tres idiomas. */}
      <div className="mt-2">
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          {t('create.catalogAdmin.tagCustomLabel')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {LOCALES.map((locale) => (
            <input
              key={locale}
              value={custom[locale]}
              maxLength={CATALOG_TAG_LABEL_LIMIT}
              disabled={disabled || full}
              placeholder={t(`create.catalogAdmin.name${localeLabel(locale)}`)}
              onChange={(event) =>
                setCustom((current) => ({
                  ...current,
                  [locale]: event.target.value,
                }))
              }
              className={cn(CUSTOM_STYLE_FIELD_CLASS, 'w-36 text-sm')}
            />
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || full || !customReady}
            onClick={addCustom}
          >
            <Plus className="mr-1 h-4 w-4" />
            {t('create.catalogAdmin.tagAdd')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function localeLabel(locale: CatalogLocale): 'Es' | 'En' | 'Pt' {
  if (locale === 'es') return 'Es'
  if (locale === 'en') return 'En'
  return 'Pt'
}
