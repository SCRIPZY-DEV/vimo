import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { formatDateTime } from '@/modules/common/utilities/formatDateTime'
import {
  History,
  Loader2,
  Music2,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { Input } from '@/modules/common/ui/input'
import { musicApi } from '@/modules/music/api'
import { useMusicHistory } from '@/modules/music/hooks/useMusicHistory'
import { AudioPlayer } from '@/modules/common/components/AudioPlayer'
import { matchesSearch } from '@/modules/music/utilities/matchesSearch'
import type { MusicHistoryEntry } from '@pipeline/types/music.ts'

export function MusicHistoryPanel() {
  const { t, i18n } = useTranslation()
  const {
    isNative,
    entries,
    isLoading,
    isFetching,
    errorKey,
    refresh,
    deleteEntry,
    deleting,
  } = useMusicHistory()
  const [search, setSearch] = useState('')

  if (!isNative) return null

  const visible = entries.filter((entry) => matchesSearch(entry, search))

  const confirmDelete = (entry: MusicHistoryEntry) => {
    if (window.confirm(t('music.historial.confirmarEliminar'))) {
      deleteEntry(entry.id)
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border-2 border-border bg-card p-6 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-display text-lg font-bold text-foreground">
            {t('music.historial.titulo')}
          </h2>
          <span className="font-body text-sm text-muted-foreground">
            {t('music.historial.contador', { count: entries.length })}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={refresh}
          aria-label={t('music.historial.recargar')}
          className="h-8 w-8 rounded-lg"
        >
          <RefreshCw
            className={isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
          />
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('music.historial.buscar')}
          className="pl-9 pr-9"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label={t('music.historial.limpiar')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {errorKey && <ErrorMessage>{t(errorKey)}</ErrorMessage>}

      {isLoading && (
        <p className="py-8 text-center font-body text-sm text-muted-foreground">
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        </p>
      )}

      {!isLoading && visible.length === 0 && (
        <p className="py-8 text-center font-body text-sm text-muted-foreground">
          {search
            ? t('music.historial.sinResultados')
            : t('music.historial.vacio')}
        </p>
      )}

      {visible.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {visible.map((entry) => (
            <li
              key={entry.id}
              className="space-y-3 rounded-xl border border-border bg-background p-3"
            >
              <div className="flex items-start gap-3">
                {entry.coverPath ? (
                  <img
                    src={musicApi.audioSource(entry.coverPath)}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-saffron via-saffron/70 to-coral">
                    <Music2 className="h-7 w-7 text-white/90" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-bold text-foreground">
                    {entry.name ??
                      entry.title ??
                      t('music.historial.sinTitulo')}
                  </p>
                  <p className="line-clamp-2 font-body text-xs text-muted-foreground">
                    {entry.prompt}
                  </p>
                  <p className="mt-1 font-body text-xs text-muted-foreground">
                    {formatDateTime(entry.createdAt, i18n.resolvedLanguage)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={deleting}
                  onClick={() => confirmDelete(entry)}
                  aria-label={t('music.historial.eliminar')}
                  className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <AudioPlayer src={musicApi.audioSource(entry.audioPath)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
