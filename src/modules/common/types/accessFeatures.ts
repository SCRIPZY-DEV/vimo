// Nombre de cada interruptor de salida del veredicto de acceso (ADR-0048). La
// forma completa del veredicto es de auth (`AccessFeatures`): common conoce
// solo los nombres, para que cualquier módulo lea un interruptor sin importar
// auth (ADR-0006, enmienda 2026-09-30). Uno nuevo se suma acá y en auth.
export type AccessFeatureName = 'gemTemplate' | 'newCatalog'
