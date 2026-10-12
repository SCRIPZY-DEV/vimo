import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { PlugZap, RefreshCw } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { usePageTitle } from '@/modules/common/hooks/usePageTitle'
import { useFlowCapacity } from '@/modules/common/hooks/useFlowCapacity'
import { useFlowRefresh } from '@/modules/common/hooks/useFlowRefresh'
import { FLOW_TOOLS_EXECUTION_PLAN } from '@/modules/common/constants'
import { FlowGenerationControls } from '@/modules/common/components/FlowGenerationControls'
import { FlowRecoveryPanel } from '@/modules/extension/components/FlowRecoveryPanel'
import { FlowManualPairing } from '@/modules/extension/components/FlowManualPairing'
import { FlowSetupAccounts } from '@/modules/extension/components/FlowSetupAccounts'
import { FlowSetupGuide } from '@/modules/extension/components/FlowSetupGuide'
import { FlowDiscoverySection } from '@/modules/extension/components/FlowDiscoverySection'
import { useFlowAccounts } from '@/modules/extension/hooks/useFlowAccounts'
import {
  flowSetupState,
  flowSetupQueueState,
} from '@/modules/extension/utilities/flowSetupState'
import { VideosRoutes } from '@/modules/videos/constants'

export function Extension() {
  const { t } = useTranslation()
  usePageTitle(t('extension.pageTitle'))
  const navigate = useNavigate()
  const flow = useFlowAccounts()
  const capacity = useFlowCapacity(1, flow.native, {
    executionPlan: FLOW_TOOLS_EXECUTION_PLAN,
  })
  const refresh = useFlowRefresh()
  const guide = useRef<HTMLDetailsElement>(null)
  const discovery = useRef<HTMLDetailsElement>(null)
  const queue = useRef<HTMLDetailsElement>(null)
  const accounts = useRef<HTMLElement>(null)
  const setup = flowSetupState({
    native: flow.native,
    loading: capacity.isLoading || refresh.refreshing,
    failed: capacity.isError || flow.isError || !!refresh.errorKey,
    status: flow.status,
    capacity: capacity.capacity,
  })
  const busy =
    flow.link.isPending ||
    flow.revoke.isPending ||
    flow.pause.isPending ||
    flow.pause.isBlocked
  const actionFailed =
    flow.link.isError || flow.revoke.isError || flow.pause.isError
  const connections =
    flow.status?.connections.filter((connection) => !connection.revoked) ?? []
  const { unknown, hasCurrentWork } = flowSetupQueueState(flow.status)
  const paused = !!flow.status?.paused || !!flow.status?.manualPaused
  const act = () => {
    if (busy || refresh.refreshing || !flow.native) return
    if (setup.action === 'refresh') {
      refresh.refresh()
      return
    }
    if (setup.action === 'create') {
      navigate(VideosRoutes.create)
      return
    }
    if (setup.action === 'review') {
      accounts.current?.focus()
      accounts.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      return
    }
    const section =
      setup.action === 'link'
        ? discovery.current
        : paused
          ? queue.current
          : guide.current
    if (!section) return
    section.open = true
    section.querySelector('summary')?.focus()
    section.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }
  const errorKey =
    actionFailed || flow.isError ? flow.errorKey : capacity.errorKey
  return (
    <div className="mx-auto max-w-5xl space-y-5 px-8 py-10">
      <header className="flex items-center gap-3">
        <PlugZap className="h-9 w-9 shrink-0 text-ocean" aria-hidden="true" />
        <div>
          <h1 className="font-display text-3xl font-extrabold">
            {t('extension.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('extension.setupDescription')}
          </p>
        </div>
      </header>
      <section
        className="space-y-4 rounded-2xl border-2 border-ocean/20 bg-ocean/5 p-5"
        aria-label={t('extension.accountsTitle')}
      >
        <div className="space-y-1">
          <p className="font-display text-lg font-bold">
            {t('extension.setupPreparedCount', {
              prepared: setup.prepared ?? '—',
              minimum: setup.minimum,
            })}
          </p>
          <p className="text-sm">
            {t('extension.setupCounts', {
              linked: setup.linked ?? '—',
              available: setup.available ?? '—',
            })}
          </p>
          <p className="text-sm">
            {t('extension.setupMinimum', { minimum: setup.minimum })}
          </p>
          {setup.limited > 0 && (
            <p className="text-sm">
              {t('extension.setupLimited', { count: setup.limited })}
            </p>
          )}
        </div>
        <p role="status" className="text-sm">
          {t(setup.messageKey)}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={
              !flow.native || capacity.isLoading || busy || refresh.refreshing
            }
            onClick={act}
          >
            {t(
              refresh.refreshing
                ? 'extension.refreshing'
                : setup.action === 'guide' && paused
                  ? 'extension.setupAction_pause'
                  : `extension.setupAction_${setup.action}`,
            )}
          </Button>
          {setup.action !== 'refresh' && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy || refresh.refreshing || !flow.native}
              onClick={refresh.refresh}
            >
              <RefreshCw aria-hidden="true" className="mr-2 h-4 w-4" />
              {t('extension.refresh')}
            </Button>
          )}
        </div>
        {refresh.result && !refresh.refreshing && !refresh.errorKey && (
          <p role="status" className="text-xs text-muted-foreground">
            {t('extension.setupRefreshDone')}
          </p>
        )}
        {(refresh.errorKey || errorKey) && (
          <p role="alert" className="text-sm text-destructive">
            {t(refresh.errorKey ?? errorKey ?? 'extension.actionFailed')}
          </p>
        )}
      </section>
      <FlowSetupAccounts
        sectionRef={accounts}
        connections={connections}
        status={flow.status}
        capacity={capacity.capacity}
        confirmed={setup.confirmed}
        busy={busy}
        onRevoke={(id) => flow.revoke.mutate(id)}
      />
      <FlowSetupGuide detailsRef={guide} />
      <FlowDiscoverySection
        detailsRef={discovery}
        profiles={flow.profiles}
        loading={flow.discoveryLoading}
        failed={flow.discoveryError}
        status={flow.status}
        busy={busy}
        onLink={(id) => flow.link.mutate(id)}
      />
      {flow.native && (
        <details
          ref={queue}
          className="rounded-2xl border border-border bg-card p-5"
        >
          <summary className="cursor-pointer font-display font-bold">
            {t(
              paused
                ? 'extension.setupPaused'
                : 'extension.generationControlsTitle',
            )}
          </summary>
          <div className="mt-4">
            {hasCurrentWork || paused ? (
              <FlowGenerationControls
                disabled={flow.link.isPending || flow.revoke.isPending}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {t(
                  flow.isError
                    ? 'extension.generationStatusStale'
                    : 'extension.setupNoActiveWork',
                )}
              </p>
            )}
          </div>
        </details>
      )}
      {flow.native && (
        <details className="rounded-2xl border border-border bg-card p-5">
          <summary className="cursor-pointer font-display font-bold">
            {t(
              unknown > 0
                ? 'extension.setupHistoryAttention'
                : 'extension.galleryTitle',
              { count: unknown },
            )}
          </summary>
          <div className="mt-4">
            <FlowRecoveryPanel />
          </div>
        </details>
      )}
      {flow.native && <FlowManualPairing />}
    </div>
  )
}
