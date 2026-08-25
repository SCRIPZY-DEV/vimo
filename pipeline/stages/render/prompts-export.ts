import { writeFile } from 'node:fs/promises'

import { sceneImageFile, type ProjectPaths } from '../../project/paths.ts'
import type { Scene } from '../../types/scenes.ts'

// Export legible de los prompts del proyecto (port de exportarPromptsMarkdown):
// un markdown de diagnóstico junto al video, best-effort — un fallo acá no
// tumba el render.
export async function exportPromptsMarkdown(
  paths: ProjectPaths,
  scenes: Scene[],
  styleId: string,
): Promise<void> {
  let markdown = `# Vimo prompts\n\n`
  markdown += `**Style:** ${styleId}\n`
  markdown += `**Total scenes:** ${scenes.length}\n`
  markdown += `**Generated:** ${new Date().toISOString()}\n\n---\n\n`

  for (const scene of scenes) {
    const start = (scene.startSeconds ?? 0).toFixed(2)
    const end = (scene.endSeconds ?? 0).toFixed(2)
    const duration = (
      (scene.endSeconds ?? 0) - (scene.startSeconds ?? 0)
    ).toFixed(2)
    markdown += `## Scene ${scene.id} — ${start}s to ${end}s (dur ${duration}s)\n\n`
    markdown += `**Narration:**  \n${scene.text || '_(empty)_'}\n\n`
    markdown += `**Image prompt:**  \n${scene.imagePrompt || '_(no prompt)_'}\n\n`
    markdown += `**Image:** \`${sceneImageFile(paths, scene.id)}\`\n\n---\n\n`
  }

  try {
    await writeFile(paths.promptsExportFile, markdown, 'utf8')
  } catch {
    // Diagnóstico opcional: no rompe el render.
  }
}
