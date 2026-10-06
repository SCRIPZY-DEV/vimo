import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Check } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { cn } from '@/modules/common/utilities/cn'
import { videosApi } from '@/modules/videos/api'
import { StyleCloneCommentBox } from '@/modules/videos/components/StyleCloneCommentBox'
import { StyleCloneImage } from '@/modules/videos/components/StyleCloneImage'
import { StyleCloneTestImage } from '@/modules/videos/components/StyleCloneTestImage'
import { styleCloneOriginImageOf } from '@/modules/videos/utilities/styleCloneView'
import type {
  StyleCloneResponse,
  StyleCloneSession,
} from '@/modules/videos/types/styleClone'
import type { StyleCloneCharacterTravel } from '@pipeline/types/style-clone.ts'

interface StyleCloneCharacterStepProps {
  session: StyleCloneSession
  onRespond: (response: StyleCloneResponse) => void
}

// Las dos formas en que el personaje clonado viaja en los videos, con la
// clave de su título y de su explicación (decisión C3).
const TRAVEL_OPTIONS: {
  id: StyleCloneCharacterTravel
  titleKey: string
  hintKey: string
}[] = [
  {
    id: 'text',
    titleKey: 'create.styleClone.travelText',
    hintKey: 'create.styleClone.travelTextHint',
  },
  {
    id: 'photo',
    titleKey: 'create.styleClone.travelPhoto',
    hintKey: 'create.styleClone.travelPhotoHint',
  },
]

// El paso del personaje (ADR-0050, decisiones C2 y C3): el personaje tal como
// se ve en el original, los 3 diseños que propone la IA (el 1 es la réplica),
// un comentario para rehacerlos y, elegido uno, cómo va a viajar en los videos.
// «Probar escenas» manda la elección: las escenas se dibujan de esa forma.
export function StyleCloneCharacterStep({
  session,
  onRespond,
}: StyleCloneCharacterStepProps) {
  const { t } = useTranslation()
  // Con destino catálogo el personaje viaja solo como identidad de prompt: su
  // ficha queda como el personaje fijo de la gema (una foto no cabe en una
  // gema), así que no se pregunta.
  const forCatalog = session.target === 'catalog'
  const travelOptions = forCatalog
    ? TRAVEL_OPTIONS.filter((travelOption) => travelOption.id === 'text')
    : TRAVEL_OPTIONS
  const [option, setOption] = useState<number | null>(null)
  const [travel, setTravel] = useState<StyleCloneCharacterTravel | null>(
    forCatalog ? 'text' : null,
  )
  const original = styleCloneOriginImageOf(
    session.material,
    session.characterIn,
  )
  const canContinue = option !== null && travel !== null

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-display text-base font-bold text-foreground">
          {t('create.styleClone.characterTitle')}
        </h3>
        <p className="font-body text-sm text-muted-foreground">
          {t('create.styleClone.characterHint')}
        </p>
      </div>

      {original && (
        <figure className="mx-auto max-w-sm overflow-hidden rounded-xl border border-border bg-muted">
          <StyleCloneImage
            image={original}
            alt={t('create.styleClone.characterOriginal')}
            className="aspect-video w-full"
          />
          <figcaption className="px-3 py-1.5 font-body text-xs text-muted-foreground">
            {t('create.styleClone.characterOriginal')}
          </figcaption>
        </figure>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {session.designs.map((design) => {
          const chosen = option === design.index
          const label = t(
            design.index === 1
              ? 'create.styleClone.designReplica'
              : 'create.styleClone.designVariant',
            { number: design.index },
          )
          return (
            <div
              key={design.index}
              className={cn(
                'overflow-hidden rounded-xl border-2 bg-card transition-colors',
                chosen
                  ? 'border-saffron shadow-md shadow-saffron/20'
                  : 'border-border',
              )}
            >
              <div className="aspect-video bg-white">
                <StyleCloneTestImage
                  test={design}
                  alt={label}
                  working={false}
                  fit="contain"
                  onRetry={() =>
                    onRespond({
                      kind: 'redraw',
                      target: 'designs',
                      indexes: [design.index],
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <p className="truncate font-display text-xs font-bold text-foreground">
                  {label}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant={chosen ? 'default' : 'outline'}
                  disabled={!design.path}
                  onClick={() => setOption(design.index)}
                >
                  {chosen && <Check className="mr-1.5 h-3.5 w-3.5" />}
                  {chosen
                    ? t('create.styleClone.designChosen')
                    : t('create.styleClone.designChoose')}
                </Button>
              </div>
              {design.errorCode && !design.path && (
                <p
                  role="alert"
                  className="px-3 pb-2 font-body text-[11px] text-muted-foreground"
                >
                  {t(videosApi.styleCloneErrorKey(design.errorCode))}
                </p>
              )}
            </div>
          )
        })}
      </div>

      <StyleCloneCommentBox
        id="style-clone-character-comment"
        placeholder={t('create.styleClone.adjustCharacterPlaceholder')}
        hint={t('create.styleClone.adjustCharacterHint')}
        disabled={false}
        onSend={(comment) => onRespond({ kind: 'adjust-character', comment })}
      />

      {option !== null && (
        <div className="space-y-2">
          <p className="font-display text-sm font-bold text-foreground">
            {t('create.styleClone.travelQuestion')}
          </p>
          {forCatalog && (
            <p className="font-body text-xs text-muted-foreground">
              {t('create.styleClone.travelCatalogHint')}
            </p>
          )}
          <div
            role="radiogroup"
            aria-label={t('create.styleClone.travelAria')}
            className="grid grid-cols-1 gap-2 sm:grid-cols-2"
          >
            {travelOptions.map((travelOption) => {
              const chosen = travel === travelOption.id
              return (
                <button
                  key={travelOption.id}
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  onClick={() => setTravel(travelOption.id)}
                  className={cn(
                    'cursor-pointer rounded-xl border-2 px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-saffron/50',
                    chosen
                      ? 'border-saffron bg-saffron/10'
                      : 'border-border hover:border-saffron/60',
                  )}
                >
                  <span className="block font-display text-sm font-bold text-foreground">
                    {t(travelOption.titleKey)}
                  </span>
                  <span className="mt-0.5 block font-body text-xs leading-snug text-muted-foreground">
                    {t(travelOption.hintKey)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          disabled={!canContinue}
          onClick={() => {
            if (option === null || travel === null) return
            onRespond({ kind: 'choose-character', option, travel })
          }}
        >
          {t('create.styleClone.tryScenes')}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
