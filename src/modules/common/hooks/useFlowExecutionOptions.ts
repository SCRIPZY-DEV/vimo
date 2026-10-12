import { FLOW_TOOLS_EXECUTION_PLAN } from '@/modules/common/constants'
import { useFlowStatus } from '@/modules/common/hooks/useFlowStatus'
import { supportsFlowToolsCoordinator } from '@/modules/common/utilities/flowExecutionPlan'

// Acredita preparación del ejecutor; la admisión del lote sigue en capacity.
export function useFlowExecutionOptions() {
  const flow = useFlowStatus()
  const supported = supportsFlowToolsCoordinator(
    flow.status?.capabilities?.flowTools,
  )
  const readyProfiles =
    flow.status?.connections.filter((connection) => {
      const tools = connection.flowTools
      return (
        connection.connected &&
        !connection.revoked &&
        tools?.version === FLOW_TOOLS_EXECUTION_PLAN.version &&
        tools.toolId === FLOW_TOOLS_EXECUTION_PLAN.toolId &&
        tools.seedSupported === false &&
        tools.ready === true
      )
    }).length ?? 0
  const toolsAvailable =
    flow.native &&
    !flow.isError &&
    supported &&
    readyProfiles >= flow.minimumProfiles
  const helpKey = () => {
    if (!flow.native) return 'extension.helpDesktop'
    if (flow.isLoading || (!flow.status && !flow.isError))
      return 'extension.helpChecking'
    if (flow.isError) return flow.errorKey
    if (!supported) return 'extension.executionUpgradeRequired'
    if (!toolsAvailable) return 'extension.executionPrepareTools'
    return null
  }
  return {
    toolsAvailable,
    readyProfiles,
    minimumProfiles: flow.minimumProfiles,
    helpKey: helpKey(),
  }
}
