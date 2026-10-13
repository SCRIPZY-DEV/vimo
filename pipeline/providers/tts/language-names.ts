// Catálogos que etiquetan el idioma por nombre completo ("Spanish") y no por
// código ISO: Vbee vía DubVoice y la Voice Library v3 de ai33. Cubre los
// códigos del filtro de la UI (VOICE_LANGUAGE_FILTER_CODES); un código
// desconocido viaja tal cual.
const LANGUAGE_NAMES: Record<string, string> = {
  es: 'Spanish',
  en: 'English',
  pt: 'Portuguese',
  fr: 'French',
  it: 'Italian',
  de: 'German',
  ru: 'Russian',
  ja: 'Japanese',
  zh: 'Chinese',
}

export function languageNameParam(code: string): string {
  return LANGUAGE_NAMES[code.toLowerCase()] ?? code
}
