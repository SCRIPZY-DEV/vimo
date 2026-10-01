import { useTranslation } from 'react-i18next'
import { vimoServerRetryAt } from '@/modules/common/fetcher/vimoServerError'
import { formatDateTime } from '@/modules/common/utilities/formatDateTime'
import { videosApi } from '@/modules/videos/api'
import { CUSTOM_STYLE_PROMPT_LIMIT } from '@/modules/videos/constants'

interface GemRebuildErrorTextProps {
  error: unknown
}

// Por qué falló el agente reconstructor, traducido (spec §11): con el cupo
// agotado dice cuándo vuelve a haber; con el texto inválido, el tope.
export function GemRebuildErrorText({ error }: GemRebuildErrorTextProps) {
  const { t, i18n } = useTranslation()
  const retryAt = vimoServerRetryAt(error)

  return t(videosApi.gemRebuildErrorKey(error), {
    when: retryAt ? formatDateTime(retryAt, i18n.resolvedLanguage) : '',
    limit: CUSTOM_STYLE_PROMPT_LIMIT.toLocaleString(),
  })
}
