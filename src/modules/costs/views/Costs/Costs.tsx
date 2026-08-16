import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/modules/common/ui/tabs'
import DoodleCoin from '@/modules/common/doodles/DoodleCoin'
import DoodleLightbulb from '@/modules/common/doodles/DoodleLightbulb'
import { usePageTitle } from '@/modules/common/hooks/usePageTitle'
import { CostFilters } from '../../components/CostFilters'
import { FullVideoCostTable } from '../../components/FullVideoCostTable'
import { ImageCostTable } from '../../components/ImageCostTable'
import { MusicCostTable } from '../../components/MusicCostTable'
import { VoiceCostTable } from '../../components/VoiceCostTable'
import type { CostFilter, CostTab } from '../../types/costs'

export function Costs() {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<CostFilter>('cheapest')
  const [tab, setTab] = useState<CostTab>('video')

  usePageTitle(t('costs.pageTitle'))

  const titleByTab: Record<CostTab, string> = {
    video: t('costs.tituloVideo'),
    images: t('costs.tituloImagenes'),
    voices: t('costs.tituloVoces'),
    music: t('costs.tituloMusica'),
  }
  const subtitleByTab: Record<CostTab, string> = {
    video: t('costs.subtituloVideo'),
    images: t('costs.subtituloImagenes'),
    voices: t('costs.subtituloVoces'),
    music: t('costs.subtituloMusica'),
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex items-start gap-3 rounded-xl border border-saffron/30 bg-saffron/5 px-4 py-3">
        <DoodleLightbulb size={32} delay={50} className="shrink-0" />
        <p className="font-body text-sm leading-relaxed text-muted-foreground">
          {t('costs.disclaimer')}
        </p>
      </div>

      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex items-center gap-3"
      >
        <DoodleCoin size={56} delay={150} />
        <div>
          <h1 className="font-display text-3xl font-extrabold leading-tight text-foreground">
            {titleByTab[tab]}
          </h1>
          <p className="font-handwritten text-lg text-muted-foreground">
            {subtitleByTab[tab]}
          </p>
        </div>
      </motion.div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as CostTab)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            <TabsTrigger value="video">{t('costs.tabVideo')}</TabsTrigger>
            <TabsTrigger value="images">{t('costs.tabImagenes')}</TabsTrigger>
            <TabsTrigger value="voices">{t('costs.tabVoces')}</TabsTrigger>
            <TabsTrigger value="music">{t('costs.tabMusica')}</TabsTrigger>
          </TabsList>
          <CostFilters active={filter} onChange={setFilter} />
        </div>

        <TabsContent value="video" className="mt-4">
          <FullVideoCostTable filter={filter} />
          <p className="mt-3 px-1 font-handwritten text-sm text-muted-foreground">
            {t('costs.notaVideo')}
          </p>
        </TabsContent>

        <TabsContent value="images" className="mt-4">
          <ImageCostTable filter={filter} />
          <p className="mt-3 px-1 font-handwritten text-sm text-muted-foreground">
            {t('costs.notaImagenes')}
          </p>
        </TabsContent>

        <TabsContent value="voices" className="mt-4">
          <VoiceCostTable />
        </TabsContent>

        <TabsContent value="music" className="mt-4">
          <MusicCostTable />
        </TabsContent>
      </Tabs>
    </div>
  )
}
