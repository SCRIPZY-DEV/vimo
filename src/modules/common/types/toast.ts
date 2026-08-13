import type { ReactNode } from 'react'
import type { ToastActionElement, ToastProps } from '@/modules/common/ui/toast'

/** Toast dentro del store: props del componente más los metadatos propios. */
export type ToasterToast = ToastProps & {
  id: string
  title?: ReactNode
  description?: ReactNode
  action?: ToastActionElement
}

/** Entrada de `toast()`: el id lo genera el store. */
export type ToastOptions = Omit<ToasterToast, 'id'>

/** Acciones del reducer del store de toasts. */
export type ToastAction =
  | { type: 'ADD_TOAST'; toast: ToasterToast }
  | { type: 'UPDATE_TOAST'; toast: Partial<ToasterToast> }
  | { type: 'DISMISS_TOAST'; toastId?: ToasterToast['id'] }
  | { type: 'REMOVE_TOAST'; toastId?: ToasterToast['id'] }

export interface ToastState {
  toasts: ToasterToast[]
}
