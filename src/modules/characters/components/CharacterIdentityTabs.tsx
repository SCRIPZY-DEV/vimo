import { useTranslation } from 'react-i18next'
import { SegmentedTabs } from '@/modules/common/components/SegmentedTabs'
import { IDENTITY_SOURCES } from '@/modules/characters/constants'
import type { CharacterIdentitySource } from '@/modules/characters/types/characters'

interface CharacterIdentityTabsProps {
  value: CharacterIdentitySource
  disabled: boolean
  onChange: (value: CharacterIdentitySource) => void
}

// Sub-pestañas «Con foto · cara idéntica» / «Sin foto · más barato» del modal
// (port de PaginaPersonajes del origen). Solo aparecen al crear: el modo se
// fija con el personaje.
export function CharacterIdentityTabs({
  value,
  disabled,
  onChange,
}: CharacterIdentityTabsProps) {
  const { t } = useTranslation()

  return (
    <SegmentedTabs
      value={value}
      ariaLabel={t('characters.identity.ariaLabel')}
      disabled={disabled}
      options={IDENTITY_SOURCES.map(({ id, titleKey, hintKey }) => ({
        id,
        label: t(titleKey),
        hint: t(hintKey),
      }))}
      onChange={onChange}
    />
  )
}
