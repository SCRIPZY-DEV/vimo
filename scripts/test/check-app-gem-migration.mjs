// Gemas viejas a la plantilla (spec §4.4): una sola migración en vuelo por
// gema, una vez por sesión, sin repetirse sola después de un fallo; el texto
// que va al agente (con los planos de la gema); el guardado con ese texto de
// respaldo; y el snapshot de Crear que se refresca cuando la gema elegida ya se
// migró. Se migra lo guardado en ese momento, y una gema borrada mientras el
// agente trabaja no se vuelve a crear. Como la migración se guarda sin que la
// persona vea las secciones, la que sale bien queda «migrada» con los avisos
// del agente hasta que se descarta, y el borrador del modal trae el respaldo
// para mostrarlo. En la demo la galería no manda ninguna gema a migrar sola
// (sus gemas son las del pack y la demo no llama al agente). Módulos puros de
// src/ corridos con Node (type stripping), con el agente y el guardado
// simulados.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createGemMigrations,
  migratesGemsOnUse,
  migrateStoredGem,
  showsGalleryNotice,
} from '../../src/modules/videos/utilities/gemMigrations.ts'
import {
  GEM_REBUILD_TEXT_LIMIT,
  migrationRebuildText,
  migrationStyleSavePayload,
  pastedGemSavePayload,
} from '../../src/modules/videos/utilities/gemTemplate.ts'
import {
  customStyleDraftFrom,
  refreshedCustomStyle,
  selectedCustomStyleFrom,
} from '../../src/modules/videos/utilities/selectedCustomStyle.ts'

const OLD_GEM = {
  id: 'st-vieja',
  name: 'Vieja',
  systemPrompt: '  Acuarela editorial con tinta suelta. Escribí en español.  ',
  shots: ['Wide shot'],
  character: { mode: 'none' },
  createdAt: '2026-09-01T00:00:00.000Z',
  samples: [],
}

const MIGRATED_GEM = {
  ...OLD_GEM,
  systemPrompt: undefined,
  shots: [],
  sections: { visualStyle: 'Acuarela editorial con tinta suelta.' },
  templateVersion: 1,
  sourcePrompt: 'Acuarela editorial con tinta suelta. Escribí en español.',
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

// Un migrate simulado que se resuelve a mano, cuántas veces se llamó, con
// qué origin (el que queda en gem_rebuild_logs) y el `report` con el que avisa
// el paso.
function fakeMigrate() {
  const calls = []
  return {
    calls,
    migrate(style, origin, report) {
      const call = deferred()
      calls.push({ style, origin, report, ...call })
      return call.promise
    },
  }
}

const settle = () => new Promise((done) => setTimeout(done, 0))

const WARNINGS = ['Se quitó el pedido de escribir en español.']
const MIGRATED = { status: 'migrated', warnings: WARNINGS }
// Reloj fijo: lo que la tarjeta usa para estimar el porcentaje.
const NOW = 1_700_000_000_000
const clock = () => NOW
const PENDING = {
  status: 'pending',
  name: 'Vieja',
  startedAt: NOW,
  phase: 'agent',
}

test('una gema vieja se manda una sola vez aunque se pida dos veces', () => {
  const agent = fakeMigrate()
  const migrations = createGemMigrations(agent.migrate, clock)
  migrations.migrateOnce(OLD_GEM)
  migrations.migrateOnce(OLD_GEM)
  migrations.retry(OLD_GEM)
  assert.equal(agent.calls.length, 1)
  assert.deepEqual(migrations.getSnapshot().get('st-vieja'), PENDING)
})

test('en vuelo arranca con el agente y, cuando este responde, pasa a guardar; el arranque no cambia', async () => {
  const agent = fakeMigrate()
  const migrations = createGemMigrations(agent.migrate, clock)
  migrations.migrateOnce(OLD_GEM)
  let notified = 0
  migrations.subscribe(() => {
    notified += 1
  })
  agent.calls[0].report('saving')
  assert.deepEqual(migrations.getSnapshot().get('st-vieja'), {
    ...PENDING,
    phase: 'saving',
  })
  assert.equal(notified, 1)
  agent.calls[0].resolve(MIGRATED)
  await settle()
  assert.equal(migrations.getSnapshot().get('st-vieja')?.status, 'migrated')
})

test('un aviso de paso que llega con la migración ya terminada o fallida no cambia nada', async () => {
  const agent = fakeMigrate()
  const migrations = createGemMigrations(agent.migrate, clock)
  migrations.migrateOnce(OLD_GEM)
  agent.calls[0].reject(new Error('sin red'))
  await settle()
  let notified = 0
  migrations.subscribe(() => {
    notified += 1
  })
  agent.calls[0].report('saving')
  assert.equal(migrations.getSnapshot().get('st-vieja')?.status, 'failed')
  assert.equal(notified, 0)
})

test('al salir bien el aviso pasa a «migrada» con los avisos del agente y no se repite aunque la lista siga vieja', async () => {
  const agent = fakeMigrate()
  const migrations = createGemMigrations(agent.migrate)
  migrations.migrateOnce(OLD_GEM)
  agent.calls[0].resolve(MIGRATED)
  await settle()
  assert.deepEqual(migrations.getSnapshot().get('st-vieja'), {
    status: 'migrated',
    name: 'Vieja',
    warnings: WARNINGS,
  })
  migrations.migrateOnce(OLD_GEM)
  migrations.retry(OLD_GEM)
  assert.equal(agent.calls.length, 1)
})

test('migrada sin avisos del agente: el aviso queda igual, para revisar las secciones', async () => {
  const agent = fakeMigrate()
  const migrations = createGemMigrations(agent.migrate)
  migrations.migrateOnce(OLD_GEM)
  agent.calls[0].resolve({ status: 'migrated', warnings: [] })
  await settle()
  assert.deepEqual(migrations.getSnapshot().get('st-vieja'), {
    status: 'migrated',
    name: 'Vieja',
    warnings: [],
  })
})

test('descartar el aviso de una migrada lo borra y avisa; la gema no se vuelve a migrar', async () => {
  const agent = fakeMigrate()
  const migrations = createGemMigrations(agent.migrate)
  migrations.migrateOnce(OLD_GEM)
  agent.calls[0].resolve(MIGRATED)
  await settle()
  let notified = 0
  migrations.subscribe(() => {
    notified += 1
  })
  migrations.dismiss('st-vieja')
  assert.equal(migrations.getSnapshot().has('st-vieja'), false)
  assert.equal(notified, 1)
  // Descartar otra vez (o una gema sin aviso) no cambia nada ni avisa.
  migrations.dismiss('st-vieja')
  migrations.dismiss('st-otra')
  assert.equal(notified, 1)
  // La lista todavía puede mostrarla vieja: ni el agente ni el aviso vuelven.
  migrations.migrateOnce(OLD_GEM)
  migrations.retry(OLD_GEM)
  assert.equal(agent.calls.length, 1)
  assert.equal(migrations.getSnapshot().size, 0)
})

test('descartar no toca una migración en vuelo ni una fallida', async () => {
  const agent = fakeMigrate()
  const migrations = createGemMigrations(agent.migrate)
  migrations.migrateOnce(OLD_GEM)
  migrations.dismiss('st-vieja')
  assert.equal(migrations.getSnapshot().get('st-vieja')?.status, 'pending')
  agent.calls[0].reject(new Error('sin red'))
  await settle()
  migrations.dismiss('st-vieja')
  assert.equal(migrations.getSnapshot().get('st-vieja')?.status, 'failed')
})

// El aviso «Adaptamos …» de la galería dura lo que dura la visita a la pestaña
// Mi estilo: una visita es cada vez que la galería se monta.
test('el aviso de una gema adaptada se ve en la visita en que aparece y ya no en la siguiente; sus avisos siguen para el modal', async () => {
  const agent = fakeMigrate()
  const migrations = createGemMigrations(agent.migrate)
  const firstVisit = migrations.beginVisit()
  migrations.migrateOnce(OLD_GEM)
  agent.calls[0].resolve(MIGRATED)
  await settle()
  assert.equal(
    showsGalleryNotice(migrations.getSnapshot().get('st-vieja'), firstVisit),
    true,
  )
  // La galería lo tiene a la vista: queda anotado en qué visita se vio.
  migrations.markSeen(['st-vieja'], firstVisit)
  const seen = migrations.getSnapshot().get('st-vieja')
  assert.equal(showsGalleryNotice(seen, firstVisit), true)
  // La persona pasó a otra pestaña y volvió: es otra visita.
  const secondVisit = migrations.beginVisit()
  assert.notEqual(secondVisit, firstVisit)
  assert.equal(showsGalleryNotice(seen, secondVisit), false)
  // El aviso se fue de la galería, no los avisos del agente: el modal de la
  // gema los sigue mostrando hasta que se descartan.
  assert.equal(seen.status, 'migrated')
  assert.deepEqual(seen.warnings, WARNINGS)
})

test('un aviso que apareció con la galería cerrada espera a la próxima visita, y dura esa visita', async () => {
  const agent = fakeMigrate()
  const migrations = createGemMigrations(agent.migrate)
  migrations.beginVisit()
  migrations.migrateOnce(OLD_GEM)
  // La persona se va de Mi estilo antes de que termine la adaptación: nadie
  // marca el aviso como visto.
  agent.calls[0].resolve(MIGRATED)
  await settle()
  const secondVisit = migrations.beginVisit()
  assert.equal(
    showsGalleryNotice(migrations.getSnapshot().get('st-vieja'), secondVisit),
    true,
  )
  migrations.markSeen(['st-vieja'], secondVisit)
  const thirdVisit = migrations.beginVisit()
  assert.equal(
    showsGalleryNotice(migrations.getSnapshot().get('st-vieja'), thirdVisit),
    false,
  )
})

test('la visita en que se vio no se pisa, y marcar lo ya marcado no avisa a nadie', async () => {
  const agent = fakeMigrate()
  const migrations = createGemMigrations(agent.migrate)
  const firstVisit = migrations.beginVisit()
  migrations.migrateOnce(OLD_GEM)
  agent.calls[0].resolve(MIGRATED)
  await settle()
  let notified = 0
  migrations.subscribe(() => {
    notified += 1
  })
  migrations.markSeen(['st-vieja'], firstVisit)
  assert.equal(notified, 1)
  // La galería lo repite en cada render: sin cambios, nadie se entera.
  migrations.markSeen(['st-vieja'], firstVisit)
  migrations.markSeen([], firstVisit)
  migrations.markSeen(['st-otra'], firstVisit)
  const secondVisit = migrations.beginVisit()
  migrations.markSeen(['st-vieja'], secondVisit)
  assert.equal(notified, 1)
  assert.equal(migrations.getSnapshot().get('st-vieja').seenInVisit, firstVisit)
})

test('en vuelo no hay aviso en la galería (va en la tarjeta) y una fallida se avisa en todas las visitas', async () => {
  const agent = fakeMigrate()
  const migrations = createGemMigrations(agent.migrate)
  const firstVisit = migrations.beginVisit()
  migrations.migrateOnce(OLD_GEM)
  assert.equal(
    showsGalleryNotice(migrations.getSnapshot().get('st-vieja'), firstVisit),
    false,
  )
  // Marcar una en vuelo no anota nada.
  migrations.markSeen(['st-vieja'], firstVisit)
  assert.equal(migrations.getSnapshot().get('st-vieja').status, 'pending')
  agent.calls[0].reject(new Error('sin red'))
  await settle()
  migrations.markSeen(['st-vieja'], firstVisit)
  const failed = migrations.getSnapshot().get('st-vieja')
  assert.equal(failed.status, 'failed')
  assert.equal(showsGalleryNotice(failed, firstVisit), true)
  assert.equal(showsGalleryNotice(failed, migrations.beginVisit()), true)
})

test('una gema que se vuelve a adaptar estrena aviso', async () => {
  const agent = fakeMigrate()
  const migrations = createGemMigrations(agent.migrate)
  const firstVisit = migrations.beginVisit()
  migrations.adapt(OLD_GEM)
  agent.calls[0].resolve(MIGRATED)
  await settle()
  migrations.markSeen(['st-vieja'], firstVisit)
  const secondVisit = migrations.beginVisit()
  migrations.adapt(OLD_GEM)
  agent.calls[1].resolve(MIGRATED)
  await settle()
  assert.equal(
    showsGalleryNotice(migrations.getSnapshot().get('st-vieja'), secondVisit),
    true,
  )
})

test('si falla queda el aviso con el error; no se repite solo, sí con Reintentar', async () => {
  const agent = fakeMigrate()
  const migrations = createGemMigrations(agent.migrate)
  migrations.migrateOnce(OLD_GEM)
  const failure = new Error('sin red')
  agent.calls[0].reject(failure)
  await settle()
  assert.deepEqual(migrations.getSnapshot().get('st-vieja'), {
    status: 'failed',
    name: 'Vieja',
    error: failure,
  })
  migrations.migrateOnce(OLD_GEM)
  assert.equal(agent.calls.length, 1)
  migrations.retry(OLD_GEM)
  migrations.retry(OLD_GEM)
  assert.equal(agent.calls.length, 2)
  assert.equal(migrations.getSnapshot().get('st-vieja')?.status, 'pending')
})

test('una gema de plantilla o sin texto no se migra', () => {
  const agent = fakeMigrate()
  const migrations = createGemMigrations(agent.migrate)
  migrations.migrateOnce(MIGRATED_GEM)
  migrations.migrateOnce({ ...OLD_GEM, id: 'st-vacia', systemPrompt: '   ' })
  migrations.retry(MIGRATED_GEM)
  assert.equal(agent.calls.length, 0)
  assert.equal(migrations.getSnapshot().size, 0)
})

// ── Gema pegada: se guarda tal cual y se adapta en segundo plano ──

test('la migración automática de una gema vieja va con origin «migracion»', () => {
  const agent = fakeMigrate()
  const migrations = createGemMigrations(agent.migrate)
  migrations.migrateOnce(OLD_GEM)
  assert.equal(agent.calls[0].origin, 'migracion')
})

test('una gema pegada se adapta enseguida con origin «mi-estilo», aunque esa gema ya se hubiera migrado en la sesión', async () => {
  const agent = fakeMigrate()
  const migrations = createGemMigrations(agent.migrate, clock)
  migrations.migrateOnce(OLD_GEM)
  agent.calls[0].resolve(MIGRATED)
  await settle()
  // Si vuelve a estar guardada como texto, se adapta otra vez.
  migrations.adapt(OLD_GEM)
  assert.equal(agent.calls.length, 2)
  assert.equal(agent.calls[1].origin, 'mi-estilo')
  assert.deepEqual(migrations.getSnapshot().get('st-vieja'), PENDING)
})

test('con una adaptación en vuelo no sale otra: ni otro clic ni la migración automática', () => {
  const agent = fakeMigrate()
  const migrations = createGemMigrations(agent.migrate)
  migrations.adapt(OLD_GEM)
  migrations.adapt(OLD_GEM)
  migrations.migrateOnce(OLD_GEM)
  migrations.retry(OLD_GEM)
  assert.equal(agent.calls.length, 1)
})

test('«Reintentar» repite con el origin de la que falló', async () => {
  const agent = fakeMigrate()
  const migrations = createGemMigrations(agent.migrate)
  migrations.adapt(OLD_GEM)
  agent.calls[0].reject(new Error('modelo-timeout'))
  await settle()
  assert.equal(migrations.getSnapshot().get('st-vieja')?.status, 'failed')
  migrations.retry(OLD_GEM)
  assert.equal(agent.calls.length, 2)
  assert.equal(agent.calls[1].origin, 'mi-estilo')
})

test('adaptar una gema de plantilla o sin texto no hace nada', () => {
  const agent = fakeMigrate()
  const migrations = createGemMigrations(agent.migrate)
  migrations.adapt(MIGRATED_GEM)
  migrations.adapt({ ...OLD_GEM, id: 'st-vacia', systemPrompt: '  ' })
  assert.equal(agent.calls.length, 0)
})

test('la gema pegada se guarda tal cual, como texto: sin secciones y sin planos; personaje y filtro como están en el modal', () => {
  assert.deepEqual(
    pastedGemSavePayload({
      id: 'st-nueva',
      name: 'Mi gema',
      text: '  Acuarela suave con un zorro rojo.  ',
      character: { mode: 'generic' },
      colorFilter: 'horror-bw',
    }),
    {
      id: 'st-nueva',
      name: 'Mi gema',
      systemPrompt: 'Acuarela suave con un zorro rojo.',
      shots: [],
      character: { mode: 'generic' },
      colorFilter: 'horror-bw',
    },
  )
})

test('quien escucha se entera de cada cambio', async () => {
  const agent = fakeMigrate()
  const migrations = createGemMigrations(agent.migrate)
  let notified = 0
  const unsubscribe = migrations.subscribe(() => {
    notified += 1
  })
  migrations.migrateOnce(OLD_GEM)
  agent.calls[0].resolve(MIGRATED)
  await settle()
  assert.equal(notified, 2)
  unsubscribe()
  migrations.migrateOnce({ ...OLD_GEM, id: 'st-otra' })
  assert.equal(notified, 2)
})

// Lo guardado en el sidecar y el agente, simulados para migrateStoredGem: cada
// paso queda anotado en orden, con la gema que recibió, incluido el aviso de
// paso que la tarjeta muestra.
function fakeSteps(stored) {
  const disk = new Map(stored.map((style) => [style.id, style]))
  const agent = deferred()
  const log = []
  return {
    disk,
    agent,
    log,
    order: () => log.map(({ step }) => step),
    count: (name) => log.filter(({ step }) => step === name).length,
    steps: {
      async findStored(styleId) {
        log.push({ step: 'findStored', styleId })
        return disk.get(styleId)
      },
      rebuild(style, origin) {
        log.push({ step: 'rebuild', style, origin })
        return agent.promise
      },
      report(phase) {
        log.push({ step: 'report', phase })
      },
      async save(style, response) {
        log.push({ step: 'save', style, response })
      },
    },
  }
}

const AGENT_RESPONSE = {
  templateVersion: 1,
  sections: { visualStyle: 'Acuarela editorial.' },
  suggestions: {},
  warnings: WARNINGS,
}

test('se migra lo guardado ahora y no la tarjeta de la lista: texto, nombre y respaldo salen de la misma gema', async () => {
  // La persona la renombró y la editó («Reintentar» desde el modal guarda
  // primero) y la lista todavía muestra la versión anterior.
  const saved = {
    ...OLD_GEM,
    name: 'Vieja renombrada',
    systemPrompt: 'Acuarela con tinta corrida.',
  }
  const fake = fakeSteps([saved])
  const migrations = createGemMigrations((style) =>
    migrateStoredGem(style.id, fake.steps),
  )
  migrations.migrateOnce(OLD_GEM)
  await settle()
  fake.agent.resolve(AGENT_RESPONSE)
  await settle()
  // Con la respuesta del agente avisa que pasa a guardar, antes de releer.
  assert.deepEqual(fake.order(), [
    'findStored',
    'rebuild',
    'report',
    'findStored',
    'save',
  ])
  assert.equal(fake.log[2].phase, 'saving')
  const sent = fake.log[1].style
  const { style: savedStyle, response } = fake.log[4]
  assert.equal(sent, saved)
  assert.equal(savedStyle, saved)
  assert.equal(response, AGENT_RESPONSE)
  const payload = migrationStyleSavePayload(savedStyle, response)
  assert.equal(payload.name, 'Vieja renombrada')
  assert.equal(payload.sourcePrompt, migrationRebuildText(sent))
  assert.equal(
    payload.sourcePrompt,
    'Acuarela con tinta corrida.\n\n# ALLOWED SHOTS (use ONLY these framings)\n- Wide shot',
  )
  // Guardada sin revisión: el aviso queda con lo que avisó el agente.
  const state = migrations.getSnapshot().get('st-vieja')
  assert.equal(state?.status, 'migrated')
  assert.deepEqual(state?.warnings, WARNINGS)
})

test('el origin llega al agente: «mi-estilo» para una gema pegada', async () => {
  const fake = fakeSteps([OLD_GEM])
  fake.agent.resolve(AGENT_RESPONSE)
  await migrateStoredGem('st-vieja', fake.steps, 'mi-estilo')
  assert.equal(fake.log[1].origin, 'mi-estilo')
})

test('guardada, la migración devuelve los avisos del agente', async () => {
  const fake = fakeSteps([OLD_GEM])
  fake.agent.resolve(AGENT_RESPONSE)
  assert.deepEqual(await migrateStoredGem('st-vieja', fake.steps), {
    status: 'migrated',
    warnings: WARNINGS,
  })
  assert.equal(fake.count('save'), 1)
})

test('borrada mientras el agente trabaja: no se guarda (no vuelve a aparecer) y no queda aviso ni Reintentar', async () => {
  const fake = fakeSteps([OLD_GEM])
  const migrations = createGemMigrations((style) =>
    migrateStoredGem(style.id, fake.steps),
  )
  migrations.migrateOnce(OLD_GEM)
  await settle()
  fake.disk.delete('st-vieja')
  fake.agent.resolve(AGENT_RESPONSE)
  await settle()
  assert.equal(fake.count('save'), 0)
  assert.equal(migrations.getSnapshot().has('st-vieja'), false)
  // La lista todavía la muestra un instante: elegirla otra vez no llega al
  // agente ni guarda.
  migrations.migrateOnce(OLD_GEM)
  await settle()
  assert.equal(fake.count('rebuild'), 1)
  assert.equal(fake.count('save'), 0)
  assert.equal(migrations.getSnapshot().has('st-vieja'), false)
})

test('ya borrada al empezar (la lista todavía la mostraba): ni agente ni guardado', async () => {
  const fake = fakeSteps([])
  assert.deepEqual(await migrateStoredGem('st-vieja', fake.steps), {
    status: 'deleted',
  })
  assert.deepEqual(fake.order(), ['findStored'])
})

test('sin `report` en los pasos (el guard viejo), la migración sigue igual', async () => {
  const fake = fakeSteps([OLD_GEM])
  const { report: _report, ...steps } = fake.steps
  fake.agent.resolve(AGENT_RESPONSE)
  assert.deepEqual(await migrateStoredGem('st-vieja', steps), {
    status: 'migrated',
    warnings: WARNINGS,
  })
  assert.deepEqual(fake.order(), [
    'findStored',
    'rebuild',
    'findStored',
    'save',
  ])
})

test('sin planos, al agente va el systemPrompt tal cual', () => {
  for (const shots of [[], ['', '']])
    assert.equal(
      migrationRebuildText({ ...OLD_GEM, shots }),
      'Acuarela editorial con tinta suelta. Escribí en español.',
    )
})

test('con planos, se suma el bloque # ALLOWED SHOTS del sidecar', () => {
  assert.equal(
    migrationRebuildText({ ...OLD_GEM, shots: ['Wide shot', '', 'Close-up'] }),
    'Acuarela editorial con tinta suelta. Escribí en español.\n\n# ALLOWED SHOTS (use ONLY these framings)\n- Wide shot\n- Close-up',
  )
})

test('si con los planos pasara lo que acepta el agente, va sin ellos', () => {
  // El tope de LIMITE_TEXTO_GEMA en vimo-landing (eran 30 000).
  assert.equal(GEM_REBUILD_TEXT_LIMIT, 100_000)
  const tooLong = 'a'.repeat(99_990)
  assert.equal(
    migrationRebuildText({ ...OLD_GEM, systemPrompt: tooLong }),
    tooLong,
  )
  const fits = 'a'.repeat(99_900)
  assert.equal(
    migrationRebuildText({ ...OLD_GEM, systemPrompt: fits }),
    `${fits}\n\n# ALLOWED SHOTS (use ONLY these framings)\n- Wide shot`,
  )
})

test('guardar la migración: secciones, el templateVersion del agente y, de respaldo, el texto que se le mandó; nada más', () => {
  const response = {
    templateVersion: 1,
    sections: { visualStyle: ' Acuarela editorial. ', character: '' },
    suggestions: {},
    warnings: ['Se quitó el pedido de escribir en español.'],
  }
  const payload = migrationStyleSavePayload(OLD_GEM, response)
  assert.deepEqual(payload, {
    id: 'st-vieja',
    name: 'Vieja',
    sections: { visualStyle: 'Acuarela editorial.' },
    templateVersion: 1,
    sourcePrompt:
      'Acuarela editorial con tinta suelta. Escribí en español.\n\n# ALLOWED SHOTS (use ONLY these framings)\n- Wide shot',
  })
  assert.equal(payload.sourcePrompt, migrationRebuildText(OLD_GEM))
  for (const field of ['systemPrompt', 'shots', 'character', 'colorFilter'])
    assert.equal(field in payload, false, field)
})

test('el borrador del modal trae el respaldo de una gema de plantilla; el de una vieja sigue igual', () => {
  assert.equal(
    customStyleDraftFrom(MIGRATED_GEM).sourcePrompt,
    MIGRATED_GEM.sourcePrompt,
  )
  assert.equal('sourcePrompt' in customStyleDraftFrom(OLD_GEM), false)
  assert.equal(
    'sourcePrompt' in
      customStyleDraftFrom({ ...MIGRATED_GEM, sourcePrompt: '' }),
    false,
  )
})

test('Crear: el snapshot viejo se cambia por la gema migrada', () => {
  const chosen = selectedCustomStyleFrom(OLD_GEM)
  const refreshed = refreshedCustomStyle(chosen, [MIGRATED_GEM])
  assert.deepEqual(refreshed?.sections, MIGRATED_GEM.sections)
  assert.equal(refreshed?.templateVersion, 1)
})

test('Crear: sin migración, el mismo objeto (el formulario no cambia de identidad)', () => {
  const chosen = selectedCustomStyleFrom(OLD_GEM)
  assert.equal(refreshedCustomStyle(chosen, [OLD_GEM]), chosen)
  assert.equal(refreshedCustomStyle(chosen, []), chosen)
  assert.equal(refreshedCustomStyle(null, [MIGRATED_GEM]), null)
  const template = selectedCustomStyleFrom(MIGRATED_GEM)
  assert.equal(refreshedCustomStyle(template, [MIGRATED_GEM]), template)
})

test('la galería manda a migrar sola una gema vieja con la plantilla encendida, nunca en la demo', () => {
  // Elegir o abrir una gema vieja la migra (spec §4.4)...
  assert.equal(migratesGemsOnUse(true, false), true)
  // ...salvo en la demo: la gema vieja del pack (storytelling) se usa como
  // está y la demo no llama al agente (ADR-0029).
  assert.equal(migratesGemsOnUse(true, true), false)
  assert.equal(migratesGemsOnUse(false, false), false)
  assert.equal(migratesGemsOnUse(false, true), false)
})
