// Genera el PDF desde su fuente HTML local; no carga servicios externos.
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { withChrome } from './chrome-session.mjs'

const chrome =
  process.argv[2] ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const source = resolve('docs/reports/2026-09-12-vimo-bugfix-audit.html')
const output = resolve('docs/reports/2026-09-12-vimo-bugfix-audit.pdf')
const root = await mkdtemp(join(tmpdir(), 'vimo-pdf-'))
try {
  await withChrome(chrome, join(root, 'profile'), async (call) => {
    const { targetId } = await call('Target.createTarget', {
      url: pathToFileURL(source).href,
    })
    const { sessionId } = await call('Target.attachToTarget', {
      targetId,
      flatten: true,
    })
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const loaded = await call(
      'Runtime.evaluate',
      {
        expression:
          'document.readyState === "complete" && document.querySelectorAll("section").length === 6',
        returnByValue: true,
      },
      sessionId,
    )
    if (loaded.result.value !== true)
      throw new Error('Report did not load completely')
    const result = await call(
      'Page.printToPDF',
      {
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate:
          '<div style="width:100%;font-family:Arial;font-size:8px;color:#64748b;padding:0 16mm;display:flex;justify-content:space-between"><span>VIMO · 2026-09-12 · Validación local, sin publicación</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
      },
      sessionId,
    )
    await writeFile(output, Buffer.from(result.data, 'base64'))
    process.stdout.write(output + '\n')
  })
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 3 })
}
