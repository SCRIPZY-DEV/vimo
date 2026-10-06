import { useTranslation } from 'react-i18next'
import {
  ArchiveRestore,
  Check,
  Copy,
  Eye,
  EyeOff,
  Pencil,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/modules/common/ui/dropdown-menu'
import { cn } from '@/modules/common/utilities/cn'
import { CatalogStyleTags } from '@/modules/videos/components/CatalogStyleTags'
import { StyleCardFrame } from '@/modules/videos/components/StyleCardFrame'
import { localizedText } from '@/modules/videos/utilities/catalogLocale'
import type { CatalogAdminBadge } from '@/modules/videos/types/catalogRemote'
import type { CatalogGem } from '@pipeline/types/catalog.ts'

/** Lo que el admin puede hacer con un estilo desde su tarjeta (ADR-0049). */
export interface CatalogStyleAdminActions {
  badge: CatalogAdminBadge | null
  // Hay otra acción del admin en curso: no se lanza una más.
  busy: boolean
  // Publicar no se ofrece mientras al borrador le falte algo (plan E3, P5).
  canPublish: boolean
  // Archivado: cuántos días faltan para que el servidor lo purgue (0 = hoy).
  purgeDaysLeft: number | null
  onEdit: () => void
  onGenerateSamples: () => void
  onPublish: () => void
  onHide: () => void
  onDelete: () => void
  onRestore: () => void
}

interface CatalogStyleCardProps {
  gem: CatalogGem
  // URLs de las muestras, ya resueltas: empaquetadas en la app, sincronizadas
  // en disco o del bucket (las de un borrador del admin).
  images: string[]
  selected: boolean
  disabled: boolean
  // Hay una copia a Mi estilo en curso: no se lanza otra.
  copying: boolean
  // Solo para el admin con el catálogo remoto encendido.
  admin?: CatalogStyleAdminActions
  onSelect: () => void
  onView: () => void
  onCopy: () => void
}

// El distintivo del admin: «Borrador» (nunca se publicó) u «Oculto» en gris y
// con la tarjeta apagada; con cambios sin publicar, en amarillo (hay algo que
// los usuarios todavía no ven); archivado, en rojo (cuenta regresiva hasta que
// el servidor lo purgue).
const BADGE_CLASS: Record<CatalogAdminBadge, string> = {
  unpublished: 'bg-charcoal/80 text-white',
  hidden: 'bg-charcoal/80 text-white',
  changes: 'bg-saffron text-charcoal',
  archived: 'bg-destructive text-white',
}

// Tarjeta de un estilo del catálogo de Vimo (Entrega 2): el mismo cascarón que
// las de Mi estilo, con sus muestras, el nombre y las etiquetas en el idioma de
// la app, y su menú (usar, ver, pasar a Mi estilo). Sin descripción (pedido
// del dueño, 2026-10-05). Sin muestras, el mismo marcador que una de Mi
// estilo. Para el admin del catálogo remoto (ADR-0049) suma el distintivo del
// estado y las acciones de administrar; una archivada (eliminada, a la espera
// de la purga) solo se mira y se restaura.
export function CatalogStyleCard({
  gem,
  images,
  selected,
  disabled,
  copying,
  admin,
  onSelect,
  onView,
  onCopy,
}: CatalogStyleCardProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'es'
  const name = localizedText(gem.name, language)
  const hidden = admin?.badge === 'hidden' || admin?.badge === 'unpublished'
  const archived = admin?.badge === 'archived'
  const badgeText = (
    badge: CatalogAdminBadge,
    purgeDaysLeft: number | null,
  ) => {
    if (badge !== 'archived') return t(`create.catalogAdmin.badge.${badge}`)
    if (!purgeDaysLeft) return t('create.catalogAdmin.badge.archivedToday')
    return t('create.catalogAdmin.badge.archived', { count: purgeDaysLeft })
  }

  return (
    <StyleCardFrame
      images={images}
      name={name}
      noSamplesText={t('create.catalog.noSamples')}
      menuLabel={t('create.catalog.menuAria', { name })}
      selected={selected}
      disabled={disabled}
      // Lo que los usuarios no ven (un borrador, uno oculto) va apagado.
      faded={hidden}
      overlay={
        admin?.badge ? (
          // Debajo de «En uso» si las dos están: la esquina izquierda es de
          // los estados.
          <span
            className={cn(
              'absolute left-2 z-[5] inline-flex items-center rounded-full px-2 py-0.5 font-display text-[10px] font-bold shadow',
              selected ? 'top-8' : 'top-2',
              BADGE_CLASS[admin.badge],
            )}
          >
            {badgeText(admin.badge, admin.purgeDaysLeft)}
          </span>
        ) : undefined
      }
      menu={
        <>
          {/* Una archivada no se usa ni se copia: se mira y se restaura. */}
          {!archived && (
            <DropdownMenuItem disabled={selected} onSelect={onSelect}>
              <Check className="mr-2 h-4 w-4" />
              {selected
                ? t('create.catalog.alreadyInUse')
                : t('create.catalog.useInVideo')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={onView}>
            <Eye className="mr-2 h-4 w-4" />
            {t('create.catalog.view')}
          </DropdownMenuItem>
          {!archived && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={copying} onSelect={onCopy}>
                <Copy className="mr-2 h-4 w-4" />
                {t('create.catalog.copyToCustom')}
              </DropdownMenuItem>
            </>
          )}
          {admin && archived && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={admin.busy}
                onSelect={admin.onRestore}
              >
                <ArchiveRestore className="mr-2 h-4 w-4" />
                {t('create.catalogAdmin.menu.restore')}
              </DropdownMenuItem>
            </>
          )}
          {admin && !archived && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={admin.busy} onSelect={admin.onEdit}>
                <Pencil className="mr-2 h-4 w-4" />
                {t('create.catalogAdmin.menu.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={admin.busy}
                onSelect={admin.onGenerateSamples}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {t('create.catalogAdmin.menu.generateSamples')}
              </DropdownMenuItem>
              {/* Publicar solo cuando el borrador está completo y tiene algo
                  que los usuarios no vean todavía; ocultar, solo publicado. */}
              {(hidden || admin.badge === 'changes') && (
                <DropdownMenuItem
                  disabled={admin.busy || !admin.canPublish}
                  onSelect={admin.onPublish}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {t('create.catalogAdmin.menu.publish')}
                </DropdownMenuItem>
              )}
              {!hidden && (
                <DropdownMenuItem disabled={admin.busy} onSelect={admin.onHide}>
                  <EyeOff className="mr-2 h-4 w-4" />
                  {t('create.catalogAdmin.menu.hide')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                disabled={admin.busy}
                onSelect={admin.onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('create.catalogAdmin.menu.delete')}
              </DropdownMenuItem>
            </>
          )}
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
