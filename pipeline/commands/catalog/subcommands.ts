import type { SubcommandHandler } from '../../runner/subcommand.ts'
import { catalogStyleCopy } from './catalog-style-copy.ts'
import { catalogStyleSamplesUpload } from './catalog-style-samples-upload.ts'
import { catalogStylesList } from './catalog-styles-list.ts'
import { catalogStylesSync } from './catalog-styles-sync.ts'

// Subcomandos del catálogo de estilos de Vimo (Entrega 2, spec §8). Llevan
// «style» en el nombre para que el log de diagnóstico los clasifique como
// estilos sin tocar Rust (decisión P7 del plan E2). Cada dominio exporta su
// propio mapa y main.ts los esparce en SUBCOMMANDS.
export const catalogSubcommands: Record<string, SubcommandHandler> = {
  'catalog-styles-list': catalogStylesList,
  'catalog-style-copy': catalogStyleCopy,
  'catalog-styles-sync': catalogStylesSync,
  'catalog-style-samples-upload': catalogStyleSamplesUpload,
}
