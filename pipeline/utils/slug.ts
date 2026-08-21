const SLUG_LIMIT = 60

const COMBINING_MARKS_REGEX = /[̀-ͯ]/g

// Slug de carpeta de proyecto (ADR-0009): minúsculas, guiones, sin acentos.
// «Mi Vídeo Épico» → «mi-video-epico».
export function slugifyProjectName(name: string): string {
  return name
    .normalize('NFD')
    .replace(COMBINING_MARKS_REGEX, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_LIMIT)
    .replace(/-+$/, '')
}
