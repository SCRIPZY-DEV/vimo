// Only generation invocations are counted. Uploads, downloads and replayed
// receipts never create attempts. An unobserved historical count stays unknown.
const MAX_ATTEMPTS = 10_000
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const counter = (value) =>
  Number.isSafeInteger(value) && value >= 0 && value <= MAX_ATTEMPTS

export function safeAttemptStats(input) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    input.version !== 1 ||
    input.rewrites !== 0
  )
    return null
  const keys = [
    'starts',
    'retries',
    'confirmedSubmissions',
    'notSent',
    'uncertain',
  ]
  if (
    !keys.every((key) => counter(input[key])) ||
    input.retries !== Math.max(0, input.starts - 1) ||
    input.confirmedSubmissions + input.notSent + input.uncertain !==
      input.starts
  )
    return null
  return {
    version: 1,
    ...Object.fromEntries(keys.map((key) => [key, input[key]])),
    rewrites: 0,
  }
}

export function mergeAttemptStats(previous, incoming) {
  const before = safeAttemptStats(previous),
    next = safeAttemptStats(incoming)
  if (!next) return before
  // Confirmed knowledge cannot be erased by a late snapshot. Uncertain may
  // decrease as a pending invocation finishes, while starts never decreases.
  if (
    before &&
    ['starts', 'confirmedSubmissions', 'notSent'].some(
      (key) => next[key] < before[key],
    )
  )
    return before
  return next
}

export function initialAttemptAudit() {
  return { version: 1, complete: true, entries: [] }
}

function validAudit(audit) {
  if (
    !audit ||
    audit.version !== 1 ||
    typeof audit.complete !== 'boolean' ||
    !Array.isArray(audit.entries) ||
    audit.entries.length > MAX_ATTEMPTS
  )
    return false
  const ids = new Set()
  return audit.entries.every((entry) => {
    if (
      !entry ||
      !UUID.test(entry.id) ||
      ids.has(entry.id) ||
      !Number.isSafeInteger(entry.startedAt) ||
      entry.startedAt < 0 ||
      !['uncertain', 'confirmed', 'not_sent'].includes(entry.submission)
    )
      return false
    if (
      entry.submission === 'confirmed' &&
      (!Number.isSafeInteger(entry.submittedAt) || entry.submittedAt < 0)
    )
      return false
    ids.add(entry.id)
    return true
  })
}

export function summarizeAttempts(audit) {
  if (!validAudit(audit) || !audit.complete) return null
  const starts = audit.entries.length
  const confirmedSubmissions = audit.entries.filter(
    (entry) => entry.submission === 'confirmed',
  ).length
  const notSent = audit.entries.filter(
    (entry) => entry.submission === 'not_sent',
  ).length
  return {
    version: 1,
    starts,
    retries: Math.max(0, starts - 1),
    confirmedSubmissions,
    notSent,
    uncertain: starts - confirmedSubmissions - notSent,
    rewrites: 0,
  }
}

export function startAttempt(audit, id, startedAt) {
  if (!UUID.test(id) || !Number.isSafeInteger(startedAt) || startedAt < 0)
    throw new Error('attempt_audit_invalid')
  if (audit !== undefined && audit !== null && !validAudit(audit))
    throw new Error('attempt_audit_invalid')
  // A legacy job can record future attempts without claiming that its earlier
  // invocations are known. New jobs alone receive complete:true at acceptance.
  const current = audit ?? { version: 1, complete: false, entries: [] }
  if (current.entries.some((entry) => entry.id === id)) return current
  if (current.entries.length >= MAX_ATTEMPTS)
    throw new Error('attempt_audit_full')
  return {
    ...current,
    entries: [...current.entries, { id, startedAt, submission: 'uncertain' }],
  }
}

export function finishAttempt(audit, id, outcome) {
  if (!validAudit(audit) || !audit.entries.some((entry) => entry.id === id))
    return audit
  const submittedAt = outcome?.submittedAt ?? outcome?.meta?.submittedAt
  const confirmed = Number.isSafeInteger(submittedAt) && submittedAt >= 0
  const notSent =
    !outcome?.ok &&
    ['not_sent', 'not-sent'].includes(outcome?.error?.submission)
  return {
    ...audit,
    entries: audit.entries.map((entry) => {
      if (entry.id !== id || entry.submission !== 'uncertain') return entry
      if (confirmed) return { ...entry, submission: 'confirmed', submittedAt }
      if (notSent) return { ...entry, submission: 'not_sent' }
      return entry
    }),
  }
}
