import { useSyncExternalStore } from 'react'
import i18next from 'i18next'
import { Brand } from '@/modules/common/brand/brand'
import { queryClient } from '@/modules/common/queryClient'
import { videosApi } from '@/modules/videos/api'
import { videosQueryKeys } from '@/modules/videos/constants'
import {
  STYLE_CLONE_STORAGE_KEY,
  createStyleCloneSessions,
} from '@/modules/videos/utilities/styleCloneSessions'
import type {
  StyleCloneSteps,
  StyleCloneStorage,
} from '@/modules/videos/types/styleClone'
import type { StyleCloneSnapshot } from '@/modules/videos/utilities/styleCloneSessions'

// Los pasos reales de una clonación de estilo (ADR-0050): el sidecar junta el
// material, dibuja las pruebas y guarda; vimo.click analiza. El store
// (createStyleCloneSessions) decide el orden y qué se repite al retomar.
const steps: StyleCloneSteps = {
  prepare(session) {
    return videosApi.prepareStyleClone({
      sessionId: session.id,
      source: session.source,
    })
  },
  turn(draft, material) {
    return videosApi.styleCloneTurn(
      draft,
      material,
      Brand.version,
      i18next.resolvedLanguage ?? 'es',
    )
  },
  draw(payload, onProgress) {
    return videosApi.drawStyleClone(payload, onProgress)
  },
  save(payload) {
    return videosApi.saveStyleClone(payload)
  },
  discard(sessionId) {
    return videosApi.discardStyleClone({ sessionId })
  },
  errorCode(error) {
    return videosApi.styleCloneErrorCode(error)
  },
  // El estilo y, si lo hubo, el personaje ya están en disco: la galería de Mi
  // estilo y el selector de personajes de Crear los vuelven a leer.
  saved() {
    void queryClient.invalidateQueries({
      queryKey: videosQueryKeys.customStyles,
    })
    void queryClient.invalidateQueries({ queryKey: videosQueryKeys.characters })
  },
}

// Las sesiones sobreviven a la navegación y al cierre de la app. Un
// almacenamiento que no responde (modo privado, cuota) no rompe la clonación:
// sigue en memoria.
const storage: StyleCloneStorage = {
  read() {
    try {
      return localStorage.getItem(STYLE_CLONE_STORAGE_KEY)
    } catch {
      return null
    }
  },
  write(value) {
    localStorage.setItem(STYLE_CLONE_STORAGE_KEY, value)
  },
}

const styleClones = createStyleCloneSessions(steps, storage)

// Empezar una clonación (devuelve su id; null con tres abiertas).
export const startStyleClone = styleClones.start
// La respuesta de la persona cuando la sesión espera.
export const respondStyleClone = styleClones.respond
// «Reintentar» y «Reanudar».
export const retryStyleClone = styleClones.retry
export const renameStyleClone = styleClones.rename
export const discardStyleClone = styleClones.discard
// La galería ya usó o descartó el aviso de un estilo recién guardado.
export const dismissFinishedStyleClone = styleClones.dismissFinished

// Las clonaciones abiertas y las recién guardadas.
export function useStyleClones(): StyleCloneSnapshot {
  return useSyncExternalStore(styleClones.subscribe, styleClones.getSnapshot)
}
