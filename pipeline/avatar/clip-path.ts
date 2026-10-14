import { join } from 'node:path'

import { isValidFile, type ProjectPaths } from '../project/paths.ts'
import { PipelineFailure } from '../runner/failure.ts'
import type { SceneAvatar } from '../types/avatar.ts'
import type { ImageExtension } from '../types/image-provider.ts'

// Los archivos de una escena de avatar dentro de `avatar/` del proyecto
// (ADR-0057, diseño §3.2). Llevan la escena y los primeros 8 caracteres de la
// huella del pedido: otro tramo u otra narración es otro archivo, y los viejos
// quedan en disco (pago hecho, recuperable).
//
//   scene_<id>.<hash8>.wav       el pedazo de narración que habla
//   scene_<id>.<hash8>.raw.mp4   lo que devolvió HeyGen
//   scene_<id>.<hash8>.mp4       normalizado al cuadro del render (= clipFile)
//   look.<ext>                   la vista previa del look elegido (la del avatar
//                                si el look no tiene una): la imagen fija de toda
//                                escena de avatar (Vimo no genera ninguna) y la
//                                que usa el render si falta el clip
//
// Como en pipeline/animation/clip-path.ts, el nombre que se lee de
// scenes.json se valida antes de usarlo: nunca una ruta arbitraria.

const HASH_PREFIX_LENGTH = 8
const HASH_PREFIX_PATTERN = /^[0-9a-f]{8}$/
// El clip normalizado y el crudo del proveedor llevan la misma raíz.
const CLIP_EXTENSION = '.mp4'
const RAW_CLIP_EXTENSION = '.raw.mp4'
// Lo único que vale como `clipFile`: el nombre que arma avatarClipFileName.
// Ni rutas, ni el crudo de HeyGen, ni mayúsculas.
const CLIP_FILE_PATTERN = /^scene_[1-9][0-9]*\.[0-9a-f]{8}\.mp4$/
const LOOK_PREVIEW_BASENAME = 'look'
const LOOK_PREVIEW_EXTENSIONS: readonly ImageExtension[] = [
  'jpg',
  'png',
  'webp',
]

// `scene_<id>.<hash8>`: falla si el id no es un entero positivo o si la huella
// no empieza con 8 hex en minúsculas (el carril la arma con sha256).
function fileStem(sceneId: number, hash: string): string {
  const prefix = hash.slice(0, HASH_PREFIX_LENGTH)
  if (
    !Number.isSafeInteger(sceneId) ||
    sceneId < 1 ||
    !HASH_PREFIX_PATTERN.test(prefix)
  )
    throw new PipelineFailure(
      'invalid_payload',
      `invalid avatar file name for scene ${sceneId}`,
    )

  return `scene_${sceneId}.${prefix}`
}

// El nombre del clip normalizado: lo que se persiste en `SceneAvatar.clipFile`.
export function avatarClipFileName(sceneId: number, hash: string): string {
  return `${fileStem(sceneId, hash)}${CLIP_EXTENSION}`
}

export function avatarClipFile(
  paths: ProjectPaths,
  sceneId: number,
  hash: string,
): string {
  return join(paths.avatarDirectory, avatarClipFileName(sceneId, hash))
}

export function avatarAudioFile(
  paths: ProjectPaths,
  sceneId: number,
  hash: string,
): string {
  return join(paths.avatarDirectory, `${fileStem(sceneId, hash)}.wav`)
}

export function avatarRawClipFile(
  paths: ProjectPaths,
  sceneId: number,
  hash: string,
): string {
  return join(
    paths.avatarDirectory,
    `${fileStem(sceneId, hash)}${RAW_CLIP_EXTENSION}`,
  )
}

// El clip normalizado que la escena dice tener, o undefined si no tiene o si
// el nombre no es uno de los que arma Vimo: el render y la vista lo tratan
// como «sin clip válido» (estática con la vista previa del look; fallido en
// la UI).
export function sceneAvatarClipFile(
  paths: ProjectPaths,
  avatar: Pick<SceneAvatar, 'clipFile'>,
): string | undefined {
  if (!avatar.clipFile) return undefined
  if (!CLIP_FILE_PATTERN.test(avatar.clipFile)) return undefined

  return join(paths.avatarDirectory, avatar.clipFile)
}

// El crudo del proveedor del clip que la escena dice tener: el mismo nombre con
// `.raw.mp4`, como los arma el carril (avatarRawClipFile), o undefined si no
// tiene clip o si el nombre no es uno de los de Vimo (ni rutas, ni la escena
// 0). El recorte (`avatar-trim-scene`) lo vuelve a ajustar al tramo nuevo.
export function sceneAvatarRawClipFile(
  paths: ProjectPaths,
  avatar: Pick<SceneAvatar, 'clipFile'>,
): string | undefined {
  const clip = sceneAvatarClipFile(paths, avatar)
  if (!clip) return undefined

  return `${clip.slice(0, -CLIP_EXTENSION.length)}${RAW_CLIP_EXTENSION}`
}

// La copia de la vista previa del look elegido en el proyecto, con la
// extensión real de la imagen: la de la biblioteca puede ser PNG o WEBP
// (diseño §16).
export function avatarLookPreviewFile(
  paths: ProjectPaths,
  extension: ImageExtension,
): string {
  if (!LOOK_PREVIEW_EXTENSIONS.includes(extension))
    throw new PipelineFailure(
      'invalid_payload',
      `invalid avatar preview extension "${extension}"`,
    )

  return join(paths.avatarDirectory, `${LOOK_PREVIEW_BASENAME}.${extension}`)
}

// La vista previa del look que el proyecto tenga en disco (la primera de jpg,
// png y webp; se copia una sola), o undefined. Es la imagen fija de las
// escenas de avatar en la UI y la que usa el render si falta el clip.
export async function findAvatarLookPreview(
  paths: ProjectPaths,
): Promise<string | undefined> {
  for (const extension of LOOK_PREVIEW_EXTENSIONS) {
    const file = avatarLookPreviewFile(paths, extension)
    if (await isValidFile(file)) return file
  }

  return undefined
}
