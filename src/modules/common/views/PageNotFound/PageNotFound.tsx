import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'

import DoodleMagnifier from '@/modules/common/doodles/DoodleMagnifier'
import { usePageTitle } from '@/modules/common/hooks/usePageTitle'
import { Button } from '@/modules/common/ui/button'
import { HomeRoutes } from '@/modules/home/constants'

export function PageNotFound() {
  const { t } = useTranslation()

  usePageTitle(t('notFound.pageTitle'))

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center text-foreground">
      <DoodleMagnifier size={90} />
      <div className="space-y-2">
        <p className="font-handwritten text-2xl text-saffron">404</p>
        <h1 className="font-display text-3xl font-extrabold">
          {t('notFound.titulo')}
        </h1>
        <p className="mx-auto max-w-md font-body text-muted-foreground">
          {t('notFound.descripcion')}
        </p>
      </div>
      <Button
        asChild
        className="rounded-xl bg-saffron font-display font-bold text-charcoal hover:bg-saffron/90"
      >
        <Link to={HomeRoutes.home}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('notFound.volver')}
        </Link>
      </Button>
    </main>
  )
}
