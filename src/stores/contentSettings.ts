import {createEffect, createMemo, createRoot} from 'solid-js';
import {useAppConfig, useAppState} from '@stores/appState';
import {ignoreRestrictionReasons} from '@helpers/restrictions';

export default function useContentSettings() {
  const appConfig = useAppConfig();
  const [appState] = useAppState();

  const contentSettings = createMemo(() => appState.accountContentSettings.value);
  const sensitiveEnabled = createMemo(() => (contentSettings() && contentSettings().pFlags.sensitive_enabled) ?? false);
  const sensitiveCanChange = createMemo(() => (contentSettings() && contentSettings().pFlags.sensitive_can_change) ?? false);
  const ignoreRestrictionReasons = createMemo(() => appConfig.ignore_restriction_reasons ?? []);
  const needAgeVerification = createMemo(() => appConfig.need_age_video_verification ?? false);
  const ageVerified = createMemo(() => !!appState.ageVerification);

  return {
    sensitiveEnabled,
    sensitiveCanChange,
    needAgeVerification,
    ageVerified,
    ignoreRestrictionReasons
  };
}

// * handle settings changes
createRoot(() => {
  const contentSettings = useContentSettings();
  createEffect(() => {
    ignoreRestrictionReasons(contentSettings.ignoreRestrictionReasons());
  });
});
