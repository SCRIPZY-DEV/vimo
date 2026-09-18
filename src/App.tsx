import { QueryClientProvider } from '@tanstack/react-query'
import { Suspense } from 'react'
import { RouterProvider } from 'react-router/dom'
import { TOOLTIP_DELAY_MS } from '@/modules/common/constants'
import { queryClient } from '@/modules/common/queryClient'
import { ThemeProvider } from '@/modules/common/theme/ThemeProvider'
import { Toaster } from '@/modules/common/ui/toaster'
import { Toaster as Sonner } from '@/modules/common/ui/sonner'
import { TooltipProvider } from '@/modules/common/ui/tooltip'
import { DiagnosticsUploader } from '@/modules/diagnostics/components/DiagnosticsUploader'
import { AppUpdateProvider } from '@/modules/settings/components/AppUpdateProvider'
import { UpdatePrompt } from '@/modules/settings/components/UpdatePrompt'
import { router } from '@/router'

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Las traducciones se cargan por HTTP: la app se suspende hasta tenerlas. */}
      <Suspense fallback={null}>
        <ThemeProvider>
          <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>
            {/* Updater (ADR-0027): un chequeo por arranque y el aviso en cualquier pantalla. */}
            <AppUpdateProvider>
              <RouterProvider router={router} />
              <UpdatePrompt />
            </AppUpdateProvider>
            {/* Logs de diagnóstico (ADR-0038): sube a soporte lo que Rust dejó en el spool. */}
            <DiagnosticsUploader />
            <Toaster />
            <Sonner />
          </TooltipProvider>
        </ThemeProvider>
      </Suspense>
    </QueryClientProvider>
  )
}
