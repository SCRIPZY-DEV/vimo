import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/modules/common/ui/dialog'
import { useExtensionRelease } from '@/modules/extension/hooks/useExtensionRelease'
import {
  extensionReleaseErrorKey,
  extensionReleaseState,
} from '@/modules/extension/utilities/extensionReleaseState'
import type { ExtensionReleaseSectionProps } from '@/modules/extension/types/release'

export function ExtensionReleaseSection({
  connections,
  statusLoading,
  statusFailed,
}: ExtensionReleaseSectionProps) {
  const { t, i18n } = useTranslation()
  const { native, release, receipt, download } = useExtensionRelease()
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null)
  const [requestedVersion, setRequestedVersion] = useState<string | null>(null)
  const detailsButton = useRef<HTMLButtonElement>(null)
  const available =
    release.isFetchedAfterMount && !release.isError ? release.data : undefined
  const state = available
    ? extensionReleaseState({
        release: available,
        connections,
        receipt: receipt.data,
        statusFailed,
      })
    : null
  const checked =
    release.isFetchedAfterMount && !release.isFetching && !release.isError
  const automatic =
    checked &&
    receipt.isFetched &&
    !statusLoading &&
    state?.available &&
    dismissedVersion !== available?.version
  const open =
    !!available && (requestedVersion === available.version || !!automatic)
  const busy = download.isPending
  const saved =
    available && download.data?.version === available.version
      ? download.data
      : null
  const language = i18n.resolvedLanguage?.split('-')[0]
  const notes =
    available?.notes[language === 'en' || language === 'pt' ? language : 'es']
  const close = () => {
    if (available) setDismissedVersion(available.version)
    setRequestedVersion(null)
  }
  const startDownload = () => {
    if (!available || busy) return
    setRequestedVersion(available.version)
    download.mutate(available, {
      onSuccess(result) {
        if (!result) return
        setDismissedVersion(result.version)
      },
    })
  }
  return (
    <section
      data-extension-release
      className="space-y-3 rounded-2xl border border-border bg-card p-5"
      aria-labelledby="extension-release-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2
            id="extension-release-title"
            className="font-display text-lg font-bold"
          >
            {t('extension.releaseTitle')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('extension.releaseDescription')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            ref={detailsButton}
            type="button"
            disabled={!available || !native || !checked}
            onClick={() => {
              if (!available) return
              if (open) {
                close()
                return
              }
              setRequestedVersion(available.version)
            }}
          >
            <Download aria-hidden className="h-4 w-4" />
            {t('extension.releaseDownload')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!native || release.isFetching || busy}
            onClick={() => {
              void release.refetch().then((result) => {
                if (result.data && !result.isError)
                  setRequestedVersion(result.data.version)
              })
            }}
          >
            <RefreshCw aria-hidden className="h-4 w-4" />
            {t('extension.releaseCheck')}
          </Button>
        </div>
      </div>
      {!native && (
        <p className="text-sm text-muted-foreground">
          {t('extension.releaseDesktopOnly')}
        </p>
      )}
      {native && release.isFetching && (
        <p role="status" className="text-sm text-muted-foreground">
          {t('extension.releaseChecking')}
        </p>
      )}
      {native && release.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t(extensionReleaseErrorKey(release.error))}
        </p>
      )}
      {checked && available && state && (
        <div className="space-y-1 text-sm">
          <p>{t('extension.releaseLatest', { version: available.version })}</p>
          <p className="text-muted-foreground">{t(state.statusKey)}</p>
          {state.installedVersions.length > 0 && (
            <p className="text-muted-foreground">
              {t('extension.releaseDetected', {
                versions: state.installedVersions.join(', '),
              })}
            </p>
          )}
        </div>
      )}
      {saved && (
        <p role="status" className="break-words text-sm">
          {t('extension.releaseSaved', { path: saved.path })}
        </p>
      )}
      {available && (
        <Dialog
          open={open}
          onOpenChange={(next) => {
            if (!next) close()
          }}
        >
          <DialogContent
            className="max-h-[85vh] overflow-y-auto rounded-2xl"
            onPointerDownOutside={(event) => event.preventDefault()}
            onEscapeKeyDown={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              detailsButton.current?.focus({ preventScroll: true })
            }}
          >
            <DialogHeader>
              <DialogTitle className="pr-6 font-display text-xl font-extrabold">
                {t(
                  state?.available
                    ? 'extension.releaseNewTitle'
                    : 'extension.releaseTitle',
                )}
              </DialogTitle>
              <DialogDescription>
                {t('extension.releaseLatest', { version: available.version })}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <h3 className="font-display text-sm font-bold">
                {t('extension.releaseNotes')}
              </h3>
              <p className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-xl bg-muted/30 p-3 text-sm">
                {notes}
              </p>
            </div>
            <div className="space-y-2 rounded-xl border border-border p-3 text-sm">
              <p className="font-bold">{t('extension.releaseInstallTitle')}</p>
              <ol className="list-decimal space-y-2 pl-5">
                <li>{t('extension.releaseInstallExtract')}</li>
                <li>{t('extension.releaseInstallLoad')}</li>
                <li>{t('extension.releaseInstallUpdate')}</li>
              </ol>
            </div>
            {busy && (
              <p role="status" className="flex items-center gap-2 text-sm">
                <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                {t('extension.releaseDownloading')}
              </p>
            )}
            {download.isError && (
              <p role="alert" className="text-sm text-destructive">
                {t(extensionReleaseErrorKey(download.error))}
              </p>
            )}
            {saved && (
              <p role="status" className="break-words text-sm">
                {t('extension.releaseSaved', { path: saved.path })}
              </p>
            )}
            {saved && !saved.receiptSaved && (
              <p className="text-sm text-muted-foreground">
                {t('extension.releaseReceiptFailed')}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                {t('common.cerrar')}
              </Button>
              <Button
                type="button"
                aria-disabled={busy}
                onClick={startDownload}
              >
                <Download aria-hidden className="h-4 w-4" />
                {t(
                  busy
                    ? 'extension.releaseDownloading'
                    : 'extension.releaseDownloadVersion',
                  { version: available.version },
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </section>
  )
}
