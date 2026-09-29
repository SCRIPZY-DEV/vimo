import { useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  Clapperboard,
  Images,
  ListChecks,
  Link2,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/modules/common/ui/button'
import { cn } from '@/modules/common/utilities/cn'
import { EditorImageGalleryCard } from '@/modules/videos/components/EditorImageGalleryCard'
import { AnimationPairingNotice } from '@/modules/videos/components/AnimationPairingNotice'
import { galleryAnimationPlan } from '@/modules/videos/utilities/galleryAnimationPlan'
import { useGalleryActions } from '@/modules/videos/hooks/useGalleryActions'
import type { GalleryActionsOptions } from '@/modules/videos/types/galleryActions'

// La galería conserva sus borradores; las generaciones pertenecen al almacén del
// editor y siguen su curso cuando se cierra esta ventana.
export function EditorImageGallery(options: GalleryActionsOptions) {
  const { scenes, videoFormat, durationSeconds } = options
  const { t } = useTranslation()
  const actions = useGalleryActions(options)
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [editingSceneId, setEditingSceneId] = useState<number | null>(null)
  const [editingSelection, setEditingSelection] = useState(false)
  const [descriptions, setDescriptions] = useState<Record<number, string>>({})
  const triggerRef = useRef<HTMLInputElement>(null)
  const submissionRef = useRef(false)

  const selection = scenes
    .filter((scene) => selectedIds.includes(scene.id))
    .map((scene) => scene.id)
  const imageAvailability = actions.imageAvailability(selection)
  const animationAvailability = actions.animationAvailability(selection)
  const animationLabels = selection.map((id) => actions.getAnimationLabel(id))
  const animationSelection = selectedAnimationScenes()
  const animationPlan = open
    ? galleryAnimationPlan(scenes, animationSelection, {
        videoFormat,
        durationSeconds,
      })
    : undefined
  const projectPlan = open
    ? galleryAnimationPlan(
        scenes,
        scenes.map((scene) => scene.id),
        { videoFormat, durationSeconds },
      )
    : undefined
  const hasShortPairs =
    videoFormat === '16:9' &&
    projectPlan?.units.some((unit) => {
      return (
        unit.strategy === 'merge' &&
        unit.sceneIds.length === 2 &&
        unit.sceneIds.every((id) => {
          const scene = scenes.find((candidate) => candidate.id === id)
          return (
            scene?.startSeconds !== undefined &&
            scene.endSeconds !== undefined &&
            Math.round((scene.endSeconds - scene.startSeconds) * 1000) === 3000
          )
        })
      )
    })

  function selectedAnimationScenes() {
    if (selecting) return selection
    if (selectedId === null) return []
    return [selectedId]
  }

  function selectionAnimationLabel() {
    if (animationLabels.includes('redo'))
      return 'library.editor.imageGallery.animateRedoSelection'

    if (
      animationLabels.length > 0 &&
      animationLabels.every((label) => label === 'resume')
    )
      return 'library.editor.imageGallery.resumeSelection'

    return 'library.editor.imageGallery.animateSelection'
  }

  // El cambio guardado pendiente se revisa también desde la galería. Un
  // borrador local explícito, incluso vacío, tiene prioridad sobre el disco.
  function sceneDescription(sceneId: number): string {
    const draft = descriptions[sceneId]
    if (draft !== undefined) return draft

    const scene = scenes.find((item) => item.id === sceneId)
    if (scene?.userPromptPending) return scene.userPrompt ?? ''

    return ''
  }

  function clearSelection() {
    setSelectedIds([])
    setSelectedId(null)
    setSelecting(false)
    setEditingSceneId(null)
    setEditingSelection(false)
  }

  async function regenerate(sceneIds: number[]) {
    if (submissionRef.current || sceneIds.length === 0) return
    submissionRef.current = true
    const requests = sceneIds.map((id) => ({
      id,
      description: sceneDescription(id),
    }))
    try {
      if (!(await actions.regenerate(requests))) return
      setDescriptions((current) => {
        const next = { ...current }
        for (const request of requests) {
          if ((current[request.id] ?? '') === request.description)
            delete next[request.id]
        }
        return next
      })
      clearSelection()
    } finally {
      submissionRef.current = false
    }
  }

  async function animate(sceneIds: number[]) {
    if (submissionRef.current || sceneIds.length === 0) return
    submissionRef.current = true
    try {
      if (await actions.animate(sceneIds)) clearSelection()
    } finally {
      submissionRef.current = false
    }
  }

  async function undo(sceneId: number) {
    if (submissionRef.current) return
    submissionRef.current = true
    try {
      if (!(await actions.undo(sceneId))) return
      setEditingSceneId(null)
      setEditingSelection(false)
    } finally {
      submissionRef.current = false
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <label className="ml-auto flex cursor-pointer items-center gap-2 rounded-xl border border-saffron/40 bg-saffron/5 px-3 py-2 font-body text-xs transition-colors hover:bg-saffron/10">
        <input
          ref={triggerRef}
          type="checkbox"
          checked={open}
          disabled={scenes.length === 0}
          onChange={(event) => setOpen(event.target.checked)}
          aria-haspopup="dialog"
          className="h-4 w-4 accent-saffron"
        />
        <Images aria-hidden className="h-4 w-4 text-saffron" />
        {t('library.editor.imageGallery.label')}
      </label>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[calc(100vw-2rem)] max-w-7xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border-2 border-border bg-background shadow-2xl outline-none"
          onKeyDown={(event) => event.stopPropagation()}
          onEscapeKeyDown={(event) => event.stopPropagation()}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            triggerRef.current?.focus({ preventScroll: true })
          }}
        >
          <div className="flex shrink-0 items-start gap-3 border-b border-border p-5 sm:p-6">
            <div className="rounded-xl bg-saffron/15 p-2.5 text-saffron">
              <Images aria-hidden className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <Dialog.Title className="font-display text-lg font-extrabold">
                {t('library.editor.imageGallery.label')}
              </Dialog.Title>
              <Dialog.Description className="font-body text-sm text-muted-foreground">
                {t('library.editor.imageGallery.description', {
                  count: scenes.length,
                })}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={t('library.editor.imageGallery.close')}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron"
              >
                <X aria-hidden className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-5 py-3 sm:px-6">
            <Button
              type="button"
              size="sm"
              variant={selecting ? 'default' : 'outline'}
              aria-pressed={selecting}
              disabled={actions.submitting}
              onClick={() => {
                setSelecting(!selecting)
                setSelectedIds([])
                setSelectedId(null)
                setEditingSelection(false)
                setEditingSceneId(null)
              }}
              className="rounded-xl font-display text-xs font-bold"
            >
              <ListChecks aria-hidden className="mr-1.5 h-4 w-4" />
              {t(
                selecting
                  ? 'library.editor.imageGallery.cancelSelection'
                  : 'library.editor.imageGallery.selectMultiple',
              )}
            </Button>
            <p className="font-body text-xs text-muted-foreground">
              {t(
                selecting
                  ? 'library.editor.imageGallery.selectionHint'
                  : 'library.editor.imageGallery.browseHint',
              )}
            </p>
          </div>
          {(hasShortPairs ||
            animationPlan?.units.some((unit) => unit.strategy === 'merge')) && (
            <div className="shrink-0 space-y-2 border-b border-border px-5 py-3 sm:px-6">
              {hasShortPairs && (
                <p className="flex items-start gap-2 font-body text-xs leading-relaxed text-muted-foreground">
                  <Link2
                    aria-hidden
                    className="mt-0.5 h-4 w-4 shrink-0 text-sky"
                  />
                  {t('library.editor.imageGallery.shortPairHint')}
                </p>
              )}
              <AnimationPairingNotice
                units={animationPlan?.units ?? []}
                selectedSceneIds={animationSelection}
              />
            </div>
          )}
          {actions.errorKey && (
            <p
              role="alert"
              className="mx-5 mt-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 font-body text-xs text-destructive sm:mx-6"
            >
              {t(actions.errorKey)}
            </p>
          )}
          <div
            className="min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6"
            data-gallery-scroll
          >
            <div
              className={cn(
                'grid auto-rows-fr items-stretch gap-4',
                videoFormat === '9:16'
                  ? 'grid-cols-1 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-5'
                  : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-5',
              )}
            >
              {scenes.map((scene) => {
                const selected = selecting
                  ? selection.includes(scene.id)
                  : selectedId === scene.id
                const editing =
                  selected &&
                  actions.getUndoSceneCount(scene.id) === 0 &&
                  (selecting ? editingSelection : editingSceneId === scene.id)
                return (
                  <EditorImageGalleryCard
                    key={scene.id}
                    scene={scene}
                    videoFormat={videoFormat}
                    version={actions.task?.sceneVersions[scene.id]}
                    status={actions.task?.sceneStatus[scene.id]}
                    imageError={actions.task?.sceneErrors[scene.id]}
                    animationActivity={
                      actions.task?.sceneAnimationStatus[scene.id]
                    }
                    animationProgress={
                      actions.task?.sceneAnimationProgress[scene.id]
                    }
                    animationError={
                      actions.task?.sceneAnimationErrors[scene.id]
                    }
                    animationLabel={actions.getAnimationLabel(scene.id)}
                    undoSceneCount={actions.getUndoSceneCount(scene.id)}
                    undoing={actions.undoingSceneId === scene.id}
                    undoAvailability={actions.undoAvailability(scene.id)}
                    imageAvailability={
                      selected
                        ? actions.imageAvailability([scene.id])
                        : { disabled: false }
                    }
                    animationAvailability={
                      selected
                        ? actions.animationAvailability([scene.id])
                        : { disabled: false }
                    }
                    selected={selected}
                    selecting={selecting}
                    editing={editing}
                    focusPrompt={
                      editing && (!selecting || scene.id === selection[0])
                    }
                    description={sceneDescription(scene.id)}
                    submitting={actions.submitting}
                    onSelect={() => {
                      if (submissionRef.current) return
                      if (!selecting) {
                        setSelectedId(scene.id)
                        return
                      }
                      setSelectedIds((current) => {
                        if (current.includes(scene.id))
                          return current.filter((id) => id !== scene.id)
                        return [...current, scene.id]
                      })
                    }}
                    onEdit={() => setEditingSceneId(scene.id)}
                    onCancelEdit={() => setEditingSceneId(null)}
                    onDescriptionChange={(description) =>
                      setDescriptions((current) => ({
                        ...current,
                        [scene.id]: description,
                      }))
                    }
                    onRegenerate={() => void regenerate([scene.id])}
                    onAnimate={() => void animate([scene.id])}
                    onUndo={() => void undo(scene.id)}
                  />
                )
              })}
            </div>
          </div>
          {selecting && (
            <div className="shrink-0 space-y-2 border-t border-border bg-card px-5 py-3 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p role="status" className="font-display text-sm font-bold">
                  {t('library.editor.imageGallery.selectedCount', {
                    count: selection.length,
                  })}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {editingSelection && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={actions.submitting}
                      onClick={() => setEditingSelection(false)}
                      className="rounded-xl font-body text-xs"
                    >
                      {t('library.editor.imageGallery.closeDescriptions')}
                    </Button>
                  )}
                  <Button
                    type="button"
                    disabled={
                      selection.length === 0 ||
                      actions.submitting ||
                      imageAvailability.disabled
                    }
                    onClick={() => {
                      if (editingSelection) {
                        void regenerate(selection)
                        return
                      }
                      setEditingSelection(true)
                    }}
                    title={
                      imageAvailability.reason
                        ? t(imageAvailability.reason)
                        : undefined
                    }
                    className="btn-squish rounded-xl bg-saffron font-display text-xs font-bold text-midnight hover:bg-saffron/90"
                  >
                    {actions.submitting ? (
                      <Loader2
                        aria-hidden
                        className="mr-1.5 h-4 w-4 animate-spin"
                      />
                    ) : (
                      <RefreshCw aria-hidden className="mr-1.5 h-4 w-4" />
                    )}
                    {t(
                      editingSelection
                        ? 'library.editor.imageGallery.regenerateCount'
                        : 'library.editor.imageGallery.regenerateImages',
                      { count: selection.length },
                    )}
                  </Button>
                  <Button
                    type="button"
                    disabled={
                      selection.length === 0 ||
                      actions.submitting ||
                      editingSelection ||
                      animationAvailability.disabled
                    }
                    onClick={() => void animate(selection)}
                    title={
                      animationAvailability.reason
                        ? t(animationAvailability.reason)
                        : undefined
                    }
                    className="btn-squish rounded-xl bg-sky font-display text-xs font-bold text-white hover:bg-sky/90"
                  >
                    <Clapperboard aria-hidden className="mr-1.5 h-4 w-4" />
                    {t(selectionAnimationLabel())}
                  </Button>
                </div>
              </div>
              {editingSelection && (
                <p className="font-body text-xs text-muted-foreground">
                  {t('library.editor.imageGallery.imagesFirst')}
                </p>
              )}
              {selection.length > 0 &&
                [
                  imageAvailability.reason,
                  !editingSelection ? animationAvailability.reason : undefined,
                ]
                  .filter((reason): reason is string => Boolean(reason))
                  .filter(
                    (reason, index, reasons) =>
                      reasons.indexOf(reason) === index,
                  )
                  .map((reason) => (
                    <p
                      key={reason}
                      className="font-body text-xs text-muted-foreground"
                    >
                      {t(reason)}
                    </p>
                  ))}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
