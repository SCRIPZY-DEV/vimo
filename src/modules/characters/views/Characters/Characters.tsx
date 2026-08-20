import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Loader2, Plus } from 'lucide-react'
import DoodlePersonaje from '@/modules/common/doodles/DoodlePersonaje'
import { usePageTitle } from '@/modules/common/hooks/usePageTitle'
import { Button } from '@/modules/common/ui/button'
import { cn } from '@/modules/common/utilities/cn'
import { CharacterCard } from '@/modules/characters/components/CharacterCard'
import { CharacterModal } from '@/modules/characters/components/CharacterModal'
import { useCharacterMutations } from '@/modules/characters/hooks/useCharacterMutations'
import { useCharacters } from '@/modules/characters/hooks/useCharacters'
import type { CharacterSummary } from '@pipeline/types/characters.ts'

export function Characters() {
  const { t } = useTranslation()
  const { isNative, entries, isLoading, errorKey } = useCharacters()
  const { deleteCharacter } = useCharacterMutations()

  const [editing, setEditing] = useState<CharacterSummary | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  usePageTitle(t('characters.pageTitle'))

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
          <DoodlePersonaje size={48} delay={100} />
          <div>
            <h1 className="font-display text-3xl font-extrabold text-foreground">
              {t('characters.titulo')}
            </h1>
            <p className="font-handwritten text-lg text-muted-foreground">
              {t('characters.tagline')}
            </p>
          </div>
        </div>
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

      {errorKey && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 font-body text-sm text-destructive">
          {t(errorKey)}
        </p>
      )}

      {isLoading && (
        <p className="py-12 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
        </p>
      )}

      {!isLoading && entries.length === 0 && isNative && (
        <button
          type="button"
          onClick={openCreate}
          className="flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border p-12 text-center transition-colors hover:border-saffron/50"
        >
          <DoodlePersonaje size={64} />
          <span className="font-display text-lg font-bold text-foreground">
            {t('characters.vacio.titulo')}
          </span>
          <span className="max-w-md font-body text-sm text-muted-foreground">
            {t('characters.vacio.texto')}
          </span>
        </button>
      )}

      {entries.length > 0 && (
        <motion.ul
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4',
            !isNative && 'pointer-events-none opacity-60',
          )}
        >
          {entries.map((entry) => (
            <li key={entry.id}>
              <CharacterCard
                character={entry}
                disabled={!isNative}
                onEdit={openEdit}
                onDelete={(character) => deleteCharacter(character.id)}
              />
            </li>
          ))}
        </motion.ul>
      )}

      {modalOpen && <CharacterModal character={editing} onClose={closeModal} />}
    </div>
  )
}
