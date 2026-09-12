import { useTranslation } from 'react-i18next'
import { Tabs, TabsList, TabsTrigger } from '@/modules/common/ui/tabs'
import { IDENTITY_SOURCES } from '@/modules/characters/constants'
import type { CharacterIdentitySource } from '@/modules/characters/types/characters'

interface CharacterIdentityTabsProps {
  value: CharacterIdentitySource
  disabled: boolean
  onChange: (value: CharacterIdentitySource) => void
}

// Sub-pestañas «Con foto · cara idéntica» / «Sin foto · más barato» del modal
// (port de PaginaPersonajes del origen): la activa en saffron pleno con el
// texto oscuro, la otra apagada sobre la pista gris. Solo aparecen al crear.
export function CharacterIdentityTabs({
  value,
  disabled,
  onChange,
}: CharacterIdentityTabsProps) {
  const { t } = useTranslation()

  return (
    <Tabs
      value={value}
      onValueChange={(next) => onChange(next as CharacterIdentitySource)}
    >
      <TabsList
        aria-label={t('characters.identity.ariaLabel')}
        className="flex h-auto w-full gap-1.5 rounded-lg bg-muted/40 p-1"
      >
        {IDENTITY_SOURCES.map(({ id, titleKey, hintKey }) => (
          <TabsTrigger
            key={id}
            value={id}
            disabled={disabled}
            className="flex-1 rounded-md px-3 py-2 font-display text-sm font-bold text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-saffron data-[state=active]:text-charcoal data-[state=active]:shadow-sm"
          >
            {t(titleKey)} ·
            <span className="ml-1 font-body text-[11px] font-normal">
              {t(hintKey)}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
