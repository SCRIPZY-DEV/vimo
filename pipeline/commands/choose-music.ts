import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { downloadMusicAudio } from '../providers/music/evolink.ts'
import type { PipelineContext } from '../runner/context.ts'
import { PipelineFailure } from '../runner/failure.ts'
import type {
  ChooseMusicPayload,
  ChooseMusicResult,
  MusicHistoryEntry,
} from '../types/music.ts'
import { sanitizeFileName } from '../utils/sanitize-file-name.ts'
import {
  HISTORY_AUDIO_FILE,
  HISTORY_COVER_FILE,
  musicHistoryRoot,
  newHistoryId,
  writeHistoryMetadata,
} from './music-history.ts'

const MUSIC_MODEL = 'suno-v5-beta'

function assertHttpUrl(value: string): void {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new PipelineFailure('invalid_payload', 'option.audioUrl is not a URL')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    throw new PipelineFailure(
      'invalid_payload',
      'option.audioUrl must be http(s)',
    )
}

// Descarga la opción elegida y la persiste en el historial (audio + cover +
// metadata). Es el único lugar donde la música toca el disco.
export async function chooseMusic(
  context: PipelineContext,
): Promise<ChooseMusicResult> {
  const payload = context.job.payload as ChooseMusicPayload | undefined
  const audioUrl = payload?.option?.audioUrl
  if (!audioUrl || !payload.prompt)
    throw new PipelineFailure(
      'invalid_payload',
      'payload.option.audioUrl and payload.prompt are required',
    )
  assertHttpUrl(audioUrl)

  const id = newHistoryId()
  const entryDirectory = join(musicHistoryRoot(context), id)
  await mkdir(entryDirectory, { recursive: true })

  const audioPath = join(entryDirectory, HISTORY_AUDIO_FILE)
  await downloadMusicAudio(audioUrl, audioPath, context.signal)

  let coverPath: string | undefined
  if (payload.option.coverUrl) {
    try {
      coverPath = join(entryDirectory, HISTORY_COVER_FILE)
      await downloadMusicAudio(
        payload.option.coverUrl,
        coverPath,
        context.signal,
      )
    } catch {
      // El cover es decorativo: si falla la descarga, la pista igual se guarda.
      coverPath = undefined
    }
  }

  const name = payload.name ? sanitizeFileName(payload.name) : undefined
  const metadata: Omit<MusicHistoryEntry, 'audioPath' | 'coverPath'> = {
    id,
    createdAt: new Date().toISOString(),
    model: MUSIC_MODEL,
    prompt: payload.prompt,
    customMode: payload.customMode ?? false,
    instrumental: payload.instrumental ?? true,
  }
  if (payload.style) metadata.style = payload.style
  if (payload.option.title) metadata.title = payload.option.title
  if (name) metadata.name = name
  if (payload.option.durationSeconds !== undefined)
    metadata.durationSeconds = payload.option.durationSeconds

  await writeHistoryMetadata(entryDirectory, metadata)

  const entry: MusicHistoryEntry = { ...metadata, audioPath }
  if (coverPath) entry.coverPath = coverPath

  return { entry }
}
