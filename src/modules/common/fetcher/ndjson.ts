// Lectura de una respuesta por partes (NDJSON: un objeto JSON por línea), a
// medida que llega. Puro, sin imports: lo corre
// scripts/test/check-app-vimo-server.mjs con Node.

function parseLine(line: string): unknown {
  const text = line.trim()
  if (!text) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    // Una línea que no es JSON (un proxy que mete texto) se salta.
    return undefined
  }
}

/**
 * Entrega cada línea del cuerpo apenas está completa. `onActivity` avisa cada
 * vez que llega un trozo, aunque no cierre una línea: quien llama mide con eso
 * el silencio del servidor. Una respuesta cortada entrega las líneas que
 * alcanzaron a llegar; decidir si falta la última es de quien conoce el
 * contrato.
 */
export async function readNdjson(
  response: Response,
  onLine: (line: unknown) => void,
  onActivity: () => void = () => {},
): Promise<void> {
  const emit = (line: string) => {
    const parsed = parseLine(line)
    if (parsed !== undefined) onLine(parsed)
  }

  // Sin cuerpo legible por partes (un webview viejo): todo junto al final.
  if (!response.body) {
    for (const line of (await response.text()).split('\n')) emit(line)
    return
  }

  const reader = response.body.getReader()
  // `stream: true`: un carácter de varios bytes puede llegar partido en dos.
  const decoder = new TextDecoder()
  let pending = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    onActivity()
    pending += decoder.decode(value, { stream: true })
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) emit(line)
  }
  emit(pending + decoder.decode())
}
