export const CostsRoutes = {
  costs: '/costs',
} as const

export const CHARS_PER_SECOND_ESTIMATE = 13

export const SECONDS_PER_SCENE_ESTIMATE = 7

export const VIDEO_DURATIONS_MINUTES = [5, 10, 20] as const
export const IMAGE_BATCH_SIZES = [40, 220, 446] as const
export const VOICE_CHAR_BATCHES = [1_000, 10_000, 50_000, 100_000] as const

export const SORT_REFERENCE_DURATION_MINUTES = 10
