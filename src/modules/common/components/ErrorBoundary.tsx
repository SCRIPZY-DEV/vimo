import { Component, type ErrorInfo } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, RotateCcw } from 'lucide-react'
import type {
  ErrorBoundaryProps,
  ErrorBoundaryState,
  ErrorFallbackProps,
} from '@/modules/common/types/errorBoundary'
import { Button } from '@/modules/common/ui/button'

/**
 * Red de seguridad para el contenido de una pantalla (port de LimiteDeError).
 *
 * Sin error boundary, cualquier excepción durante el render desmonta el árbol
 * ENTERO de React y deja la página en blanco — sin mensaje, sin salida. Va
 * envolviendo SOLO el contenido, no el layout: si una pantalla explota, el
 * resto del layout sigue vivo y la persona navega a otra sección (o usa la
 * acción extra del fallback, `action`) sin recargar nada.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Marcador estructurado: mismo formato que consumía la telemetría de la
    // app original. Un solo token, nada de scrapear palabras sueltas.
    console.error(
      '[[VIMO_ERR]]' +
        JSON.stringify({
          origen: 'render',
          mensaje: error.message,
          ruta: window.location.hash,
          componentes: info.componentStack?.slice(0, 600) ?? '',
        }),
    )
  }

  componentDidUpdate(prev: ErrorBoundaryProps) {
    // Al navegar a otra sección, la pantalla nueva arranca limpia.
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <ErrorFallback
        error={this.state.error}
        action={this.props.action}
        onRetry={() => this.setState({ error: null })}
      />
    )
  }
}

function ErrorFallback({ error, action, onRetry }: ErrorFallbackProps) {
  const { t } = useTranslation()

  return (
    <div className="mx-auto max-w-2xl px-8 py-16">
      <div className="space-y-5 rounded-2xl border-2 border-coral/40 bg-card p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-coral/20">
          <AlertCircle className="h-8 w-8 text-coral-text" />
        </div>
        <div>
          <h2 className="font-display text-2xl font-extrabold text-foreground">
            {t('layout.error.titulo')}
          </h2>
          <p className="mt-2 font-body text-sm text-muted-foreground">
            {t('layout.error.descripcion')}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            size="lg"
            onClick={onRetry}
            className="rounded-xl bg-saffron font-display font-bold text-charcoal hover:bg-saffron/90"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            {t('layout.error.reintentar')}
          </Button>
          {action}
        </div>

        {import.meta.env.DEV && (
          <details className="text-left">
            <summary className="cursor-pointer font-body text-xs uppercase tracking-wide text-muted-foreground">
              {t('layout.error.detalleTecnico')}
            </summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted px-4 py-3 text-xs">
              {error.message}
              {'\n\n'}
              {error.stack?.slice(0, 1200)}
            </pre>
          </details>
        )}
      </div>
    </div>
  )
}
