import { availableParallelism, totalmem } from 'node:os'

import {
  RENDER_CORES_PER_PROCESS,
  RENDER_MAX_PARALLEL_CHUNKS,
  RENDER_MEMORY_PER_PROCESS_BYTES,
  RENDER_MEMORY_SHARE,
} from './constants.ts'

// Cuántos chunks se renderizan a la vez, decidido por el equipo que exporta
// y no por la máquina en la que se midió: el límite más chico entre núcleos y
// memoria gana, y nunca baja de 1 (el render secuencial de siempre). Se usa
// la RAM TOTAL y no la libre: macOS reporta como ocupada la caché que el
// sistema libera a demanda, y con freemem todo equipo quedaría en 1.

export interface MachineCapacity {
  logicalCores: number
  totalMemoryBytes: number
}

export function currentMachineCapacity(): MachineCapacity {
  return {
    logicalCores: availableParallelism(),
    totalMemoryBytes: totalmem(),
  }
}

export function parallelChunksFor(
  totalChunks: number,
  machine: MachineCapacity = currentMachineCapacity(),
): number {
  const byCores = Math.floor(machine.logicalCores / RENDER_CORES_PER_PROCESS)
  const byMemory = Math.floor(
    (machine.totalMemoryBytes * RENDER_MEMORY_SHARE) /
      RENDER_MEMORY_PER_PROCESS_BYTES,
  )

  return Math.max(
    1,
    Math.min(byCores, byMemory, RENDER_MAX_PARALLEL_CHUNKS, totalChunks),
  )
}
