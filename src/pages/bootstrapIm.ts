/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import blurActiveElement from '@helpers/dom/blurActiveElement';
import loadFonts from '@helpers/dom/loadFonts';
import isNativeVoiceRecorderSupported from '@helpers/voiceRecorder/isNativeSupported';
import rootScope from '@lib/rootScope';

import {disposeActiveAuthFlow} from '@/pages/mountAuthFlow';

let bootstrapped = false;

/**
 * Procedural replacement for the legacy `pageIm` `Page` instance.
 *
 * Marks the user as signed-in, shows the `#page-chats` container, kicks off
 * `appDialogsManager`, and tears down any active `<AuthCardsHost>`.
 *
 * Idempotent — calling it twice (e.g. once from inside the auth flow on success,
 * once from `src/index.ts` on a directly-signed-in boot) is a no-op the second
 * time.
 */
export async function bootstrapIm(): Promise<void> {
  if(bootstrapped) return;
  bootstrapped = true;

  await rootScope.managers.appStateManager.pushToState('authState', {_: 'authStateSignedIn'});

  const pageChatsEl = document.getElementById('page-chats');
  if(pageChatsEl) pageChatsEl.style.display = '';

  blurActiveElement();

  // Skip the opus-recorder fallback chunk entirely on browsers that have the
  // WebCodecs-based native path. Saves ~80 KB of WASM-shipping JS on every
  // sign-in for ~94% of users (May 2026 baseline).
  const recorderImport: Promise<{default: unknown} | null> = isNativeVoiceRecorderSupported() ?
    Promise.resolve(null) :
    import('@vendor/recorder.min.js' as any);

  const [{default: appDialogsManager}, recorder] = await Promise.all([
    import('@lib/appDialogsManager'),
    recorderImport,
    loadFonts(),
    'requestVideoFrameCallback' in HTMLVideoElement.prototype ?
      Promise.resolve() :
      import('@helpers/dom/requestVideoFrameCallbackPolyfill')
  ]);

  if(recorder) {
    (window as any).Recorder = recorder.default;
  }
  appDialogsManager.start();
  document.body.classList.remove('has-auth-pages');

  // Tear down the auth UI 1s after IM appears — same delay the legacy
  // `pageIm.onFirstMount` used so the cross-fade looks right.
  setTimeout(() => {
    disposeActiveAuthFlow();
  }, 1000);
}

export default bootstrapIm;
