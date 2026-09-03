// Tiempo de una escena con un decimal («6.2s»), como en las grillas del
// origen.
export function formatSceneSeconds(seconds: number): string {
  return `${seconds.toFixed(1)}s`
}
