import type { FlowConnection } from '@/modules/common/types/flow'
import type { FlowAccountRecoveryGuide } from '@/modules/common/types/flowAccountRecovery'
import { flowCheckingState } from '@/modules/common/utilities/flowCheckingState'

// Describe evidencia del perfil; nunca autoriza envíos ni resuelve un CAPTCHA.
export function flowAccountRecoveryGuide(
  availability: FlowConnection['profileAvailability'] | null | undefined,
): FlowAccountRecoveryGuide | null {
  if (!availability || availability.state === 'ready') return null

  const checking = flowCheckingState(availability)
  if (checking) {
    const keys = {
      limited: [
        'extension.availability_checkingLimited',
        'extension.helpAccountCheckingLimited',
      ],
      running: [
        'extension.availability_checking',
        'extension.helpAccountChecking',
      ],
      unconfirmed: [
        'extension.availability_checkingUnconfirmed',
        'extension.helpAccountCheckingUnconfirmed',
      ],
    }[checking]
    return { titleKey: keys[0], helpKey: keys[1], stepKeys: [] }
  }

  const reason = availability.reason
  if (reason === 'MANUAL_PAUSE') return null

  if (reason === 'ACTIVITY_BLOCKED') {
    const automatic = availability.state === 'cooldown'
    return {
      titleKey: 'extension.recoveryActivityTitle',
      helpKey: automatic
        ? 'extension.recoveryActivityWait'
        : 'extension.recoveryActivityReview',
      stepKeys: [
        'extension.recoveryStepOpenProfile',
        'extension.recoveryStepActivity',
        automatic
          ? 'extension.recoveryStepWait'
          : 'extension.recoveryStepContinue',
      ],
      nextCheckAt: automatic ? availability.nextCheckAt : null,
    }
  }

  if (reason === 'CAPTCHA_REQUIRED') {
    return {
      titleKey: 'extension.recoveryCaptchaTitle',
      helpKey: 'extension.recoveryCaptchaHelp',
      stepKeys: [
        'extension.recoveryStepOpenProfile',
        'extension.recoveryStepCaptcha',
        'extension.recoveryStepContinue',
      ],
    }
  }

  if (reason === 'SESSION_REQUIRED' || reason === 'PROFILE_SIGN_IN_REQUIRED') {
    return {
      identityReview: true,
      titleKey: 'extension.recoverySessionTitle',
      helpKey: 'extension.recoverySessionHelp',
      stepKeys: [
        'extension.recoveryStepOpenProfile',
        'extension.recoveryStepSignIn',
        'extension.recoveryStepContinue',
      ],
    }
  }

  switch (reason) {
    case 'ACCOUNT_MISMATCH':
    case 'ACCOUNT_IDENTITY_MISMATCH':
    case 'FLOW_IDENTITY_UNAVAILABLE':
    case 'PROFILE_IDENTITY_UNAVAILABLE':
    case 'IDENTITY_CHECK_FAILED':
      return {
        identityReview: true,
        titleKey: 'extension.recoveryIdentityTitle',
        helpKey: 'extension.recoveryIdentityHelp',
        stepKeys: [
          'extension.recoveryStepOpenProfile',
          'extension.recoveryStepAccount',
          'extension.recoveryStepContinue',
        ],
      }
    case 'RECOVERY_RECEIPTS_PENDING':
      return {
        titleKey: 'extension.recoveryReceiptsTitle',
        helpKey: 'extension.recoveryReceiptsHelp',
        stepKeys: [],
        nextCheckAt: availability.nextCheckAt,
      }
  }

  if (
    reason === 'TOOLS_MODELS_EXHAUSTED' ||
    reason === 'TOOLS_MODELS_UNAVAILABLE'
  ) {
    return {
      titleKey: 'extension.recoveryQuotaTitle',
      helpKey: 'extension.recoveryQuotaHelp',
      stepKeys: [],
      nextCheckAt:
        availability.state === 'cooldown' ? availability.nextCheckAt : null,
    }
  }

  if (availability.state === 'cooldown') {
    return {
      titleKey: 'extension.recoveryAutomaticTitle',
      helpKey: 'extension.recoveryAutomaticHelp',
      stepKeys: [],
      nextCheckAt: availability.nextCheckAt,
    }
  }

  return null
}
