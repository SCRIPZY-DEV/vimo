import {
  downloadYouTubeVideo,
  requireYtDlpPath,
} from '../../providers/ytdlp/download.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { requireFfmpegPath } from '../../utils/ffmpeg.ts'
import type { CreateVideoContext } from '../context.ts'

// Overlay (textura tipo lluvia/partículas) → overlay.mp4; el render lo mezcla
// con blend=screen sobre el video final.
export async function downloadOverlay(
  context: CreateVideoContext,
  signal: AbortSignal,
): Promise<void> {
  const overlayUrl = context.options.overlayUrl
  if (!overlayUrl)
    throw new PipelineFailure(
      'invalid_payload',
      'useOverlay is true but there is no overlayUrl',
    )

  await downloadYouTubeVideo(overlayUrl, context.paths.overlayFile, {
    ytDlpPath: requireYtDlpPath(context.job.binaryPaths.ytDlp),
    ffmpegPath: requireFfmpegPath(context.job.binaryPaths.ffmpeg),
    signal,
  })
}
