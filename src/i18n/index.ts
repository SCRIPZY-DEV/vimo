import i18n from 'i18next'
import Backend from 'i18next-http-backend'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

export const availableLocales = ['en', 'es', 'pt']

i18n
  // Load translations from /public/locales
  .use(Backend)
  // Detect user's language
  .use(LanguageDetector)
  // Connect i18next with React
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: availableLocales,

    backend: {
      loadPath: '/locales/{{lng}}.json',
    },

    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },

    debug: import.meta.env.DEV,

    interpolation: {
      // React already escapes rendered values
      escapeValue: false,
    },
  })

// Keep <html lang> in sync (fires on init too, once the language resolves)
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng
})

export default i18n
