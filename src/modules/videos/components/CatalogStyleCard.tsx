import { useTranslation } from 'react-i18next'
import { Check, Copy, Eye } from 'lucide-react'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/modules/common/ui/dropdown-menu'
import { CatalogStyleTags } from '@/modules/videos/components/CatalogStyleTags'
import { StyleCardFrame } from '@/modules/videos/components/StyleCardFrame'
import { localizedText } from '@/modules/videos/utilities/catalogLocale'
import { catalogSampleImages } from '@/modules/videos/utilities/catalogSamples'
import type { CatalogGem } from '@pipeline/types/catalog.ts'

interface CatalogStyleCardProps {
  gem: CatalogGem
  selected: boolean
  disabled: boolean
  // Hay una copia a Mi estilo en curso: no se lanza otra.
  copying: boolean
  onSelect: () => void
  onView: () => void
  onCopy: () => void
}

// Tarjeta de un estilo del catálogo de Vimo (Entrega 2): el mismo cascarón que
// las de Mi estilo, con las muestras que trae la app, el nombre y las
// etiquetas en el idioma de la app, y su menú (usar, ver, pasar a Mi estilo).
// Sin descripción (pedido del dueño, 2026-10-05). Sin muestras, el mismo
// marcador que una de Mi estilo.
export function CatalogStyleCard({
  gem,
  selected,
  disabled,
  copying,
  onSelect,
  onView,
  onCopy,
}: CatalogStyleCardProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'es'
  const name = localizedText(gem.name, language)

  return (
    <StyleCardFrame
      images={catalogSampleImages(gem)}
      name={name}
      noSamplesText={t('create.catalog.noSamples')}
      menuLabel={t('create.catalog.menuAria', { name })}
      selected={selected}
      disabled={disabled}
      menu={
        <>
          <DropdownMenuItem disabled={selected} onSelect={onSelect}>
            <Check className="mr-2 h-4 w-4" />
            {selected
              ? t('create.catalog.alreadyInUse')
              : t('create.catalog.useInVideo')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onView}>
            <Eye className="mr-2 h-4 w-4" />
            {t('create.catalog.view')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={copying} onSelect={onCopy}>
            <Copy className="mr-2 h-4 w-4" />
            {t('create.catalog.copyToCustom')}
          </DropdownMenuItem>
        </>
      }
      footer={
        <>
          <p className="truncate font-display text-base font-bold text-foreground">
            {name}
          </p>
          <div className="mt-1">
            <CatalogStyleTags tags={gem.tags} singleRow />
          </div>
        </>
      }
      onSelect={onSelect}
    />
  )
}
