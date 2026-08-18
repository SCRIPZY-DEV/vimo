import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier/flat'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'src-tauri/target', 'src-tauri/gen']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      // Debe ir al final: desactiva las reglas que chocan con Prettier.
      prettier,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // Sidecar Node (ADR-0010): globals de Node y guards ejecutables del
    // contrato — la config llega inyectada por el PipelineJob y todo output
    // es NDJSON del emitter, así que process.env y console están prohibidos.
    files: ['pipeline/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'no-console': 'error',
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            'ADR-0010: nada en pipeline/ lee process.env; la config viaja en el PipelineJob.',
        },
      ],
    },
  },
  {
    // Kit shadcn/ui vendorizado desde la app original: exporta variantes cva
    // junto a los componentes, patrón propio del kit que no aplicamos al
    // código de producto.
    files: ['src/modules/common/ui/**'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
