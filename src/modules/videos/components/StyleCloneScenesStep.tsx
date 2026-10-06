import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Trash2 } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { cn } from '@/modules/common/utilities/cn'
import { StyleCloneCommentBox } from '@/modules/videos/components/StyleCloneCommentBox'
import { StyleCloneComparePair } from '@/modules/videos/components/StyleCloneComparePair'
import { StyleCloneViewer } from '@/modules/videos/components/StyleCloneViewer'
import {
  CUSTOM_STYLE_FIELD_CLASS,
  CUSTOM_STYLE_NAME_LIMIT,
} from '@/modules/videos/constants'
import type {
  StyleCloneResponse,
  StyleCloneSession,
} from '@/modules/videos/types/styleClone'

interface StyleCloneScenesStepProps {
  session: StyleCloneSession
  onRename: (name: string) => void
  onRespond: (response: StyleCloneResponse) => void
  onDiscard: () => void
}

// El paso de las escenas de prueba (ADR-0050, decisiones C1, C5 y C6), de
// arriba abajo: el nombre que propuso la IA (editable, es la cabecera del
// modal), las 4 clonaciones cada una al lado de la imagen que recrea, la caja
// «¿Qué ajustamos?» para rehacerlas y una fila con «Descartar» y «Aprobar y
// guardar». Todo entra en el modal sin desplazarse: nada tapa las escenas, y
// en una ventana baja las que se achican son las imágenes
// (STYLE_CLONE_SCENE_FRAME_CLASS).
export function StyleCloneScenesStep({
  session,
  onRename,
  onRespond,
  onDiscard,
}: StyleCloneScenesStepProps) {
  const { t } = useTranslation()
  // El nombre se edita acá y viaja a la sesión al salir de la caja: así un
  // nombre a medio escribir no se guarda en cada tecla.
  const [name, setName] = useState(session.name)
  // La escena abierta en la comparación en grande; null = cerrada.
  const [viewing, setViewing] = useState<number | null>(null)
  const viewed = session.scenes.find((scene) => scene.index === viewing)
  const drawnCount = session.scenes.filter((scene) => scene.path).length
  const canApprove = drawnCount > 0 && name.trim().length > 0

  const commitName = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== session.name) onRename(trimmed)
  }

  return (
    <div className="space-y-3">
      {/* La primera fila del modal, en el lugar del título. `pr-8` le deja su
          lugar a la X de cerrar. */}
      <div className="flex items-center gap-3 pr-8">
        <label
          htmlFor="style-clone-name"
          className="shrink-0 font-display text-base font-bold text-foreground"
        >
          {t('create.styleClone.nameLabel')}
        </label>
        <input
          id="style-clone-name"
          type="text"
          value={name}
          maxLength={CUSTOM_STYLE_NAME_LIMIT}
          onChange={(event) => setName(event.target.value)}
          onBlur={commitName}
          className={cn(
            CUSTOM_STYLE_FIELD_CLASS,
            'min-w-0 flex-1 font-body text-sm',
          )}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <h3 className="rounded-full bg-mint px-3 py-1 font-display text-xs font-bold text-white">
          {t('create.styleClone.scenesTitle')}
        </h3>
        <p className="font-body text-sm text-muted-foreground">
          {t('create.styleClone.scenesHint')}
        </p>
        {session.identity && session.choice && (
          <p className="font-body text-xs text-muted-foreground lg:ml-auto">
            {t('create.styleClone.characterNote', {
              name: session.identity.name || name,
              travel: t(
                session.choice.travel === 'photo'
                  ? 'create.styleClone.travelPhoto'
                  : 'create.styleClone.travelText',
              ),
            })}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {session.scenes.map((scene) => (
          <StyleCloneComparePair
            key={scene.index}
            scene={scene}
            working={false}
            onOpen={() => setViewing(scene.index)}
            onRetry={() =>
              onRespond({
                kind: 'redraw',
                target: 'scenes',
                indexes: [scene.index],
              })
            }
          />
        ))}
      </div>

      <StyleCloneCommentBox
        id="style-clone-scenes-comment"
        placeholder={t('create.styleClone.adjustScenesPlaceholder')}
        hint={
          session.identity
            ? t('create.styleClone.adjustScenesHintCharacter')
            : t('create.styleClone.adjustScenesHint')
        }
        disabled={false}
        onSend={(comment) => onRespond({ kind: 'adjust-scenes', comment })}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" size="sm" variant="ghost" onClick={onDiscard}>
          <Trash2 className="mr-2 h-4 w-4" />
          {t('create.styleClone.discard')}
        </Button>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <p className="font-body text-xs text-muted-foreground">
            {t(
              session.target === 'catalog'
                ? 'create.styleClone.approveHintCatalog'
                : 'create.styleClone.approveHint',
            )}
          </p>
          <Button
            type="button"
            disabled={!canApprove}
            onClick={() => {
              commitName()
              onRespond({ kind: 'approve' })
            }}
          >
            <Check className="mr-2 h-4 w-4" />
            {t(
              session.target === 'catalog'
                ? 'create.styleClone.approveCatalog'
                : 'create.styleClone.approve',
            )}
          </Button>
        </div>
      </div>

      {viewed && (
        <StyleCloneViewer scene={viewed} onClose={() => setViewing(null)} />
      )}
    </div>
  )
}
