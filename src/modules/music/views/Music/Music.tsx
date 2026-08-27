import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Loader2, Music2, RotateCcw, Sparkles, X } from 'lucide-react'
import { LabeledProgress } from '@/modules/common/components/LabeledProgress'
import DoodleMusicNote from '@/modules/common/doodles/DoodleMusicNote'
import { usePageTitle } from '@/modules/common/hooks/usePageTitle'
import { Button } from '@/modules/common/ui/button'
import { Input } from '@/modules/common/ui/input'
import { Label } from '@/modules/common/ui/label'
import { cn } from '@/modules/common/utilities/cn'
import { ApiKeysRoutes } from '@/modules/api-keys/constants'
import { useRequiredApiKeys } from '@/modules/api-keys/hooks/useRequiredApiKeys'
import { musicApi } from '@/modules/music/api'
import { MusicForm } from '@/modules/music/components/MusicForm'
import { musicFormToParams } from '@/modules/music/utilities/formParams'
import { MusicAudioPlayer } from '@/modules/music/components/MusicAudioPlayer'
import { MusicCreditsBadge } from '@/modules/music/components/MusicCreditsBadge'
import { MusicHistoryPanel } from '@/modules/music/components/MusicHistoryPanel'
import { MusicOptionCard } from '@/modules/music/components/MusicOptionCard'
import { MusicPromptSuggester } from '@/modules/music/components/MusicPromptSuggester'
import {
  CREDITS_SETTLE_DELAY_MS,
  MUSIC_FORM_INITIAL_VALUE,
  NAME_LIMIT,
  musicQueryKeys,
} from '@/modules/music/constants'
import { useMusicTask } from '@/modules/music/hooks/useMusicTask'

export function Music() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const {
    isNative,
    missingProviders,
    isLoading: keysLoading,
  } = useRequiredApiKeys({ providers: ['evolink'] })
  const { task, startGeneration, chooseOption, regenerate, discardTask } =
    useMusicTask()

  const [formValue, setFormValue] = useState(MUSIC_FORM_INITIAL_VALUE)
  const [name, setName] = useState('')

  usePageTitle(t('music.pageTitle'))

  const generating = task?.status === 'generating'
  const choosing = task?.status === 'choosing'
  const options =
    task?.status === 'readyToChoose' || task?.status === 'choosing'
      ? task.options
      : null
  const chosenEntry = task?.status === 'completed' ? task.chosenEntry : null
  const errorKey = task?.errorKey ?? null
  const missingEvolinkKey =
    isNative && !keysLoading && missingProviders.length > 0

  // Evolink descuenta créditos de forma asíncrona al completar la task: se
  // refresca el saldo al llegar las opciones y otra vez unos segundos después.
  const status = task?.status
  useEffect(() => {
    if (status !== 'readyToChoose' && status !== 'completed') return undefined
    void queryClient.invalidateQueries({ queryKey: musicQueryKeys.credits })
    if (status === 'completed')
      void queryClient.invalidateQueries({ queryKey: musicQueryKeys.history })
    const timer = setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: musicQueryKeys.credits })
    }, CREDITS_SETTLE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [status, queryClient])

  const generate = () => {
    void startGeneration(musicFormToParams(formValue))
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-8 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3">
          <DoodleMusicNote size={48} delay={100} />
          <div>
            <h1 className="font-display text-3xl font-extrabold text-foreground">
              {t('music.titulo')}
            </h1>
            <p className="font-handwritten text-lg text-muted-foreground">
              {t('music.tagline')}
            </p>
          </div>
        </div>
        <MusicCreditsBadge />
      </motion.div>

      {!isNative && (
        <p className="font-body text-sm text-saffron">
          {t('music.soloEscritorio')}
        </p>
      )}

      {missingEvolinkKey && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between gap-3 rounded-2xl border-2 border-coral/40 bg-coral/10 p-4"
        >
          <p className="font-body text-sm text-foreground">
            {t('music.faltaClave')}
          </p>
          <Button
            asChild
            size="sm"
            className="shrink-0 rounded-lg font-display"
          >
            <Link to={ApiKeysRoutes.apiKeys}>{t('music.irAClaves')}</Link>
          </Button>
        </motion.div>
      )}

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className={cn(
          'space-y-4 rounded-2xl border-2 border-saffron/30 bg-saffron/5 p-6',
          (!isNative || missingEvolinkKey) && 'pointer-events-none opacity-60',
        )}
      >
        <div className="space-y-1.5">
          <Label htmlFor="music-name" className="font-display">
            {t('music.nombre.label')}
          </Label>
          <Input
            id="music-name"
            value={name}
            maxLength={NAME_LIMIT}
            disabled={generating}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('music.nombre.placeholder')}
          />
          <p className="font-body text-xs text-muted-foreground">
            {t('music.nombre.hint')}
          </p>
        </div>

        <MusicPromptSuggester
          disabled={generating}
          onSuggested={(prompt) => setFormValue({ ...formValue, prompt })}
        />

        <MusicForm
          value={formValue}
          onChange={setFormValue}
          disabled={generating}
        />

        <div className="flex items-center gap-2">
          <Button
            size="lg"
            onClick={generate}
            disabled={generating || !formValue.prompt.trim()}
            className="rounded-xl bg-saffron font-display font-bold text-charcoal hover:bg-saffron/90"
          >
            {generating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {generating ? t('music.generando') : t('music.generar')}
          </Button>
          {generating && (
            <Button
              variant="ghost"
              size="lg"
              onClick={discardTask}
              className="rounded-xl font-display text-muted-foreground"
            >
              <X className="mr-1.5 h-4 w-4" />
              {t('music.cancelar')}
            </Button>
          )}
        </div>

        {generating && task && (
          <div className="space-y-2">
            <LabeledProgress
              className="space-y-2"
              label={
                task.elapsedSeconds !== null
                  ? t('music.progresoSegundos', {
                      seconds: task.elapsedSeconds,
                    })
                  : t('music.generando')
              }
              percent={task.progressPercent}
            />
            {task.estimatedCredits !== null && task.estimatedCredits > 0 && (
              <p className="font-body text-xs text-muted-foreground">
                {t('music.creditosEstimados', { n: task.estimatedCredits })}
              </p>
            )}
          </div>
        )}

        {errorKey && (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 font-body text-sm text-destructive">
            {t(errorKey, { seconds: task?.errorSeconds ?? 0 })}
          </p>
        )}
      </motion.section>

      {options && options.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div>
            <h2 className="font-display text-xl font-extrabold text-foreground">
              {t('music.chooser.titulo')}
            </h2>
            <p className="font-body text-sm text-muted-foreground">
              {t('music.chooser.sub', { n: options.length })}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {options.map((option, index) => (
              <MusicOptionCard
                key={`${option.audioUrl}-${index}`}
                option={option}
                index={index + 1}
                choosing={choosing}
                isChosen={task?.chosenOption?.audioUrl === option.audioUrl}
                onChoose={(chosen) =>
                  void chooseOption(chosen, name || undefined)
                }
              />
            ))}
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="font-body text-xs text-muted-foreground">
              {t('music.chooser.nota')}
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={generating || choosing}
              onClick={() => void regenerate()}
              className="rounded-lg font-display"
            >
              <RotateCcw className="mr-1.5 h-4 w-4" />
              {t('music.chooser.regenerar')}
            </Button>
          </div>
        </motion.section>
      )}

      {chosenEntry && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4 rounded-2xl border-2 border-border bg-card p-6 shadow-card"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-extrabold text-foreground">
              {t('music.resultado.titulo')}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={discardTask}
              className="rounded-lg font-display text-muted-foreground"
            >
              <X className="mr-1.5 h-4 w-4" />
              {t('music.resultado.cerrar')}
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-saffron/20">
              <Music2 className="h-6 w-6 text-saffron" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-bold text-foreground">
                {chosenEntry.name ??
                  chosenEntry.title ??
                  t('music.historial.sinTitulo')}
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                {chosenEntry.model}
              </p>
            </div>
          </div>
          <MusicAudioPlayer src={musicApi.audioSource(chosenEntry.audioPath)} />
          <p className="font-body text-xs text-muted-foreground">
            {t('music.resultado.guardada')}
          </p>
        </motion.section>
      )}

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <MusicHistoryPanel />
      </motion.div>
    </div>
  )
}
