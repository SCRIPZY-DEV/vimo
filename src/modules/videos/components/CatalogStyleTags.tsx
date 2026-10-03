import { useTranslation } from 'react-i18next'
import { cn } from '@/modules/common/utilities/cn'
import { localizedText } from '@/modules/videos/utilities/catalogLocale'
import type { LocalizedText } from '@pipeline/types/catalog.ts'

interface CatalogStyleTagsProps {
  tags: LocalizedText[]
  // En la tarjeta: una sola fila de alto fijo, siempre presente, así las
  // tarjetas miden lo mismo y la grilla no se deforma; las que no entran no
  // se ven (en «Ver» están todas).
  singleRow: boolean
}

// Las etiquetas que el admin le pone a un estilo del catálogo (plan E2, P12)
// como chips chicos: qué es el estilo y qué hace. Viajan dentro de la gema en
// los tres idiomas; no tienen claves de i18n.
export function CatalogStyleTags({ tags, singleRow }: CatalogStyleTagsProps) {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'es'

  if (tags.length === 0 && !singleRow) return null

  return (
    <ul
      className={cn('flex flex-wrap gap-1', singleRow && 'h-4 overflow-hidden')}
    >
      {tags.map((tag) => (
        <li
          key={tag.es}
          className="inline-flex h-4 items-center whitespace-nowrap rounded-full bg-muted px-1.5 font-body text-[10px] font-semibold leading-none text-muted-foreground"
        >
          {localizedText(tag, language)}
        </li>
      ))}
    </ul>
  )
}
