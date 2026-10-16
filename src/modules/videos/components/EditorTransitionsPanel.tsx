import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Shuffle, Check, Search } from 'lucide-react'
import { CheckboxRow } from '@/modules/common/components/CheckboxRow'
import { Input } from '@/modules/common/ui/input'
import { useToast } from '@/modules/common/hooks/useToast'
import { cn } from '@/modules/common/utilities/cn'
import type { EditorTransitionsPanelProps } from '@/modules/videos/types/editorTools'
import { TransitionPreview } from '@/modules/videos/components/TransitionPreview'
import styles from '@/modules/videos/components/EditorTransitionsPanel.module.css'
import gridStyles from '@/modules/videos/components/EditorToolCardGrid.module.css'

export function EditorTransitionsPanel({
  enabled,
  available,
  allEnabled,
  allAvailable,
  busy,
  selectedSceneNumber,
  nextSceneNumber,
  previewImages,
  onChange,
  onChangeAll,
}: EditorTransitionsPanelProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const boundaryHintId = useId()
  const [search, setSearch] = useState('')
  const [appliedOnly, setAppliedOnly] = useState(false)
  const name = t('library.editor.tools.transitionsPanel.crossfade')
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase()
      .trim()
  const matches =
    (!appliedOnly || enabled) && normalize(name).includes(normalize(search))

  const applySelected = () => {
    if (busy) return
    if (selectedSceneNumber === undefined) {
      toast({
        description: t(
          'library.editor.tools.transitionsPanel.selectBoundaryHint',
        ),
      })
      return
    }
    if (!available) return
    onChange(!enabled)
  }

  const boundaryHint = () => {
    if (
      available &&
      selectedSceneNumber !== undefined &&
      nextSceneNumber !== undefined
    )
      return t('library.editor.tools.transitionsPanel.pairHint', {
        from: selectedSceneNumber,
        to: nextSceneNumber,
      })

    if (available)
      return t('library.editor.tools.transitionsPanel.selectedBoundaryHint')

    if (selectedSceneNumber === undefined)
      return t('library.editor.tools.transitionsPanel.selectBoundaryHint')

    if (nextSceneNumber !== undefined && enabled)
      return t('library.editor.tools.transitionsPanel.automaticHint')

    return t('library.editor.tools.transitionsPanel.noNextSceneHint')
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground"
        />
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label={t('library.editor.tools.transitionsPanel.search')}
          placeholder={t('library.editor.tools.transitionsPanel.search')}
          className="h-10 pl-9 font-body text-sm"
        />
      </div>
      <div
        role="group"
        aria-label={t('library.editor.tools.transitionsPanel.filter')}
        className="flex flex-wrap gap-2"
      >
        {[false, true].map((applied) => (
          <button
            key={String(applied)}
            type="button"
            aria-pressed={appliedOnly === applied}
            onClick={() => setAppliedOnly(applied)}
            className={cn(
              'rounded-full border px-3 py-1.5 font-display text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron',
              appliedOnly === applied
                ? 'border-saffron/40 bg-saffron/15 text-foreground'
                : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            {t(
              applied
                ? 'library.editor.tools.transitionsPanel.applied'
                : 'library.editor.tools.transitionsPanel.all',
            )}
          </button>
        ))}
      </div>
      {matches ? (
        <div data-editor-transition-grid className={gridStyles.grid}>
          <button
            type="button"
            disabled={busy || (!available && selectedSceneNumber !== undefined)}
            aria-label={name}
            aria-describedby={boundaryHintId}
            aria-pressed={enabled}
            data-editor-transition="crossfade"
            onClick={applySelected}
            className={cn(
              styles.card,
              'overflow-hidden rounded-xl border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron disabled:cursor-not-allowed disabled:opacity-50',
              enabled
                ? 'border-saffron bg-saffron/10'
                : 'border-border bg-background hover:border-saffron/70',
            )}
          >
            <div aria-hidden className="relative">
              <TransitionPreview images={previewImages} />
              <div className="absolute bottom-2 left-2 rounded-md bg-card/80 p-1 text-foreground/70">
                <Shuffle className="h-3.5 w-3.5" />
              </div>
              {enabled && (
                <span className="absolute right-2 top-2 rounded-full bg-saffron p-1 text-charcoal">
                  <Check className="h-3 w-3" />
                </span>
              )}
            </div>
            <span className="block truncate px-2 py-1.5 font-display text-xs font-bold text-foreground">
              {name}
            </span>
          </button>
        </div>
      ) : (
        <p
          role="status"
          className="rounded-xl bg-muted/40 p-4 font-body text-xs leading-relaxed text-muted-foreground"
        >
          {t('library.editor.tools.transitionsPanel.empty')}
        </p>
      )}
      <p className="font-body text-xs leading-relaxed text-muted-foreground">
        {t('library.editor.tools.transitionsPanel.previewHint')}
      </p>
      <p
        id={boundaryHintId}
        className="font-body text-xs leading-relaxed text-muted-foreground"
      >
        {boundaryHint()}
      </p>
      <div className="rounded-xl border border-border bg-muted/20 p-3">
        <CheckboxRow
          label={t('library.editor.tools.transitionsPanel.applyAll')}
          checked={allEnabled}
          disabled={busy || !allAvailable}
          onChange={onChangeAll}
        />
      </div>
    </div>
  )
}
