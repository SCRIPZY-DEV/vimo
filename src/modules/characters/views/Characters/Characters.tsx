import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { SegmentedTabs } from '@/modules/common/components/SegmentedTabs'
import { ViewSpinner } from '@/modules/common/components/ViewSpinner'
import DoodleCharacter from '@/modules/common/doodles/DoodleCharacter'
import { usePageTitle } from '@/modules/common/hooks/usePageTitle'
import { Button } from '@/modules/common/ui/button'
import { cn } from '@/modules/common/utilities/cn'
import { MissingApiKeysNotice } from '@/modules/api-keys/components/MissingApiKeysNotice'
import { MODULE_API_KEY_REQUIREMENTS } from '@/modules/api-keys/constants'
import { useRequiredApiKeys } from '@/modules/api-keys/hooks/useRequiredApiKeys'
import { CharacterCard } from '@/modules/characters/components/CharacterCard'
import { CharacterModal } from '@/modules/characters/components/CharacterModal'
import { CHARACTER_FILTERS } from '@/modules/characters/constants'
import { useCharacterMutations } from '@/modules/characters/hooks/useCharacterMutations'
import { useCharacters } from '@/modules/characters/hooks/useCharacters'
import { identitySourceOf } from '@/modules/characters/utilities/identitySourceOf'
import type { CharacterSummary } from '@pipeline/types/characters.ts'
import type { CharacterIdentitySource } from '@/modules/characters/types/characters'

export function Characters() {
  const { t } = useTranslation()
  const { isNative, entries, isLoading, errorKey } = useCharacters()
  const { deleteCharacter } = useCharacterMutations()
  const { missingKeys } = useRequiredApiKeys({
    requirements: MODULE_API_KEY_REQUIREMENTS.characters,
  })

  const [editing, setEditing] = useState<CharacterSummary | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  // Pestaña elegida por la persona; hasta que elige, la que tenga personajes
  // (con foto primero, como las sub-pestañas del modal).
  const [chosenFilter, setChosenFilter] =
    useState<CharacterIdentitySource | null>(null)

  usePageTitle(t('characters.pageTitle'))

  const filter =
    chosenFilter ??
    (entries.some((entry) => identitySourceOf(entry) === 'photo')
      ? 'photo'
      : 'text')
  const visible = entries.filter((entry) => identitySourceOf(entry) === filter)

  const openCreate = () => {
    setEditing(null)
    setModalOpen(true)
  }
  const openEdit = (character: CharacterSummary) => {
    setEditing(character)
    setModalOpen(true)
  }
  const closeModal = () => {
    setModalOpen(false)
    setEditing(null)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-8 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3">
          <DoodleCharacter size={48} delay={100} />
          <div>
            <h1 className="font-display text-3xl font-extrabold text-foreground">
              {t('characters.titulo')}
            </h1>
            <p className="font-handwritten text-lg text-muted-foreground">
              {t('characters.tagline')}
            </p>
          </div>
        </div>
        {/* Sin claves igual se puede crear un personaje con foto (no usa IA);
            dentro del modal, la IA y los previews se apagan por su cuenta. */}
        <Button
          size="lg"
          disabled={!isNative}
          onClick={openCreate}
          className="shrink-0 rounded-xl font-display font-bold"
        >
          <Plus className="mr-2 h-4 w-4" />
          {t('characters.crear')}
        </Button>
      </motion.div>

      {!isNative && (
        <p className="font-body text-sm text-saffron">
          {t('characters.soloEscritorio')}
        </p>
      )}

      <p className="font-body text-sm text-muted-foreground">
        {t('characters.intro')}
      </p>

      {missingKeys && (
        <MissingApiKeysNotice
          requirements={MODULE_API_KEY_REQUIREMENTS.characters}
        />
      )}

      {errorKey && <ErrorMessage>{t(errorKey)}</ErrorMessage>}

      {isLoading && <ViewSpinner className="py-12" />}

      {!isLoading && entries.length === 0 && isNative && (
        <button
          type="button"
          onClick={openCreate}
          className="flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border p-12 text-center transition-colors hover:border-saffron/50"
        >
          <DoodleCharacter size={64} />
          <span className="font-display text-lg font-bold text-foreground">
            {t('characters.vacio.titulo')}
          </span>
          <span className="max-w-md font-body text-sm text-muted-foreground">
            {t('characters.vacio.texto')}
          </span>
        </button>
      )}

      {entries.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'space-y-4',
            !isNative && 'pointer-events-none opacity-60',
          )}
        >
          <SegmentedTabs
            value={filter}
            ariaLabel={t('characters.filter.ariaLabel')}
            options={CHARACTER_FILTERS.map(({ id, labelKey }) => ({
              id,
              label: t(labelKey),
            }))}
            onChange={setChosenFilter}
          />

          {visible.length === 0 ? (
            <p className="py-8 text-center font-body text-sm text-muted-foreground">
              {t(
                filter === 'photo'
                  ? 'characters.filter.emptyPhoto'
                  : 'characters.filter.emptyText',
              )}
            </p>
          ) : (
            <ul className="grid auto-rows-fr grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {visible.map((entry) => (
                <li key={entry.id}>
                  <CharacterCard
                    character={entry}
                    disabled={!isNative}
                    onEdit={openEdit}
                    onDelete={(character) => deleteCharacter(character.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </motion.div>
      )}

      {modalOpen && (
        <CharacterModal
          character={editing}
          initialSource={filter}
          onClose={closeModal}
        />
      )}
    </div>
  )
}
