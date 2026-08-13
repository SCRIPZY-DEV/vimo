import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense } from 'react'
import { RouterProvider } from 'react-router/dom'
import { ThemeProvider } from '@/modules/common/theme/ThemeProvider'
import { Toaster } from '@/modules/common/ui/toaster'
import { Toaster as Sonner } from '@/modules/common/ui/sonner'
import { TooltipProvider } from '@/modules/common/ui/tooltip'
import { router } from '@/router'

const queryClient = new QueryClient()

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Las traducciones se cargan por HTTP: la app se suspende hasta tenerlas. */}
      <Suspense fallback={null}>
        <ThemeProvider>
          <TooltipProvider>
            <RouterProvider router={router} />
            <Toaster />
            <Sonner />
          </TooltipProvider>
        </ThemeProvider>
      </Suspense>
    </QueryClientProvider>
  )
}
