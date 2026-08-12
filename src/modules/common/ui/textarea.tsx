import * as React from 'react'

import { cn } from '@/modules/common/utilities/cn'

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[80px] w-full rounded-xl border-2 border-border bg-background px-3.5 py-2.5 text-sm transition-colors placeholder:text-muted-foreground/70 hover:border-saffron/40 focus-visible:outline-none focus-visible:border-saffron focus-visible:ring-2 focus-visible:ring-saffron/25 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border',
          className,
        )}
        ref={ref}
        {...props}
      />
    )
  },
)
Textarea.displayName = 'Textarea'

export { Textarea }
