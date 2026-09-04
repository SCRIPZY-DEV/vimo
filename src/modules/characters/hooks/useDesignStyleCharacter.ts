import { useMutation } from '@tanstack/react-query'
import { charactersApi } from '@/modules/characters/api'
import type {
  DesignStyleCharacterPayload,
  DesignStyleCharacterResult,
} from '@pipeline/types/styles.ts'

// «Crear personaje con mi estilo»: la ficha la diseña el estilo del usuario
// (gema + guion como contexto), por el carril verbatim.
export function useDesignStyleCharacter() {
  const mutation = useMutation<
    DesignStyleCharacterResult,
    unknown,
    DesignStyleCharacterPayload
  >({
    mutationFn: (payload) => charactersApi.designWithStyle(payload),
  })

  return {
    designWithStyle: mutation.mutateAsync,
    designing: mutation.isPending,
    errorKey: mutation.isError
      ? charactersApi.errorMessageKey(mutation.error)
      : null,
  }
}
