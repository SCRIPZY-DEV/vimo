import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { motion } from 'framer-motion'
import { FolderOpen, FolderSync, RotateCcw } from 'lucide-react'
import DoodleLightbulb from '@/modules/common/doodles/DoodleLightbulb'
import { usePageTitle } from '@/modules/common/hooks/usePageTitle'
import { Button } from '@/modules/common/ui/button'
import { cn } from '@/modules/common/utilities/cn'
import { SceneCountSection } from '@/modules/settings/components/SceneCountSection'
import { SceneDurationSection } from '@/modules/settings/components/SceneDurationSection'
import { BlockedPromptModelsSection } from '@/modules/settings/components/BlockedPromptModelsSection'
import { PromptModelSection } from '@/modules/settings/components/PromptModelSection'
import { UpdatesSection } from '@/modules/settings/components/UpdatesSection'
import { VoiceVendorSection } from '@/modules/settings/components/VoiceVendorSection'
import { useProjectsRoot } from '@/modules/settings/hooks/useProjectsRoot'
import {
  PROMPT_MODEL_FOCUS,
  SETTINGS_FOCUS_PARAM,
  VOICE_VENDOR_FOCUS,
} from '@/modules/settings/constants'

/**
 * Ajustes de la aplicación: la carpeta raíz donde Vimo guardará los proyectos
 * (una sola — el layout por proyecto lo crea el pipeline, ver ADR-0009), la
 * cantidad de escenas con la que arrancan los videos de catálogo, y el ritmo y
 * el modelo de escritura de los de estilo propio, el proveedor de voces y las
 * actualizaciones de la app. En web las secciones se muestran deshabilitadas.
 */
export function Settings() {
  const { t } = useTranslation()
  const {
    isNative,
    projectsRoot,
    isLoading,
    changeFolder,
    resetFolder,
    openFolder,
    changing,
  } = useProjectsRoot()
  const [searchParams] = useSearchParams()

  usePageTitle(t('settings.pageTitle'))

  // `?focus=promptModel` (desde el link de Crear): esa tarjeta recibe scroll
  // y queda resaltada.
  const focusedSection = searchParams.get(SETTINGS_FOCUS_PARAM)

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-8 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3"
      >
        <DoodleLightbulb size={48} delay={100} />
        <div>
          <h1 className="font-display text-3xl font-extrabold text-foreground">
            {t('settings.titulo')}
          </h1>
          <p className="font-handwritten text-lg text-muted-foreground">
            {t('settings.tagline')}
          </p>
        </div>
      </motion.div>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="space-y-4 rounded-2xl border-2 border-border bg-card p-6 shadow-card"
      >
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">
            {t('settings.ubicacionTitulo')}
          </h2>
          <p className="font-body text-sm text-muted-foreground">
            {t('settings.ubicacionDescripcion')}
          </p>
        </div>

        {!isNative && (
          <p className="font-body text-sm text-saffron">
            {t('settings.soloEscritorio')}
          </p>
        )}

        <div
          className={cn(
            'space-y-3',
            !isNative && 'pointer-events-none opacity-60',
          )}
        >
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
            <code className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">
              {isLoading ? t('settings.cargando') : (projectsRoot ?? '')}
            </code>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={changeFolder}
              disabled={changing}
              className="rounded-lg font-display"
            >
              <FolderSync className="mr-1.5 h-4 w-4" />
              {t('settings.cambiar')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={openFolder}
              disabled={changing}
              className="rounded-lg font-display"
            >
              <FolderOpen className="mr-1.5 h-4 w-4" />
              {t('settings.abrir')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFolder}
              disabled={changing}
              className="rounded-lg font-display text-muted-foreground"
            >
              <RotateCcw className="mr-1.5 h-4 w-4" />
              {t('settings.restablecer')}
            </Button>
          </div>
        </div>
      </motion.section>

      <SceneCountSection />

      <SceneDurationSection />

      <PromptModelSection focused={focusedSection === PROMPT_MODEL_FOCUS} />

      <BlockedPromptModelsSection />

      <VoiceVendorSection focused={focusedSection === VOICE_VENDOR_FOCUS} />

      <UpdatesSection />
    </div>
  )
}
