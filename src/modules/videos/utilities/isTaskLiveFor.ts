import type { CreateTask } from '@/modules/videos/types/create'

// La tarea del store pertenece a este proyecto y su job sigue corriendo.
export function isTaskLiveFor(
  task: CreateTask | null,
  projectId: string,
): boolean {
  if (task?.projectId !== projectId) return false
  return task.status === 'generating' || task.status === 'creating'
}
