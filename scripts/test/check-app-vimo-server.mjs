// Cliente de vimo.click (ADR-0006, enmienda 2026-09-30). Primero la
// clasificación de fallos como módulo puro (Node con type stripping); después
// el cliente real, empaquetado con esbuild con la sesión de Supabase y la URL
// base simuladas, contra un servidor HTTP local. Sin red real ni claves.
// Node rechaza un fetch abortado con la razón de la señal (TimeoutError) y
// WebKit (Tauri en macOS y Linux) con un AbortError: los casos «en WebKit»
// emulan ese segundo comportamiento.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { readNdjson } from '../../src/modules/common/fetcher/ndjson.ts'
import {
  VimoServerError,
  readJsonBody,
  toVimoServerError,
  vimoServerErrorCode,
  vimoServerErrorFromResponse,
  vimoServerHeaders,
  vimoServerRetryAt,
} from '../../src/modules/common/fetcher/vimoServerError.ts'

test('un error del servidor trae status, code y retryAfterSeconds', () => {
  const error = vimoServerErrorFromResponse(
    429,
    { code: 'cupo-agotado', retryAfterSeconds: 3600 },
    1000,
  )
  assert.equal(error.kind, 'http')
  assert.equal(error.status, 429)
  assert.equal(error.code, 'cupo-agotado')
  assert.equal(error.retryAfterSeconds, 3600)
  assert.equal(error.receivedAt, 1000)
})

test('un cuerpo sin code, vacío o que no es objeto no inventa uno', () => {
  for (const body of [
    undefined,
    null,
    'texto',
    {},
    { code: '' },
    { code: 7 },
  ]) {
    const error = vimoServerErrorFromResponse(502, body, 0)
    assert.equal(error.kind, 'http')
    assert.equal(error.status, 502)
    assert.equal(error.code, null)
  }
})

test('un retryAfterSeconds que no es un número válido se ignora', () => {
  for (const retryAfterSeconds of ['3600', -1, Number.NaN, null]) {
    const body = { code: 'cupo-agotado', retryAfterSeconds }
    const error = vimoServerErrorFromResponse(429, body, 0)
    assert.equal(error.retryAfterSeconds, null)
  }
})

test('lo que tira fetch: el tiempo agotado es timeout; el resto, network', () => {
  const timeout = new DOMException('lento', 'TimeoutError')
  assert.equal(toVimoServerError(timeout).kind, 'timeout')
  assert.equal(toVimoServerError(new TypeError('fetch failed')).kind, 'network')
  assert.equal(toVimoServerError('raro').kind, 'network')
  const http = new VimoServerError('http', { status: 403, code: 'sin-acceso' })
  assert.equal(toVimoServerError(http), http)
})

test('código estable para i18n', () => {
  assert.equal(vimoServerErrorCode(new VimoServerError('network')), 'network')
  assert.equal(vimoServerErrorCode(new VimoServerError('timeout')), 'timeout')
  const modelTimeout = new VimoServerError('http', {
    status: 504,
    code: 'modelo-timeout',
  })
  assert.equal(vimoServerErrorCode(modelTimeout), 'modelo-timeout')
  const withoutCode = new VimoServerError('http', { status: 500 })
  assert.equal(vimoServerErrorCode(withoutCode), null)
  assert.equal(vimoServerErrorCode(new Error('otro')), null)
})

test('cuándo vuelve el cupo: desde que llegó la respuesta', () => {
  const receivedAt = Date.UTC(2026, 8, 30, 12, 0, 0)
  const body = { code: 'cupo-agotado', retryAfterSeconds: 60 }
  const error = vimoServerErrorFromResponse(429, body, receivedAt)
  assert.equal(vimoServerRetryAt(error), '2026-09-30T12:01:00.000Z')
  const withoutRetry = new VimoServerError('http', {
    status: 429,
    code: 'cupo-agotado',
  })
  assert.equal(vimoServerRetryAt(withoutRetry), null)
  assert.equal(vimoServerRetryAt(new Error('otro')), null)
})

test('cuándo vuelve el cupo: una espera que no es una fecha es null y no lanza', () => {
  // Un número finito y positivo pasa la validación del cuerpo, pero la fecha
  // resultante puede salirse del rango de Date y toISOString lanzaría
  // RangeError. Se pide al renderizar el error: no puede romper el modal.
  const receivedAt = Date.UTC(2026, 8, 30, 12, 0, 0)
  const retryAt = (retryAfterSeconds) =>
    vimoServerRetryAt(
      vimoServerErrorFromResponse(
        429,
        { code: 'cupo-agotado', retryAfterSeconds },
        receivedAt,
      ),
    )
  assert.equal(retryAt(1e13), null)
  assert.equal(retryAt(Number.MAX_VALUE), null)
  // Lo que Date sí representa no cambia: el último segundo da su fecha.
  assert.equal(retryAt(8_638_209_230_400), '+275760-09-13T00:00:00.000Z')
  assert.equal(retryAt(8_638_209_230_401), null)
})

test('encabezados: el Bearer viaja solo con sesión', () => {
  assert.deepEqual(vimoServerHeaders('abc'), {
    'Content-Type': 'application/json',
    Authorization: 'Bearer abc',
  })
  assert.deepEqual(vimoServerHeaders(null), {
    'Content-Type': 'application/json',
  })
})

test('cuerpo: JSON, o undefined si no lo es', async () => {
  assert.deepEqual(await readJsonBody(new Response('{"a":1}')), { a: 1 })
  assert.equal(await readJsonBody(new Response('<html>')), undefined)
  assert.equal(await readJsonBody(new Response('')), undefined)
})

// ── El cliente real, empaquetado, contra un servidor local ──

let server
let client
let workdir
const requests = []

function reply(response, status, body, contentType = 'application/json') {
  response.writeHead(status, { 'Content-Type': contentType })
  response.end(body)
}

function handle(request, response, raw) {
  requests.push({ headers: request.headers, method: request.method, raw })
  if (request.url === '/ok')
    return reply(response, 200, JSON.stringify({ echo: JSON.parse(raw) }))
  if (request.url === '/quota') {
    const body = { code: 'cupo-agotado', retryAfterSeconds: 3600 }
    return reply(response, 429, JSON.stringify(body))
  }
  if (request.url === '/html')
    return reply(response, 502, '<html>bad gateway</html>', 'text/html')
  if (request.url === '/not-json')
    return reply(response, 200, 'hola', 'text/plain')
  if (request.url === '/slow') {
    setTimeout(() => reply(response, 200, '{}'), 2000)
    return
  }
  if (request.url === '/slow-body') {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.write('{"echo":')
    setTimeout(() => response.end('1}'), 2000)
    return
  }
  if (request.url === '/stream-ok') {
    response.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
    response.write('{"tipo":"inicio"}\n')
    setTimeout(() => response.write('{"tipo":"latido"}\n'), 80)
    setTimeout(
      () =>
        response.end(
          JSON.stringify({ tipo: 'resultado', echo: JSON.parse(raw) }) + '\n',
        ),
      160,
    )
    return
  }
  if (request.url === '/stream-silent') {
    response.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
    response.write('{"tipo":"inicio"}\n')
    setTimeout(() => response.end('{"tipo":"resultado"}\n'), 2000)
    return
  }
  if (request.url === '/stream-cut') {
    response.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
    response.write('{"tipo":"inicio"}\n')
    setTimeout(() => response.end('{"tipo":"latido"}\n'), 50)
    return
  }
  if (request.url === '/stream-off')
    return reply(response, 403, JSON.stringify({ code: 'funcion-desactivada' }))
  reply(response, 404, '{}')
}

function useSession(accessToken) {
  globalThis.vimoServerSession = async () => ({
    data: { session: accessToken ? { access_token: accessToken } : null },
  })
}

before(async () => {
  server = createServer((request, response) => {
    let raw = ''
    request.on('data', (chunk) => {
      raw += chunk
    })
    request.on('end', () => handle(request, response, raw))
  })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const baseUrl = `http://127.0.0.1:${server.address().port}`
  // La URL base y la sesión se reemplazan; el resto es el código real.
  const fixtures = {
    '@/modules/common/constants': `export const VIMO_SERVER_BASE_URL = ${JSON.stringify(baseUrl)}; export const VIMO_SERVER_TIMEOUT_MS = 1000`,
    '@/modules/common/supabase/client':
      'export const supabase = { auth: { getSession: () => globalThis.vimoServerSession() } }',
  }
  const output = await build({
    entryPoints: [resolve('src/modules/common/fetcher/vimoServer.ts')],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    tsconfig: 'tsconfig.app.json',
    plugins: [
      {
        name: 'fixtures',
        setup(plugin) {
          plugin.onResolve({ filter: /^@\// }, (args) =>
            fixtures[args.path]
              ? { path: args.path, namespace: 'fixture' }
              : undefined,
          )
          plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
            contents: fixtures[args.path],
            loader: 'js',
          }))
        },
      },
    ],
  })
  workdir = await mkdtemp(join(tmpdir(), 'vimo-server-guard-'))
  const file = join(workdir, 'vimo-server.mjs')
  await writeFile(file, output.outputFiles[0].contents)
  client = await import(pathToFileURL(file).href)
})

after(async () => {
  await rm(workdir, { recursive: true, force: true })
})

// El bundle trae su propia copia de la clase: se mira el nombre, no instanceof.
function isFailure(kind, check = () => {}) {
  return (error) => {
    assert.equal(error.name, 'VimoServerError')
    assert.equal(error.kind, kind)
    check(error)
    return true
  }
}

test('cliente: POST con el Bearer de la sesión y el cuerpo en JSON', async () => {
  useSession('token-1')
  const result = await client.vimoServerFetch('/ok', { body: { text: 'hola' } })
  assert.deepEqual(result, { echo: { text: 'hola' } })
  const last = requests.at(-1)
  assert.equal(last.method, 'POST')
  assert.equal(last.headers.authorization, 'Bearer token-1')
  assert.equal(last.headers['content-type'], 'application/json')
})

test('cliente: sin sesión el pedido viaja sin Authorization', async () => {
  useSession(null)
  await client.vimoServerFetch('/ok', { body: {} })
  assert.equal(requests.at(-1).headers.authorization, undefined)
})

test('cliente: un 429 del servidor es http con code y retryAfterSeconds', async () => {
  useSession('token-1')
  await assert.rejects(
    client.vimoServerFetch('/quota', { body: {} }),
    isFailure('http', (error) => {
      assert.equal(error.status, 429)
      assert.equal(error.code, 'cupo-agotado')
      assert.equal(error.retryAfterSeconds, 3600)
      assert.equal(typeof error.receivedAt, 'number')
    }),
  )
})

test('cliente: un 502 con HTML es http sin code', async () => {
  useSession('token-1')
  await assert.rejects(
    client.vimoServerFetch('/html', { body: {} }),
    isFailure('http', (error) => {
      assert.equal(error.status, 502)
      assert.equal(error.code, null)
    }),
  )
})

test('cliente: un 200 que no es JSON es http sin code', async () => {
  useSession('token-1')
  await assert.rejects(
    client.vimoServerFetch('/not-json', { body: {} }),
    isFailure('http', (error) => assert.equal(error.status, 200)),
  )
})

test('cliente: sin respuesta a tiempo es timeout', async () => {
  useSession('token-1')
  await assert.rejects(
    client.vimoServerFetch('/slow', { body: {}, timeoutMs: 150 }),
    isFailure('timeout'),
  )
})

test('cliente: un cuerpo que no termina de llegar es timeout', async () => {
  useSession('token-1')
  await assert.rejects(
    client.vimoServerFetch('/slow-body', { body: {}, timeoutMs: 200 }),
    isFailure('timeout'),
  )
})

test('cliente: una sesión que no responde es timeout', async () => {
  globalThis.vimoServerSession = () => new Promise(() => {})
  await assert.rejects(
    client.vimoServerFetch('/ok', { body: {}, timeoutMs: 100 }),
    isFailure('timeout'),
  )
})

// ── WebKit ──
// WKWebView (macOS) y WebKitGTK no rechazan un fetch abortado con la razón de
// la señal (TimeoutError) sino con un AbortError fijo, tanto mientras esperan
// la respuesta como mientras leen el cuerpo. Node sí usa la razón: se emula
// envolviendo fetch. Así queda fijado que el tiempo agotado lo decide la señal
// del pedido y no el nombre del error.
function abortError() {
  return new DOMException('Fetch is aborted', 'AbortError')
}

function webKitFetch(realFetch) {
  return async (input, init) => {
    let response
    try {
      response = await realFetch(input, init)
    } catch (error) {
      if (init.signal.aborted) throw abortError()
      throw error
    }
    const readJson = response.json.bind(response)
    response.json = async () => {
      try {
        return await readJson()
      } catch (error) {
        if (init.signal.aborted) throw abortError()
        throw error
      }
    }
    return response
  }
}

async function withFetch(replacement, run) {
  const realFetch = globalThis.fetch
  globalThis.fetch = replacement
  try {
    await run()
  } finally {
    globalThis.fetch = realFetch
  }
}

test('cliente en WebKit: sin respuesta a tiempo (AbortError) es timeout', async () => {
  useSession('token-1')
  await withFetch(webKitFetch(globalThis.fetch), () =>
    assert.rejects(
      client.vimoServerFetch('/slow', { body: {}, timeoutMs: 150 }),
      isFailure('timeout'),
    ),
  )
})

test('cliente en WebKit: un cuerpo que no termina de llegar (AbortError) es timeout', async () => {
  useSession('token-1')
  await withFetch(webKitFetch(globalThis.fetch), () =>
    assert.rejects(
      client.vimoServerFetch('/slow-body', { body: {}, timeoutMs: 200 }),
      isFailure('timeout'),
    ),
  )
})

test('cliente en WebKit: sin abortar, un 429 sigue siendo http con su code', async () => {
  useSession('token-1')
  await withFetch(webKitFetch(globalThis.fetch), () =>
    assert.rejects(
      client.vimoServerFetch('/quota', { body: {} }),
      isFailure('http', (error) => assert.equal(error.code, 'cupo-agotado')),
    ),
  )
})

test('cliente: un AbortError con la señal sin abortar no es timeout', async () => {
  useSession('token-1')
  const rejectsWithAbortError = async () => {
    throw abortError()
  }
  await withFetch(rejectsWithAbortError, () =>
    assert.rejects(
      client.vimoServerFetch('/ok', { body: {} }),
      isFailure('network'),
    ),
  )
})

// Último: apaga el servidor local.
// ── El cliente de respuestas por partes ──

const STREAM = { timeoutMs: 1500, idleTimeoutMs: 400 }

test('flujo: las líneas llegan a medida que el servidor las escribe', async () => {
  useSession('token-1')
  const seen = []
  const lines = await client.vimoServerStream(
    '/stream-ok',
    { ...STREAM, body: { accion: 'analizar' } },
    (line) => seen.push({ line, at: Date.now() }),
  )
  assert.deepEqual(lines, [
    { tipo: 'inicio' },
    { tipo: 'latido' },
    { tipo: 'resultado', echo: { accion: 'analizar' } },
  ])
  assert.deepEqual(
    seen.map((entry) => entry.line),
    lines,
  )
  // No llegaron todas juntas al final: entre la primera y la última pasó tiempo.
  assert.ok(seen[2].at - seen[0].at >= 100)
  assert.equal(requests.at(-1).headers.authorization, 'Bearer token-1')
})

test('flujo: un error anterior a la primera línea es http con su code', async () => {
  useSession('token-1')
  await assert.rejects(
    client.vimoServerStream('/stream-off', { ...STREAM, body: {} }),
    isFailure('http', (error) => {
      assert.equal(error.status, 403)
      assert.equal(error.code, 'funcion-desactivada')
    }),
  )
})

test('flujo: el silencio después de empezar es timeout, sin esperar el tope entero', async () => {
  useSession('token-1')
  const startedAt = Date.now()
  await assert.rejects(
    client.vimoServerStream('/stream-silent', { ...STREAM, body: {} }),
    isFailure('timeout'),
  )
  assert.ok(Date.now() - startedAt < 1200)
})

test('flujo: sin respuesta a tiempo es timeout', async () => {
  useSession('token-1')
  await assert.rejects(
    client.vimoServerStream('/slow', {
      timeoutMs: 300,
      idleTimeoutMs: 5000,
      body: {},
    }),
    isFailure('timeout'),
  )
})

test('flujo: una respuesta cortada entrega las líneas que llegaron', async () => {
  useSession('token-1')
  const lines = await client.vimoServerStream('/stream-cut', {
    ...STREAM,
    body: {},
  })
  assert.deepEqual(lines, [{ tipo: 'inicio' }, { tipo: 'latido' }])
})

test('cliente: con el servidor caído es network', async () => {
  useSession('token-1')
  await new Promise((done) => {
    server.close(done)
    server.closeAllConnections()
  })
  await assert.rejects(
    client.vimoServerFetch('/ok', { body: {} }),
    isFailure('network'),
  )
})

// ── Respuestas por partes (NDJSON) ──
// El creador de estilo con IA responde un objeto JSON por línea mientras el
// modelo trabaja (ADR-0050): la app las lee a medida que llegan.

function chunked(pieces) {
  const encoder = new TextEncoder()
  const bytes = pieces.map((piece) =>
    typeof piece === 'string' ? encoder.encode(piece) : piece,
  )
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of bytes) controller.enqueue(chunk)
        controller.close()
      },
    }),
  )
}
async function linesOf(response) {
  const lines = []
  await readNdjson(response, (line) => lines.push(line))
  return lines
}

test('ndjson: una línea por objeto, aunque llegue partida entre dos trozos', async () => {
  const lines = await linesOf(
    chunked([
      '{"tipo":"ini',
      'cio"}\n{"tipo":"latido"}\n',
      '{"tipo":"resultado","n":1}\n',
    ]),
  )
  assert.deepEqual(lines, [
    { tipo: 'inicio' },
    { tipo: 'latido' },
    { tipo: 'resultado', n: 1 },
  ])
})

test('ndjson: la última línea vale aunque no cierre con salto', async () => {
  assert.deepEqual(await linesOf(chunked(['{"a":1}\n{"b":2}'])), [
    { a: 1 },
    { b: 2 },
  ])
})

test('ndjson: las líneas vacías y las que no son JSON se saltan', async () => {
  assert.deepEqual(
    await linesOf(
      chunked(['\n\n{"a":1}\r\n', 'no es json\n', '   \n{"b":2}\n']),
    ),
    [{ a: 1 }, { b: 2 }],
  )
})

test('ndjson: una letra con tilde partida entre dos trozos se lee entera', async () => {
  const bytes = new TextEncoder().encode('{"texto":"PERSONAJE: SÍ"}\n')
  const cut = bytes.indexOf(0xc3) + 1
  const lines = await linesOf(chunked([bytes.slice(0, cut), bytes.slice(cut)]))
  assert.deepEqual(lines, [{ texto: 'PERSONAJE: SÍ' }])
})

test('ndjson: avisa cada vez que llega un trozo, para medir el silencio', async () => {
  let activity = 0
  await readNdjson(
    chunked([
      '{"tipo":"inicio"}\n',
      '{"tipo":"latido"}\n',
      '{"tipo":"latido"}\n',
    ]),
    () => {},
    () => {
      activity += 1
    },
  )
  assert.equal(activity, 3)
})

test('ndjson: una respuesta sin cuerpo no trae líneas', async () => {
  assert.deepEqual(await linesOf(new Response(null)), [])
})
