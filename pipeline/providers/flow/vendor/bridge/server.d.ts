export interface FlowBridgeOptions {
  port?: number
  dataDir: string
  trustedExtensionOrigins?: string[]
  allowExtensionLinkRequests?: boolean
  onEvent?: (event: Record<string, unknown>) => void
}

export interface FlowBridge {
  port: number
  pairingCode: string
  dispatch(command: Record<string, unknown>): Promise<unknown>
  close(): Promise<void>
}

export function createBridge(options: FlowBridgeOptions): Promise<FlowBridge>
