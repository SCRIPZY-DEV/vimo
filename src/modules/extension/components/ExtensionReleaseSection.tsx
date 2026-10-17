import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, FolderOpen, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/modules/common/ui/dialog'
import { ExtensionInstallSteps } from '@/modules/extension/components/ExtensionInstallSteps'
import { useExtensionRelease } from '@/modules/extension/hooks/useExtensionRelease'
import {
  extensionReleaseErrorKey,
  extensionReleaseState,
} from '@/modules/extension/utilities/extensionReleaseState'
import type {
  ExtensionRelease,
  ExtensionReleaseSectionProps,
} from '@/modules/extension/types/release'

export function ExtensionReleaseSection({
  connections,
  statusLoading,
  statusFailed,
}: ExtensionReleaseSectionProps) {
  const { t, i18n } = useTranslation()
  const {
    native,
    release,
    downloadedFile,
    download,
    busy,
    checkUpdates,
    checking,
    openFolder,
    openingFolder,
    openDownloadFolder,
  } = useExtensionRelease()
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null)
  const [requestedVersion, setRequestedVersion] = useState<string | null>(null)
  const [checkedCurrent, setCheckedCurrent] = useState<ExtensionRelease | null>(
    null,
  )
  const detailsButton = useRef<HTMLButtonElement>(null)
  const checkButton = useRef<HTMLButtonElement>(null)
  const section = useRef<HTMLElement>(null)
  const available =
    release.isFetchedAfterMount && !release.isError ? release.data : undefined
  const state = available
    ? extensionReleaseState({
        release: available,
        connections,
        downloadedPath:
          downloadedFile.isFetchedAfterMount &&
          !downloadedFile.isError &&
          !downloadedFile.isFetching
            ? downloadedFile.data
            : null,
        statusFailed: statusFailed || statusLoading,
      })
    : null
  const checked =
    release.isFetchedAfterMount && !release.isFetching && !release.isError
  const automatic =
    checked &&
    downloadedFile.isFetched &&
    !downloadedFile.isFetching &&
    !busy &&
    !checking &&
    !checkUpdates.isError &&
    !statusLoading &&
    state?.available &&
    dismissedVersion !== available?.version
  const open =
    !!available && (requestedVersion === available.version || !!automatic)
  const saved =
    available &&
    state?.downloaded &&
    download.data?.version === available.version &&
    download.variables?.sha256 === available.sha256
      ? download.data
      : null
  const savedPath = state?.downloaded ? downloadedFile.data : null
  const downloadDisabled =
    !available ||
    !native ||
    !checked ||
    statusLoading ||
    downloadedFile.isPending ||
    downloadedFile.isFetching ||
    busy ||
    checking ||
    !!state?.current ||
    !!state?.downloaded
  const actionKey = busy
    ? 'extension.releaseDownloading'
    : (state?.actionKey ?? 'extension.releaseDownload')
  const actionLabel =
    actionKey === 'extension.releaseDownload' && available && checked
      ? t('extension.releaseDownloadVersion', { version: available.version })
      : t(actionKey)
  const currentNotice =
    checked &&
    !checking &&
    checkedCurrent?.version === available?.version &&
    checkedCurrent?.sha256 === available?.sha256 &&
    (state?.current || state?.downloaded)
  const folderError =
    openFolder.isError &&
    openFolder.variables?.version === available?.version &&
    openFolder.variables?.sha256 === available?.sha256
  const showFolder = () => {
    if (!available || !savedPath || busy || checking || openingFolder) return
    openDownloadFolder(available)
  }
  const language = i18n.resolvedLanguage?.split('-')[0]
  const notes =
    available?.notes[language === 'en' || language === 'pt' ? language : 'es']
  const close = () => {
    if (available) setDismissedVersion(available.version)
    setRequestedVersion(null)
  }
  const startDownload = () => {
    if (!available || downloadDisabled) return
    setRequestedVersion(available.version)
    download.mutate(available, {
      onSuccess(result) {
        setDismissedVersion(result.version)
      },
    })
  }
  return (
    <section
      ref={section}
      tabIndex={-1}
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
            disabled={downloadDisabled}
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
            {actionLabel}
          </Button>
          <Button
            ref={checkButton}
            type="button"
            variant="outline"
            disabled={!native || release.isFetching || busy || checking}
            onClick={() => {
              if (checking) return
              setCheckedCurrent(null)
              if (available) setDismissedVersion(available.version)
              checkUpdates.mutate(undefined, {
                onSuccess(result) {
                  setDismissedVersion(result.release.version)
                  setRequestedVersion(
                    result.current ? null : result.release.version,
                  )
                  setCheckedCurrent(result.current ? result.release : null)
                },
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
      {native && (release.isFetching || checking) && (
        <p role="status" className="text-sm text-muted-foreground">
          {t('extension.releaseChecking')}
        </p>
      )}
      {native && release.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t(extensionReleaseErrorKey(release.error))}
        </p>
      )}
      {checkUpdates.isError && !release.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t(extensionReleaseErrorKey(checkUpdates.error))}
        </p>
      )}
      {currentNotice && (
        <p role="status" className="text-sm">
          {t('extension.releaseUpToDate')}
        </p>
      )}
      {folderError && !open && (
        <p role="alert" className="text-sm text-destructive">
          {t('extension.releaseOpenFolderFailed')}
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
      {savedPath && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <p role="status">{t('extension.releaseSaved')}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={openingFolder || checking || busy}
            onClick={showFolder}
          >
            {openingFolder ? (
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
            ) : (
              <FolderOpen aria-hidden className="h-4 w-4" />
            )}
            {t('extension.releaseOpenFolder')}
          </Button>
        </div>
      )}
      {/* El modal se cierra y no vuelve a abrirse para un ZIP ya guardado:
          los pasos quedan a mano en la sección. */}
      {savedPath && (
        <details className="rounded-xl border border-border p-3 text-sm">
          <summary className="cursor-pointer font-bold">
            {t('extension.releaseInstallTitle')}
          </summary>
          <div className="mt-3">
            <ExtensionInstallSteps />
          </div>
        </details>
      )}
      {saved?.cleanupIncomplete && !open && (
        <p role="status" className="text-sm text-muted-foreground">
          {t('extension.releaseCleanupIncomplete')}
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
              const button = detailsButton.current?.disabled
                ? checkButton.current
                : detailsButton.current
              if (button && !button.disabled) {
                button.focus({ preventScroll: true })
                return
              }
              section.current?.focus({ preventScroll: true })
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
              <ExtensionInstallSteps />
            </div>
            {busy && (
              <p role="status" className="flex items-center gap-2 text-sm">
                <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                {t('extension.releaseDownloading')}
              </p>
            )}
            {download.isError &&
              download.variables?.version === available.version && (
                <p role="alert" className="text-sm text-destructive">
                  {t(extensionReleaseErrorKey(download.error))}
                </p>
              )}
            {savedPath && (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <p role="status">{t('extension.releaseSaved')}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={openingFolder || checking || busy}
                  onClick={showFolder}
                >
                  {openingFolder ? (
                    <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                  ) : (
                    <FolderOpen aria-hidden className="h-4 w-4" />
                  )}
                  {t('extension.releaseOpenFolder')}
                </Button>
              </div>
            )}
            {folderError && (
              <p role="alert" className="text-sm text-destructive">
                {t('extension.releaseOpenFolderFailed')}
              </p>
            )}
            {saved?.cleanupIncomplete && (
              <p role="status" className="text-sm text-muted-foreground">
                {t('extension.releaseCleanupIncomplete')}
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
                disabled={downloadDisabled}
                onClick={startDownload}
              >
                <Download aria-hidden className="h-4 w-4" />
                {actionLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </section>
  )
}
