import * as React from 'react'

import { cn } from '@/modules/common/utilities/cn'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-xl border-2 border-border bg-background px-3.5 py-2 text-base transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/70 hover:border-saffron/40 focus-visible:outline-none focus-visible:border-saffron focus-visible:ring-2 focus-visible:ring-saffron/25 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border md:text-sm',
          className,
        )}
        ref={ref}
        {...props}
      />
    )
  },
)
Input.displayName = 'Input'

export { Input }
