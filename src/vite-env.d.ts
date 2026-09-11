/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
}

// Inyectada por `define` en vite.config.ts desde package.json.
declare const __APP_VERSION__: string
