import type { ReactNode } from 'react'

export interface AnimationDialogPosition {
  x: number
  y: number
}

export interface AnimationDialogProps {
  title: string
  trigger: ReactNode
  children: ReactNode
}
