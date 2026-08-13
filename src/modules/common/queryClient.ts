import { QueryClient } from '@tanstack/react-query'

/**
 * Instancia única de TanStack Query. Vive fuera de App para que los loaders
 * del router puedan compartir caché con los hooks de las vistas
 * (`queryClient.fetchQuery` en un guard deduplica con el `useQuery` de la vista).
 */
export const queryClient = new QueryClient()
