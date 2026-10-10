import { downloadImage } from '../../providers/image/download.ts'
import type { HeyGenClient } from '../../providers/avatar/heygen.ts'
import type { PipelineContext } from '../../runner/context.ts'
import type { AvatarOwnership, HeyGenLook } from '../../types/avatar.ts'
import type { DecodedImage } from '../../types/images.ts'

// Páginas de looks de un avatar que se leen como máximo: 4 × 50 = 200 looks
// (el avatar más grande del stock tenía 33 el 2026-10-09).
export const GROUP_LOOK_PAGES_MAX = 4

// Una vista previa para bajar: el look y la URL que HeyGen dio para él.
export interface LookPreviewTarget {
  lookId: string
  url: string
}

// La biblioteca dice stock/own; HeyGen, public/private.
export function heygenOwnershipOf(
  ownership: AvatarOwnership,
): 'public' | 'private' {
  return ownership === 'own' ? 'private' : 'public'
}

// Las URL de vista previa que dio HeyGen, por look.
export function previewUrlsOf(looks: HeyGenLook[]): Map<string, string> {
  const urls = new Map<string, string>()
  for (const look of looks)
    if (look.previewImageUrl) urls.set(look.lookId, look.previewImageUrl)
  return urls
}

// Esos looks como vistas previas para bajar: solo los que tienen URL.
export function previewTargetsOf(
  lookIds: string[],
  urls: Map<string, string>,
): LookPreviewTarget[] {
  return lookIds.flatMap((lookId) => {
    const url = urls.get(lookId)
    return url ? [{ lookId, url }] : []
  })
}

// Todos los looks de un avatar (grupo), en el orden de HeyGen y sin repetidos,
// hasta GROUP_LOOK_PAGES_MAX páginas.
export async function listGroupLooks(
  client: HeyGenClient,
  groupId: string,
  ownership: AvatarOwnership,
): Promise<HeyGenLook[]> {
  const looks: HeyGenLook[] = []
  let token: string | undefined
  for (let page = 0; page < GROUP_LOOK_PAGES_MAX; page++) {
    const result = await client.listLooks({
      ownership: heygenOwnershipOf(ownership),
      groupId,
      token,
    })
    for (const look of result.looks)
      if (!looks.some((known) => known.lookId === look.lookId)) looks.push(look)
    if (!result.nextToken) break
    token = result.nextToken
  }

  return looks
}

// Baja una vista previa. Best-effort: sin ella el avatar sigue sirviendo para
// generar, así que un fallo de descarga solo avisa; una cancelación pedida por
// la persona sí se propaga. Solo URL https, como las del CDN de HeyGen.
export async function downloadPreview(
  context: PipelineContext,
  id: string,
  url: string | undefined,
  label = 'preview',
): Promise<DecodedImage | null> {
  if (!url?.startsWith('https://')) return null

  try {
    return await downloadImage(url, context.signal)
  } catch (error) {
    if (context.signal.aborted) throw error
    context.emitter.emit({
      type: 'log',
      level: 'warn',
      message: `avatar ${id}: ${label} download failed, saved without it`,
    })
    return null
  }
}

// Baja en paralelo las vistas previas de esos looks: lookId → imagen, solo las
// que se pudieron bajar (cada fallo avisa por su cuenta).
export async function downloadLookPreviews(
  context: PipelineContext,
  id: string,
  targets: LookPreviewTarget[],
): Promise<Map<string, DecodedImage>> {
  const images = await Promise.all(
    targets.map(({ lookId, url }) =>
      downloadPreview(context, id, url, `preview of look ${lookId}`),
    ),
  )

  const byLook = new Map<string, DecodedImage>()
  targets.forEach(({ lookId }, index) => {
    const image = images[index]
    if (image) byLook.set(lookId, image)
  })
  return byLook
}
