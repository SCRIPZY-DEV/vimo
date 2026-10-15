import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Blend, Check, Search } from 'lucide-react'
import { CheckboxRow } from '@/modules/common/components/CheckboxRow'
import { Input } from '@/modules/common/ui/input'
import { cn } from '@/modules/common/utilities/cn'
import type { EditorTransitionsPanelProps } from '@/modules/videos/types/editorTools'
import styles from '@/modules/videos/components/EditorTransitionsPanel.module.css'

export function EditorTransitionsPanel({
  enabled,
  available,
  busy,
  onChange,
}: EditorTransitionsPanelProps) {
  const { t } = useTranslation()
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
        <div className="grid grid-cols-[repeat(auto-fill,minmax(135px,1fr))] gap-3">
          <button
            type="button"
            disabled={busy || !available}
            aria-label={name}
            aria-pressed={enabled}
            data-editor-transition="crossfade"
            onClick={() => onChange(!enabled)}
            className={cn(
              styles.card,
              'overflow-hidden rounded-xl border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron disabled:cursor-not-allowed disabled:opacity-50',
              enabled
                ? 'border-saffron bg-saffron/10'
                : 'border-border bg-background hover:border-saffron/70',
            )}
          >
            <div aria-hidden className="relative h-24 overflow-hidden">
              <div className="absolute inset-0 overflow-hidden bg-gradient-to-b from-sky/30 via-sky/10 to-ocean/20">
                <div className="absolute right-5 top-4 h-6 w-6 rounded-full bg-saffron/80" />
                <div className="absolute -bottom-7 -left-5 h-20 w-32 rotate-12 rounded-[45%] bg-ocean/50" />
                <div className="absolute -bottom-10 -right-3 h-24 w-36 -rotate-12 rounded-[45%] bg-ocean/75" />
              </div>
              <div
                className={cn(
                  styles.secondScene,
                  'absolute inset-0 overflow-hidden bg-gradient-to-b from-lavender/65 via-lavender/30 to-amethyst/25',
                )}
              >
                <div className="absolute left-5 top-4 h-7 w-7 rounded-full bg-white/80" />
                <div className="absolute -bottom-5 -left-6 h-20 w-36 -rotate-12 rounded-[45%] bg-amethyst/50" />
                <div className="absolute -bottom-8 -right-6 h-24 w-32 rotate-12 rounded-[45%] bg-amethyst/70" />
              </div>
              <div className="absolute bottom-2 left-2 rounded-md bg-card/80 p-1 text-foreground/70">
                <Blend className="h-3.5 w-3.5" />
              </div>
              {enabled && (
                <span className="absolute right-2 top-2 rounded-full bg-saffron p-1 text-charcoal">
                  <Check className="h-3 w-3" />
                </span>
              )}
            </div>
            <span className="block truncate p-2.5 font-display text-xs font-bold text-foreground">
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
      {!available && (
        <p className="font-body text-xs leading-relaxed text-muted-foreground">
          {t('library.editor.tools.transitionsPanel.unavailable')}
        </p>
      )}
      <div className="rounded-xl border border-border bg-muted/20 p-3">
        <CheckboxRow
          label={t('library.editor.transitions.label')}
          checked={enabled}
          disabled={busy || !available}
          onChange={onChange}
        />
      </div>
    </div>
  )
}
