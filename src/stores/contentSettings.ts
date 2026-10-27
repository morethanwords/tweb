import {createEffect, createMemo, createRoot} from 'solid-js';
import {useAppState} from '@stores/appState';
import {makeIgnoredRestrictionReasons, setIgnoredRestrictionReasons} from '@helpers/restrictions';
import {hotEffect} from '@helpers/hotModule';

export default function useContentSettings() {
  const [appState] = useAppState();

  // * everything is read through `appState` on every access: the root below runs at startup (`apiManagerProxy`),
  // * before the state is loaded
  const appConfig = () => appState.appConfig;
  const contentSettings = createMemo(() => appState.accountContentSettings?.value);
  const sensitiveEnabled = createMemo(() => contentSettings()?.pFlags.sensitive_enabled ?? false);
  const sensitiveCanChange = createMemo(() => contentSettings()?.pFlags.sensitive_can_change ?? false);
  const ignoredRestrictionReasons = createMemo(() => {
    return makeIgnoredRestrictionReasons(appConfig()?.ignore_restriction_reasons, contentSettings());
  });
  const needAgeVerification = createMemo(() => appConfig()?.need_age_video_verification ?? false);
  const ageVerified = createMemo(() => !!appState.ageVerification);

  return {
    sensitiveEnabled,
    sensitiveCanChange,
    needAgeVerification,
    ageVerified,
    ignoredRestrictionReasons
  };
}

// * the page's copy of what the shown account ignores: without it every sensitive media would be hidden again
// * after a reload, however the account's switch is set. A hot update disposes the previous run's root
hotEffect(import.meta.hot, () => createRoot((dispose) => {
  const contentSettings = useContentSettings();
  createEffect(() => {
    setIgnoredRestrictionReasons(contentSettings.ignoredRestrictionReasons());
  });

  return dispose;
}));
