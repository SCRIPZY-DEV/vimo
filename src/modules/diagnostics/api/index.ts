import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { supabase } from '@/modules/common/supabase/client'
import { isNative } from '@/modules/common/utilities/isNative'
import {
  DIAGNOSTIC_LOGS_TABLE,
  DIAGNOSTIC_LOG_READY_EVENT,
  DUPLICATE_ROW_ERROR_CODE,
} from '../constants'
import type {
  DiagnosticLogRecord,
  DiagnosticLogUploader,
} from '../types/diagnosticLog'
import { toDiagnosticLogRow } from '../utilities/toDiagnosticLogRow'

// Logs de diagnóstico (ADR-0038): Rust deja cada ejecución, ya redactada, en
// un spool en disco; acá se leen y se insertan en Supabase con la sesión del
// usuario. La tabla es insert-only por RLS: desde la app no se puede leer.
export const diagnosticsApi = {
  isNative() {
    return isNative()
  },
  async getUploader(
    locale: string | null,
  ): Promise<DiagnosticLogUploader | null> {
    const { data } = await supabase.auth.getSession()
    const user = data.session?.user
    if (!user?.email) return null

    return { userId: user.id, email: user.email, locale }
  },
  async listPending(): Promise<DiagnosticLogRecord[]> {
    return invoke<DiagnosticLogRecord[]>('list_pending_diagnostic_logs')
  },
  async remove(id: string): Promise<void> {
    return invoke('delete_diagnostic_log', { id })
  },
  // true si la fila quedó en la tabla, ahora o en una subida anterior.
  async upload(
    record: DiagnosticLogRecord,
    uploader: DiagnosticLogUploader,
  ): Promise<boolean> {
    const { error } = await supabase
      .from(DIAGNOSTIC_LOGS_TABLE)
      .insert(toDiagnosticLogRow(record, uploader))
    if (error === null) return true

    return error.code === DUPLICATE_ROW_ERROR_CODE
  },
  // Sube una tanda del spool y devuelve cuántos registros subió. Uno que no
  // sube queda para la próxima pasada (Rust lo descarta a los 7 días).
  async uploadBatch(uploader: DiagnosticLogUploader): Promise<number> {
    const records = await diagnosticsApi.listPending()
    let uploadedCount = 0
    for (const record of records) {
      const uploaded = await diagnosticsApi.upload(record, uploader)
      if (!uploaded) continue

      await diagnosticsApi.remove(record.id)
      uploadedCount += 1
    }

    return uploadedCount
  },
  // Vacía el spool tanda a tanda; corta cuando una tanda no avanza.
  async uploadPending(locale: string | null): Promise<number> {
    const uploader = await diagnosticsApi.getUploader(locale)
    if (uploader === null) return 0

    let uploadedTotal = 0
    while (true) {
      const uploadedCount = await diagnosticsApi.uploadBatch(uploader)
      if (uploadedCount === 0) return uploadedTotal

      uploadedTotal += uploadedCount
    }
  },
  // Avisa cuando conviene vaciar el spool: Rust cerró un registro nuevo, o
  // recién hay sesión (los registros de antes del login esperaban eso).
  async subscribeToUploadTriggers(onTrigger: () => void): Promise<() => void> {
    const unlisten = await listen(DIAGNOSTIC_LOG_READY_EVENT, onTrigger)
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') onTrigger()
    })

    return () => {
      unlisten()
      data.subscription.unsubscribe()
    }
  },
}
