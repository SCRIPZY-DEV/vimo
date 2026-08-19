const FILE_NAME_LIMIT = 60
const COMBINING_MARKS_REGEX = /[̀-ͯ]/g

export function sanitizeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(COMBINING_MARKS_REGEX, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, FILE_NAME_LIMIT)
}
