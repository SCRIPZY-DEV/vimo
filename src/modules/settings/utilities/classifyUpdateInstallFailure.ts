import {
  UPDATE_FAILURE_BLOCKED_REGEX,
  UPDATE_FAILURE_NETWORK_REGEX,
  UPDATE_FAILURE_PERMISSION_REGEX,
  UPDATE_FAILURE_READ_ONLY_REGEX,
  UPDATE_FAILURE_SIGNATURE_REGEX,
  UPDATE_JOB_RUNNING_ERROR,
} from '../constants'
import { UpdateInstallFailure } from '../types/updates'

// Causa de un fallo al instalar, a partir del texto del error. El orden
// importa: los códigos del sistema son más específicos que las palabras sueltas.
export function classifyUpdateInstallFailure(
  detail: string,
): UpdateInstallFailure {
  if (detail.includes(UPDATE_JOB_RUNNING_ERROR))
    return UpdateInstallFailure.jobRunning

  if (UPDATE_FAILURE_READ_ONLY_REGEX.test(detail))
    return UpdateInstallFailure.readOnlyLocation

  if (UPDATE_FAILURE_PERMISSION_REGEX.test(detail))
    return UpdateInstallFailure.permissionDenied

  if (UPDATE_FAILURE_BLOCKED_REGEX.test(detail))
    return UpdateInstallFailure.installerBlocked

  if (UPDATE_FAILURE_SIGNATURE_REGEX.test(detail))
    return UpdateInstallFailure.signature

  if (UPDATE_FAILURE_NETWORK_REGEX.test(detail))
    return UpdateInstallFailure.network

  return UpdateInstallFailure.unknown
}
