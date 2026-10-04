// Apoyo para los guards, no es una prueba: contesta las llamadas del revisor
// narrativo (ADR-0043) con su contrato. Los guards que miden otra cosa
// (selección del editor, escenas mudas) aprueban todo y no cuentan esas
// llamadas como pedidos al redactor.
const REVIEW_SYSTEM_START = 'You audit the FULL narrative meaning'

export function isNarrativeReviewRequest(request) {
  return request.messages[0]?.content.startsWith(REVIEW_SYSTEM_START) === true
}

// Veredicto del juez: aprueba todo salvo las escenas de `rejectedIds`, que
// objeta con `objection`.
export function narrativeReviewAnswer(
  request,
  { rejectedIds = new Set(), objection = 'Fixture objection.' } = {},
) {
  const { candidates } = JSON.parse(request.messages.at(-1).content)
  const scenes = candidates.map((candidate) => {
    const aligned = !rejectedIds.has(candidate.sceneId)
    return {
      sceneId: candidate.sceneId,
      sourceMeaning: 'Fixture source meaning.',
      promptMeaning: 'Fixture prompt meaning.',
      checks: {
        focus: aligned,
        events: aligned,
        setting: aligned,
        causality: aligned,
      },
      aligned,
      sourceEvidenceId: candidate.sourceEvidence[0]?.id ?? null,
      promptEvidenceId: candidate.promptEvidence[0].id,
      reason: aligned ? 'Fixture approval.' : objection,
    }
  })
  return Response.json({
    choices: [
      {
        message: { content: JSON.stringify({ scenes }) },
        finish_reason: 'stop',
      },
    ],
  })
}
