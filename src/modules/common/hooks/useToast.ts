import { useEffect, useState } from 'react'
import { TOAST_LIMIT, TOAST_REMOVE_DELAY } from '@/modules/common/constants'
import type {
  ToastAction,
  ToastOptions,
  ToastState,
  ToasterToast,
} from '@/modules/common/types/toast'

/**
 * Store de toasts fuera de React (adaptado de shadcn/ui): el estado vive en
 * módulo y los componentes se suscriben vía `useToast`. Eso permite disparar
 * `toast()` desde cualquier lado (un `api/`, un handler) sin acceso a hooks.
 * Estas funciones comparten ese estado mutable, por eso viven acá y no en
 * `utilities/`.
 */

let count = 0

function generateToastId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

function addToRemoveQueue(toastId: string) {
  if (toastTimeouts.has(toastId)) return

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({ type: 'REMOVE_TOAST', toastId })
  }, TOAST_REMOVE_DELAY)

  toastTimeouts.set(toastId, timeout)
}

function reducer(state: ToastState, action: ToastAction): ToastState {
  switch (action.type) {
    case 'ADD_TOAST':
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }

    case 'UPDATE_TOAST':
      return {
        ...state,
        toasts: state.toasts.map((toast) =>
          toast.id === action.toast.id ? { ...toast, ...action.toast } : toast,
        ),
      }

    case 'DISMISS_TOAST': {
      const { toastId } = action

      // Efecto secundario dentro del reducer (herencia de shadcn/ui): encola
      // la remoción diferida del toast que se está descartando.
      if (toastId) {
        addToRemoveQueue(toastId)
      } else {
        state.toasts.forEach((toast) => addToRemoveQueue(toast.id))
      }

      return {
        ...state,
        toasts: state.toasts.map((toast) =>
          toast.id === toastId || toastId === undefined
            ? { ...toast, open: false }
            : toast,
        ),
      }
    }

    case 'REMOVE_TOAST':
      if (action.toastId === undefined) return { ...state, toasts: [] }

      return {
        ...state,
        toasts: state.toasts.filter((toast) => toast.id !== action.toastId),
      }
  }
}

const listeners: Array<(state: ToastState) => void> = []

let memoryState: ToastState = { toasts: [] }

function dispatch(action: ToastAction) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => listener(memoryState))
}

function toast(props: ToastOptions) {
  const id = generateToastId()

  const update = (props: ToasterToast) =>
    dispatch({ type: 'UPDATE_TOAST', toast: { ...props, id } })
  const dismiss = () => dispatch({ type: 'DISMISS_TOAST', toastId: id })

  dispatch({
    type: 'ADD_TOAST',
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss()
      },
    },
  })

  return { id, dismiss, update }
}

function useToast() {
  const [state, setState] = useState(memoryState)

  // Suscripción al store de módulo: se registra una vez al montar.
  useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) listeners.splice(index, 1)
    }
  }, [])

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: 'DISMISS_TOAST', toastId }),
  }
}

export { useToast, toast }
