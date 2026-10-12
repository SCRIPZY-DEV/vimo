import { FLOW_TOOLS_EXECUTION_PLAN } from '@/modules/common/constants'
import type { FlowRestartRequest } from '@/modules/common/types/flow'
import { FLOW_RESULT_RECOVERY_KEYS } from '@/modules/common/constants'
import { useFlowCapacity } from '@/modules/common/hooks/useFlowCapacity'
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Loader2, Sparkles } from 'lucide-react'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { useAccessFeature } from '@/modules/common/hooks/useAccessFeature'
import { useImageCredits } from '@/modules/common/hooks/useImageCredits'
import { Button } from '@/modules/common/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/modules/common/ui/dialog'
import { useRequiredApiKeys } from '@/modules/api-keys/hooks/useRequiredApiKeys'
import { charactersApi } from '@/modules/characters/api'
import { CharacterIdentityTabs } from '@/modules/characters/components/CharacterIdentityTabs'
import { CharacterPhotoFields } from '@/modules/characters/components/CharacterPhotoFields'
import { CharacterPreviewPanel } from '@/modules/characters/components/CharacterPreviewPanel'
import { CharacterProfileFields } from '@/modules/characters/components/CharacterProfileFields'
import {
  CHARACTER_FORM_INITIAL_VALUE,
  DEFAULT_PREVIEW_PROVIDER,
  MIN_DESCRIPTION_LENGTH,
  PREVIEW_STYLES,
} from '@/modules/characters/constants'
import { useCharacterMutations } from '@/modules/characters/hooks/useCharacterMutations'
import { useCharacterPreview } from '@/modules/characters/hooks/useCharacterPreview'
import { useCustomStyleCatalog } from '@/modules/characters/hooks/useCustomStyleCatalog'
import { useDesignStyleCharacter } from '@/modules/characters/hooks/useDesignStyleCharacter'
import { useSuggestCharacterProfile } from '@/modules/characters/hooks/useSuggestCharacterProfile'
import {
  toFormValue,
  toPreviewViews,
} from '@/modules/characters/utilities/characterDraft'
import { identitySourceOf } from '@/modules/characters/utilities/identitySourceOf'
import { previewShortfallLine } from '@/modules/characters/utilities/previewShortfallLine'
import { styleDesignGemOf } from '@/modules/characters/utilities/styleDesignGem'
import type { CharacterSummary } from '@pipeline/types/characters.ts'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'
import type {
  CharacterIdentitySource,
  CharacterStyleContext,
  PreviewStyleOption,
  PreviewView,
} from '@/modules/characters/types/characters'

interface CharacterModalProps {
  character: CharacterSummary | null
  // Desde Create con «Mi estilo»: la ficha la diseña la gema del usuario con
  // el guion como contexto (design-style-character) en vez del experto de la
  // casa. Ausente = el flujo de la biblioteca de siempre.
  styleContext?: CharacterStyleContext
  script?: string
  // Con qué sub-pestaña arranca al crear (la pestaña activa de quien lo abre).
  initialSource?: CharacterIdentitySource
  onSaved?: (character: CharacterSummary) => void
  onClose: () => void
}

// Con guion de al menos 20 caracteres (mínimo del sidecar) la gema puede
// diseñar al protagonista.
const MIN_SCRIPT_LENGTH = 20

// Dos maneras de fijar la identidad (ADR-0033): CON foto, la imagen subida es
// la identidad y no hay previews que generar; SIN foto, la descripción es la
// identidad y el panel de previews muestra cómo saldría por estilo. Al crear
// lo elige la sub-pestaña; al editar lo decide el personaje (el modo no
// cambia; la foto sí se puede reemplazar).
export function CharacterModal({
  character,
  styleContext,
  script,
  initialSource,
  onSaved,
  onClose,
}: CharacterModalProps) {
  const { t } = useTranslation()
  // Interruptores del catálogo (configuración global, se leen acá): con los
  // dos encendidos el retrato de una gema del catálogo usa la sincronizada.
  const newCatalog = useAccessFeature('newCatalog')
  const remoteCatalog = useAccessFeature('remoteCatalog')
  const { createCharacter, updateCharacter, saving } = useCharacterMutations()
  const {
    suggestProfile,
    suggesting,
    errorKey: suggestErrorKey,
  } = useSuggestCharacterProfile()
  const {
    designWithStyle,
    designing,
    errorKey: designErrorKey,
  } = useDesignStyleCharacter()
  const preview = useCharacterPreview()
  const { styles: customStyles } = useCustomStyleCatalog()
  const credits = useImageCredits()

  const [form, setForm] = useState(() =>
    character ? toFormValue(character) : CHARACTER_FORM_INITIAL_VALUE,
  )
  const [previews, setPreviews] = useState<PreviewView[]>(() =>
    character ? toPreviewViews(character) : [],
  )
  // Desde Create con una gema el sentido es que ELLA diseñe al protagonista:
  // arranca en «sin foto»; en la biblioteca, la foto va primero como allá.
  const [source, setSource] = useState<CharacterIdentitySource>(
    initialSource ?? (styleContext ? 'text' : 'photo'),
  )
  const [photoPath, setPhotoPath] = useState<string | null>(
    character?.photoPath ?? null,
  )
  // Desde Create con «Mi estilo» el preview arranca en esa gema.
  const [styleId, setStyleId] = useState(
    styleContext?.styleId ?? PREVIEW_STYLES[0].id,
  )
  const [provider, setProvider] = useState<ImageProviderId>(
    DEFAULT_PREVIEW_PROVIDER,
  )
  const executionPlan = FLOW_TOOLS_EXECUTION_PLAN
  const [formErrorKey, setFormErrorKey] = useState<string | null>(null)

  const photoMode = character
    ? identitySourceOf(character) === 'photo'
    : source === 'photo'
  // La foto elegida al editar reemplaza a la guardada solo si es otra.
  const replacedPhoto =
    character && photoPath && photoPath !== character.photoPath
      ? photoPath
      : null

  // Catálogo + galería propia, con el texto ya resuelto para el panel.
  const libraryStyles: PreviewStyleOption[] = [
    ...PREVIEW_STYLES.map((style) => ({
      id: style.id,
      label: t(style.labelKey),
      custom: false,
    })),
    ...customStyles.map((style) => ({
      id: style.id,
      label: style.name,
      custom: true,
    })),
  ]
  // Un estilo del catálogo nuevo llega de Create con su nombre (`styleName`)
  // y no está en ninguna de las dos listas: se suma como uno propio (su
  // retrato también lo escribe la gema), para que su chip quede elegido, el
  // botón diga su nombre y el retrato generado lo lleve. Sin nombre no se
  // agrega nada: los 5 de siempre y la galería quedan como estaban, también
  // mientras la galería carga.
  const contextStyle =
    styleContext?.styleName &&
    !libraryStyles.some((style) => style.id === styleContext.styleId)
      ? {
          id: styleContext.styleId,
          label: styleContext.styleName,
          custom: true,
        }
      : null
  const previewStyles = contextStyle
    ? [...libraryStyles, contextStyle]
    : libraryStyles
  const isCustomStyle = !PREVIEW_STYLES.some((style) => style.id === styleId)

  const llmKeys = useRequiredApiKeys({ requirements: [['deepinfra']] })
  // Con estilo propio la gema escribe el prompt: hace falta también DeepInfra.
  const providerKeys = useRequiredApiKeys({
    requirements: [
      ...(provider === 'flow' ? [] : [[provider]]),
      ...(isCustomStyle ? [['deepinfra' as const]] : []),
    ],
  })

  const previewKeysReady =
    (provider === 'flow' && !isCustomStyle) || providerKeys.ready
  const flowCapacity = useFlowCapacity(1, provider === 'flow', {
    executionPlan,
  })
  const recoveringFlow =
    provider === 'flow' &&
    !!preview.errorKey &&
    FLOW_RESULT_RECOVERY_KEYS.has(preview.errorKey)

  const identity = form.description.trim()
  const identityReady = identity.length >= MIN_DESCRIPTION_LENGTH
  const contextScript = (styleContext?.script ?? script ?? '').trim()
  const withScript = contextScript.length >= MIN_SCRIPT_LENGTH
  // La gema que diseña al protagonista: una vieja como texto o una de
  // plantilla por secciones (ADR-0048). null = el experto de la casa.
  const styleGem = styleDesignGemOf(styleContext)
  const withStyle = styleGem !== null && withScript
  const busy = saving || suggesting || designing || preview.generating

  // Con texto ya escrito el botón lo dice claro: MEJORA ese texto; vacío,
  // crea desde el guion con el estilo (v1.21.0 del origen).
  const suggestLabelKey = !withStyle
    ? 'characters.experto.boton'
    : identity
      ? 'characters.experto.improve'
      : 'characters.experto.withStyle'

  const suggest = async () => {
    if (!llmKeys.ready) return
    const fields = {
      name: form.name,
      age: form.age,
      role: form.role,
      description: form.description,
      ...(withScript ? { script: contextScript } : {}),
    }
    const result = withStyle
      ? await designWithStyle({
          ...styleGem,
          script: styleContext!.script.trim(),
          ...(styleContext!.promptModel
            ? { promptModel: styleContext!.promptModel }
            : {}),
          ...fields,
        }).catch(() => null)
      : await suggestProfile(fields).catch(() => null)
    if (!result) return

    // Los campos que el usuario ya completó mandan; el resto se autocompleta.
    setForm((current) => ({
      name: current.name.trim() || (result.name ?? ''),
      age: current.age.trim() || (result.age ?? ''),
      role: current.role.trim() || (result.role ?? ''),
      description: result.prompt,
    }))
  }

  const generatePreview = async (restart?: FlowRestartRequest) => {
    if (!previewKeysReady) return
    if (
      provider === 'flow' &&
      !recoveringFlow &&
      !(await flowCapacity.verify())
    )
      return
    const dataUri = await preview.generate({
      identityPrompt: identity,
      styleId,
      provider,
      ...(provider === 'flow' && executionPlan ? { executionPlan } : {}),
      // Una gema del catálogo nuevo se lee del catálogo sincronizado solo con
      // el catálogo remoto encendido (ADR-0049): con él apagado nada cambia.
      ...(newCatalog && remoteCatalog ? { remote: true } : {}),
      ...restart,
    })
    if (!dataUri) return

    setPreviews((current) => [
      ...current.filter((item) => item.styleId !== styleId),
      { styleId, url: dataUri, isNew: true },
    ])
  }

  const pickPhoto = async () => {
    const selected = await charactersApi.pickPhotoFile()
    if (selected) setPhotoPath(selected)
  }

  const save = async () => {
    if (!form.name.trim()) {
      setFormErrorKey('characters.errors.nameRequired')
      return
    }
    if (photoMode && !character && !photoPath) {
      setFormErrorKey('characters.errors.photoRequired')
      return
    }
    if (!photoMode && !identityReady) {
      setFormErrorKey('characters.errors.descriptionTooShort')
      return
    }
    setFormErrorKey(null)

    const newPreviews = previews
      .filter((item) => item.isNew)
      .map((item) => ({ styleId: item.styleId, dataUri: item.url }))

    // Con foto no viajan edad, rol ni previews: la identidad es la imagen.
    const saved = character
      ? await updateCharacter(
          photoMode
            ? {
                id: character.id,
                name: form.name,
                description: identity,
                ...(replacedPhoto ? { photoPath: replacedPhoto } : {}),
              }
            : {
                id: character.id,
                name: form.name,
                description: identity,
                age: form.age,
                role: form.role,
                previews: newPreviews,
              },
        ).catch(() => null)
      : await createCharacter(
          photoMode
            ? { name: form.name, description: identity, photoPath: photoPath! }
            : {
                name: form.name,
                description: identity,
                age: form.age,
                role: form.role,
                previews: newPreviews,
              },
        ).catch(() => null)

    if (!saved) return
    onSaved?.(saved)
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            {character
              ? t('characters.modal.editar')
              : t('characters.modal.nuevo')}
          </DialogTitle>
          {/* El diseño del origen no lleva subtítulo; queda para lectores de
              pantalla, que Radix lo exige. */}
          <DialogDescription className="sr-only">
            {t('characters.modal.descripcion')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {!character && (
            <CharacterIdentityTabs
              value={source}
              disabled={busy}
              onChange={setSource}
            />
          )}

          {photoMode ? (
            <CharacterPhotoFields
              value={form}
              photoPath={photoPath}
              editing={character !== null}
              disabled={saving}
              onChange={setForm}
              onPickPhoto={() => void pickPhoto()}
            />
          ) : (
            <>
              <div className="flex items-start gap-2 rounded-lg border border-ocean/30 bg-ocean/10 p-2.5">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-ocean" />
                <p className="font-body text-xs leading-snug text-foreground">
                  <Trans
                    i18nKey="characters.identity.textNotice"
                    components={{ strong: <b /> }}
                  />
                </p>
              </div>

              <CharacterProfileFields
                value={form}
                disabled={busy}
                suggesting={suggesting || designing}
                canSuggest={llmKeys.ready}
                missingLlmKey={llmKeys.missingRequirements.length > 0}
                suggestFromScript={withScript}
                suggestLabelKey={suggestLabelKey}
                onChange={setForm}
                onSuggest={() => void suggest()}
              />

              {designErrorKey && (
                <ErrorMessage>{t(designErrorKey)}</ErrorMessage>
              )}
              {suggestErrorKey && (
                <ErrorMessage>{t(suggestErrorKey)}</ErrorMessage>
              )}

              <CharacterPreviewPanel
                previews={previews}
                styles={previewStyles}
                styleId={styleId}
                provider={provider}
                executionPlan={executionPlan}
                generating={preview.generating}
                phase={preview.phase}
                imageStatus={preview.imageStatus}
                percent={preview.hasProgress ? preview.percent : null}
                errorKey={preview.errorKey}
                disabled={saving || suggesting}
                missingProviderKey={providerKeys.missingRequirements.length > 0}
                recoveringFlow={recoveringFlow}
                canGenerate={
                  previewKeysReady &&
                  (provider !== 'flow' ||
                    recoveringFlow ||
                    flowCapacity.ready) &&
                  identityReady
                }
                credits={credits.credits}
                creditsLoading={credits.isLoading}
                creditsRefreshing={credits.isRefreshing}
                creditsLine={previewShortfallLine(provider, credits.credits)}
                onRefreshCredits={credits.refresh}
                onStyleChange={setStyleId}
                onProviderChange={(nextProvider) => {
                  setProvider(nextProvider)
                }}
                onGenerate={() => void generatePreview()}
                onRestart={(request) => void generatePreview(request)}
                onCancel={preview.cancel}
              />
            </>
          )}

          {formErrorKey && <ErrorMessage>{t(formErrorKey)}</ErrorMessage>}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            disabled={saving}
            onClick={onClose}
            className="rounded-xl font-display"
          >
            {t('characters.modal.cancelar')}
          </Button>
          <Button
            disabled={busy}
            onClick={() => void save()}
            className="rounded-xl font-display font-bold"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('characters.modal.guardar')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
