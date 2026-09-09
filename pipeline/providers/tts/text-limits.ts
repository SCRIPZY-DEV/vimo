// Tope TOTAL de texto que una generación de voz puede narrar (90 000 según el
// dueño, 2026-09-07): aplica al guion de Crear y al probador de voz, en todos
// los motores. Espejado en la UI como NARRATION_CHAR_LIMIT
// (src/modules/voices/constants.ts). Cada motor trocea ese texto a su propio
// tope por llamada (chunkCharLimit en TtsProvider).
export const TTS_TEXT_CHAR_LIMIT = 90_000
