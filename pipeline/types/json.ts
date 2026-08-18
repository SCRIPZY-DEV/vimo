// Tipos JSON planos para las partes del contrato que son datos arbitrarios
// (payload de un subcomando, result de un job): todo lo que cruza el borde
// del sidecar viaja como NDJSON y debe ser serializable.
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export type JsonObject = { [key: string]: JsonValue }
