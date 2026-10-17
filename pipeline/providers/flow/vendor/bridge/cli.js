const USAGE = 'node bridge/server.js [--port 43127] --data-dir "RUTA DE DATOS"'
const PATH_HINT =
  'Si la ruta contiene espacios, escribila completa entre comillas dobles. Consultá node bridge/server.js --help.'

export class BridgeArgumentsError extends Error {
  constructor(message, hint = PATH_HINT) {
    super('arguments_invalid')
    this.name = 'BridgeArgumentsError'
    this.details = { code: 'arguments_invalid', message, hint, usage: USAGE }
  }
}

export const BRIDGE_HELP = Object.freeze({
  type: 'bridge.help',
  message:
    'Puente local de Vimo Flow. Ejecutá el comando desde la raíz del proyecto y mantené abierta la terminal.',
  usage: USAGE,
  options: [
    '--data-dir "RUTA": carpeta privada de datos obligatoria; las rutas con espacios deben ir entre comillas.',
    '--port NUMERO: puerto 1024–65535; predeterminado 43127. Usá 0 para elegir un puerto disponible.',
    '--help o -h: muestra esta ayuda sin iniciar el puente; debe usarse solo.',
  ],
  examples: [
    'node bridge/server.js --port 43127 --data-dir "/ruta/privada/Codigo Prueba"',
    'node bridge/server.js --help',
  ],
  output:
    'Eventos NDJSON por stdout; errores bridge.fatal por stderr. El pairingCode es secreto y temporal.',
})

// Validar todo antes de abrir el puerto o crear archivos. Los diagnósticos nunca reflejan argv.
export function parseBridgeArguments(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0]))
    return { help: true }
  if (args.some((argument) => ['--help', '-h'].includes(argument))) {
    throw new BridgeArgumentsError(
      'La ayuda se usa sin otras opciones.',
      'Ejecutá node bridge/server.js --help.',
    )
  }
  const options = { port: 43127, dataDir: null }
  const seen = new Set()
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]
    if (!['--port', '--data-dir'].includes(flag)) {
      const message =
        typeof flag === 'string' && flag.startsWith('-')
          ? 'Opción no reconocida. Se admiten --port y --data-dir.'
          : 'Se recibió un argumento suelto. La ruta de datos pudo quedar dividida por espacios.'
      throw new BridgeArgumentsError(message)
    }
    if (seen.has(flag))
      throw new BridgeArgumentsError(
        `La opción ${flag} está repetida. Usala una sola vez.`,
      )
    seen.add(flag)
    const value = args[index + 1]
    if (typeof value !== 'string' || !value.trim() || value.startsWith('--')) {
      throw new BridgeArgumentsError(`Falta el valor de ${flag}.`)
    }
    if (flag === '--port') {
      const port = /^\d+$/.test(value) ? Number(value) : NaN
      if (
        !Number.isInteger(port) ||
        (port !== 0 && port < 1024) ||
        port > 65535
      ) {
        throw new BridgeArgumentsError(
          'El puerto debe ser un entero entre 1024 y 65535, o 0.',
          'Ejemplo: --port 43127. Consultá node bridge/server.js --help.',
        )
      }
      options.port = port
    } else {
      if (value.includes('\0'))
        throw new BridgeArgumentsError(
          'La ruta de datos contiene un carácter no permitido.',
        )
      options.dataDir = value
    }
  }
  if (options.dataDir === null)
    throw new BridgeArgumentsError(
      'Falta la opción obligatoria --data-dir con su carpeta de datos.',
    )
  return options
}
