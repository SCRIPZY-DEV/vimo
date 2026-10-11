import { useEffect, useState } from 'react'
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query'
import { matchesSearch } from '@/modules/common/utilities/matchesSearch'
import {
  avatarsQueryKeys,
  STOCK_FILTER_MIN_VISIBLE,
} from '@/modules/avatars/constants'
import type {
  StockCategoryFilter,
  StockGenderFilter,
} from '@/modules/avatars/constants'
import type { StockFavorites } from '@/modules/avatars/hooks/useStockFavorites'
import type { StockGroupsListing } from '@/modules/avatars/hooks/useStockGroups'
import { useStockTypes } from '@/modules/avatars/hooks/useStockTypes'

interface UseStockGroupFiltersOptions {
  // El listado ya pedido (el stock público o los avatares de la cuenta).
  listing: StockGroupsListing
  ownership: 'public' | 'private'
  favorites: StockFavorites
}

// Los filtros del primer nivel del stock sobre las páginas ya cargadas: la
// categoría (solo el stock público), el género y la búsqueda, y la auto-carga
// que sostienen. Las categorías salen del tipo de look que informa
// `avatar-stock-types` (diseño §18): Profesional = estudio, Comunidad =
// gemelos, Estilo de vida = el resto, Favoritos = los marcados. Mientras
// clasifica, las categorías por tipo esperan (`classifying`); si la
// clasificación falla o llega vacía, no cuentan como filtro y muestran todo
// (`classificationFailed`). Con un filtro activo y menos de
// STOCK_FILTER_MIN_VISIBLE tarjetas, pide la página siguiente sola (sin
// contar los favoritos que el listado ya demostró no traer en esta sesión).
export function useStockGroupFilters({
  listing,
  ownership,
  favorites,
}: UseStockGroupFiltersOptions) {
  const [category, setCategory] = useState<StockCategoryFilter>('all')
  const [gender, setGender] = useState<StockGenderFilter>('all')
  const [search, setSearch] = useState('')
  const types = useStockTypes({ enabled: ownership === 'public' })
  const queryClient = useQueryClient()
  // Los favoritos que un recorrido completo del listado público, sin error,
  // no trajo. Nunca se borran de lo guardado: HeyGen decide «completo» página
  // a página y el listado se corre entre páginas, así que «no está» puede ser
  // falso. Solo se recuerdan en memoria (la caché de la app, por la sesión,
  // nada en disco) para no contarlos en la auto-carga de «Favoritos»: si no,
  // cada apertura volvería a recorrer las 29 páginas del stock por el mismo
  // id. Si una lectura posterior los trae, se muestran como cualquier otro.
  const { data: unlistedFavorites } = useQuery<string[]>({
    queryKey: avatarsQueryKeys.stockFavoritesUnlisted,
    queryFn: skipToken,
    initialData: [],
    gcTime: Infinity,
  })
  const unlisted = new Set(unlistedFavorites)

  const typeCategory =
    category === 'studio' || category === 'photo' || category === 'twin'
  const classifying = typeCategory && types.isLoading
  // Una clasificación sin ningún grupo (las dos listas vacías) no sirve para
  // filtrar: cuenta como no disponible, igual que un error (el aviso y la
  // grilla completa). Mientras se reintenta, `useStockTypes` dice que carga.
  const classificationEmpty =
    !types.isLoading &&
    types.studioGroupIds.size === 0 &&
    types.twinGroupIds.size === 0
  const classificationFailed =
    typeCategory && (types.errorKey !== null || classificationEmpty)
  const categoryActive =
    category === 'favorites' || (typeCategory && !classificationFailed)

  const inCategory = (groupId: string) => {
    if (category === 'favorites') return favorites.favoriteIds.has(groupId)
    if (!categoryActive) return true

    const studio = types.studioGroupIds.has(groupId)
    const twin = types.twinGroupIds.has(groupId)
    if (category === 'studio') return studio
    if (category === 'twin') return twin

    return !studio && !twin
  }

  // Los ids que una categoría puede llegar a mostrar, si se saben (estilo de
  // vida es «todo lo demás»: no).
  const categoryIds = () => {
    if (category === 'favorites')
      return new Set(
        [...favorites.favoriteIds].filter((id) => !unlisted.has(id)),
      )
    if (!categoryActive) return null
    if (category === 'studio') return types.studioGroupIds
    if (category === 'twin') return types.twinGroupIds

    return null
  }

  const visibleGroups = listing.groups.filter(
    (item) =>
      (gender === 'all' || item.gender === gender) &&
      matchesSearch([item.name], search) &&
      inCategory(item.groupId),
  )
  const loadedIds = new Set(listing.groups.map((item) => item.groupId))
  const knownIds = categoryIds()
  // Si ya están cargados todos los avatares que la categoría puede mostrar
  // (por ejemplo, ningún favorito o todos), otra página no suma nada.
  const categoryComplete =
    knownIds !== null && [...knownIds].every((id) => loadedIds.has(id))
  const filterActive =
    categoryActive || gender !== 'all' || search.trim() !== ''
  // Con un filtro que deja pocas tarjetas, la grilla sigue pidiendo páginas
  // sola. Nunca tras un error (sería un bucle de pedidos fallidos: queda
  // «Cargar más» para reintentar) ni mientras clasifica (todavía no se sabe
  // qué tarjetas entran).
  const autoLoading =
    filterActive &&
    !classifying &&
    !categoryComplete &&
    visibleGroups.length < STOCK_FILTER_MIN_VISIBLE &&
    listing.hasMore &&
    !listing.errorKey
  const { isLoading, isFetchingMore, loadMore } = listing

  // Sincroniza con la paginación (un sistema externo): pide la página
  // siguiente cuando no hay ninguna en vuelo. Al llegar, el render la cuenta
  // y, si todavía faltan tarjetas, vuelve a pedir.
  useEffect(() => {
    if (!autoLoading || isLoading || isFetchingMore) return

    loadMore()
  }, [autoLoading, isLoading, isFetchingMore, loadMore])

  // Con el listado público recorrido entero (sin más páginas, sin error y con
  // algún avatar), los favoritos que no vinieron se anotan en la memoria de
  // la sesión. Solo se suman: nunca se escribe en lo guardado.
  const listingComplete =
    ownership === 'public' &&
    !isLoading &&
    !listing.hasMore &&
    !listing.errorKey &&
    listing.groups.length > 0
  const missingIds = listingComplete
    ? [...favorites.favoriteIds].filter((id) => !loadedIds.has(id))
    : []
  // Un texto como dependencia: el arreglo es nuevo en cada render.
  const missingKey = missingIds.join('\n')

  useEffect(() => {
    if (!missingKey) return

    queryClient.setQueryData<string[]>(
      avatarsQueryKeys.stockFavoritesUnlisted,
      (current = []) => [...new Set([...current, ...missingKey.split('\n')])],
    )
  }, [missingKey, queryClient])

  return {
    category,
    setCategory,
    gender,
    setGender,
    search,
    setSearch,
    visibleGroups,
    classifying,
    classificationFailed,
    autoLoading,
    // «Favoritos» sin ninguno marcado: su propio aviso en vez de «sin
    // resultados».
    noFavorites: category === 'favorites' && favorites.favoriteIds.size === 0,
  }
}
