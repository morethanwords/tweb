/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

/* @refresh reload */

import App from './config/app';
import blurActiveElement from './helpers/dom/blurActiveElement';
import {IS_STICKY_INPUT_BUGGED} from './helpers/dom/fixSafariStickyInputFocusing';
import loadFonts from './helpers/dom/loadFonts';
import IS_EMOJI_SUPPORTED from './environment/emojiSupport';
import {IS_ANDROID, IS_APPLE, IS_APPLE_MOBILE, IS_FIREFOX, IS_MOBILE, IS_MOBILE_SAFARI, IS_SAFARI} from './environment/userAgent';
import './materialize.scss';
import './scss/style.scss';
import pause from './helpers/schedulers/pause';
import setWorkerProxy from './helpers/setWorkerProxy';
import toggleAttributePolyfill from './helpers/dom/toggleAttributePolyfill';
import rootScope from './lib/rootScope';
import IS_TOUCH_SUPPORTED from './environment/touchSupport';
import I18n, {checkLangPackForUpdates, i18n} from './lib/langPack';
import './helpers/peerIdPolyfill';
import './lib/polyfill';
import apiManagerProxy from './lib/mtproto/mtprotoworker';
import getProxiedManagers from './lib/appManagers/getProxiedManagers';
import themeController from './helpers/themeController';
import overlayCounter from './helpers/overlayCounter';
import singleInstance, {InstanceDeactivateReason} from './lib/mtproto/singleInstance';
import {parseUriParamsLine} from './helpers/string/parseUriParams';
import Modes from './config/modes';
import {AuthState} from './types';
import DEBUG, {IS_BETA} from './config/debug';
import IS_INSTALL_PROMPT_SUPPORTED from './environment/installPrompt';
import cacheInstallPrompt from './helpers/dom/installPrompt';
import {fillLocalizedDates} from './helpers/date';
import {nextRandomUint} from './helpers/random';
import {IS_OVERLAY_SCROLL_SUPPORTED, USE_CUSTOM_SCROLL, USE_NATIVE_SCROLL} from './environment/overlayScrollSupport';
import IMAGE_MIME_TYPES_SUPPORTED, {IMAGE_MIME_TYPES_SUPPORTED_PROMISE} from './environment/imageMimeTypesSupport';
import MEDIA_MIME_TYPES_SUPPORTED from './environment/mediaMimeTypesSupport';
import {doubleRaf} from './helpers/schedulers';
import {getCurrentAccount} from './lib/accounts/getCurrentAccount';
import AccountController from './lib/accounts/accountController';
import {changeAccount} from './lib/accounts/changeAccount';
import {MAX_ACCOUNTS_FREE, MAX_ACCOUNTS_PREMIUM} from './lib/accounts/constants';
import sessionStorage from './lib/sessionStorage';
import replaceChildrenPolyfill from './helpers/dom/replaceChildrenPolyfill';
import listenForWindowPrint from './helpers/dom/windowPrint';
import cancelImageEvents from './helpers/dom/cancelImageEvents';
import PopupElement from './components/popups';
import appRuntimeManager from './lib/appManagers/appRuntimeManager';
import PasscodeLockScreenController from './components/passcodeLock/passcodeLockScreenController'; PasscodeLockScreenController;
import type {LangPackDifference} from './layer';
import commonStateStorage from './lib/commonStateStorage';
import {MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH, SIDEBAR_COLLAPSE_FACTOR} from './components/sidebarLeft/constants';
import useHasFoldersSidebar, {useIsSidebarCollapsed} from './stores/foldersSidebar';

// import commonStateStorage from './lib/commonStateStorage';
// import { STATE_INIT } from './config/state';

// if(DEBUG) {
//   (async() => {
//     const {attachDevtoolsOverlay} = await import('@solid-devtools/overlay');

//     attachDevtoolsOverlay();
//   })();
// }


IMAGE_MIME_TYPES_SUPPORTED_PROMISE.then((mimeTypes) => {
  mimeTypes.forEach((mimeType) => {
    IMAGE_MIME_TYPES_SUPPORTED.add(mimeType);
    MEDIA_MIME_TYPES_SUPPORTED.add(mimeType);
  });

  console.log('Supported image mime types', IMAGE_MIME_TYPES_SUPPORTED);
  apiManagerProxy.sendEnvironment();
});

// * Randomly choose a version if user came from a search engine
function randomlyChooseVersionFromSearch() {
  try {
    if(
      App.isMainDomain &&
      document.referrer &&
      /(^|\.)(google|bing|duckduckgo|ya|yandex)\./i.test(new URL(document.referrer).host)
    ) {
      const version = localStorage.getItem('kz_version');
      if(version === 'Z' || nextRandomUint(8) > 127) {
        localStorage.setItem('kz_version', 'Z');
        location.href = 'https://web.telegram.org/a/';
      } else {
        localStorage.setItem('kz_version', 'K');
      }
    }
  } catch(err) {}
}

function setManifest() {
  const manifest = document.getElementById('manifest') as HTMLLinkElement;
  if(manifest) manifest.href = `site${IS_APPLE && !IS_APPLE_MOBILE ? '_apple' : ''}.webmanifest?v=jw3mK7G9Aq`;
}

function setViewportHeightListeners() {
  // We listen to the resize event (https://css-tricks.com/the-trick-to-viewport-units-on-mobile/)
  const w = window.visualViewport || window; // * handle iOS keyboard
  let setViewportVH = false/* , hasFocus = false */;
  let lastVH: number;
  const setVH = () => {
    let vh = (setViewportVH && !overlayCounter.isOverlayActive ? (w as VisualViewport).height || (w as Window).innerHeight : window.innerHeight) * 0.01;
    vh = +vh.toFixed(2);
    if(lastVH === vh) {
      return;
    } else if(IS_TOUCH_SUPPORTED && lastVH < vh && (vh - lastVH) > 1) {
      blurActiveElement(); // (Android) fix blurring inputs when keyboard is being closed (e.g. closing keyboard by back arrow and touching a bubble)
    }

    lastVH = vh;

    // const vh = document.documentElement.scrollHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);

    // console.log('setVH', vh, setViewportVH ? w : window);

    /* if(setViewportVH && userAgent.isSafari && touchSupport.isTouchSupported && document.activeElement && (document.activeElement as HTMLElement).blur) {
      const rect = document.activeElement.getBoundingClientRect();
      if(rect.top < 0 || rect.bottom >= (w as any).height) {
        fastSmoothScroll(findUpClassName(document.activeElement, 'scrollable-y') || window as any, document.activeElement as HTMLElement, 'center', 4, undefined, FocusDirection.Static);
      }
    } */
  };

  window.addEventListener('resize', setVH);
  setVH();

  if(IS_STICKY_INPUT_BUGGED) {
    const toggleResizeMode = () => {
      setViewportVH = tabId === 1 && IS_STICKY_INPUT_BUGGED && !overlayCounter.isOverlayActive;
      setVH();

      if(w !== window) {
        if(setViewportVH) {
          window.removeEventListener('resize', setVH);
          w.addEventListener('resize', setVH);
        } else {
          w.removeEventListener('resize', setVH);
          window.addEventListener('resize', setVH);
        }
      }
    };

    let tabId: number;
    (window as any).onImTabChange = (id: number) => {
      const wasTabId = tabId !== undefined;
      tabId = id;

      if(wasTabId || tabId === 1) {
        toggleResizeMode();
      }
    };

    overlayCounter.addEventListener('change', () => {
      toggleResizeMode();
    });
  }
}

function setSidebarLeftWidth() {
  const sidebarEl = document.getElementById('column-left');
  const storedWidth = localStorage.getItem('sidebar-left-width');

  let validatedWidth = parseInt(storedWidth);
  validatedWidth = isNaN(validatedWidth) ? undefined : validatedWidth;

  if(validatedWidth > MAX_SIDEBAR_WIDTH) validatedWidth = MAX_SIDEBAR_WIDTH;
  else if(validatedWidth < MIN_SIDEBAR_WIDTH * SIDEBAR_COLLAPSE_FACTOR) validatedWidth = 0;
  else if(validatedWidth < MIN_SIDEBAR_WIDTH) validatedWidth = MIN_SIDEBAR_WIDTH;

  if(typeof validatedWidth === 'number' && String(validatedWidth) !== storedWidth)
    localStorage.setItem('sidebar-left-width', validatedWidth + '');

  if(validatedWidth === 0) {
    sidebarEl.classList.add('is-collapsed');
    useIsSidebarCollapsed()[1](true);
  } else if(validatedWidth) {
    document.documentElement.style.setProperty('--current-sidebar-left-width', validatedWidth + 'px');
  }
}

function setRootClasses() {
  const add: string[] = [];

  if(IS_EMOJI_SUPPORTED) {
    add.push('native-emoji');
  }

  if(USE_NATIVE_SCROLL) {
    add.push('native-scroll');
  } else if(IS_OVERLAY_SCROLL_SUPPORTED) {
    add.push('overlay-scroll');
  } else if(USE_CUSTOM_SCROLL) {
    add.push('custom-scroll');
  }

  // root.style.setProperty('--quote-icon', `"${getIconContent('quote')}"`);

  if(IS_FIREFOX) {
    add.push('is-firefox', 'no-backdrop');
  }

  if(IS_MOBILE) {
    add.push('is-mobile');
  }

  if(IS_APPLE) {
    if(IS_SAFARI) {
      add.push('is-safari');
    }

    // root.classList.add('emoji-supported');

    if(IS_APPLE_MOBILE) {
      add.push('is-ios');
    } else {
      add.push('is-mac');
    }
  } else if(IS_ANDROID) {
    add.push('is-android');

    // force losing focus on input blur
    // focusin and focusout are not working on mobile

    // const onInResize = () => {
    //   hasFocus = true;
    //   window.addEventListener('resize', onOutResize, {once: true});
    // };

    // const onOutResize = () => {
    //   hasFocus = false;
    //   blurActiveElement();
    // };

    // let hasFocus = false;
    // document.addEventListener('touchend', (e) => {
    //   const input = (e.target as HTMLElement).closest('[contenteditable="true"], input');
    //   if(!input) {
    //     return;
    //   }

    //   if(document.activeElement !== input && !hasFocus) {
    //     console.log('input click', e, document.activeElement, input, input.matches(':focus'));
    //     window.addEventListener('resize', onInResize, {once: true});
    //   }
    // });
  }

  if(!IS_TOUCH_SUPPORTED) {
    add.push('no-touch');
  } else {
    add.push('is-touch');
    /* document.addEventListener('touchmove', (event: any) => {
      event = event.originalEvent || event;
      if(event.scale && event.scale !== 1) {
        event.preventDefault();
      }
    }, {capture: true, passive: false}); */
  }

  document.documentElement.classList.add(...add);
}

function onInstanceDeactivated(reason: InstanceDeactivateReason) {
  const isUpdated = reason === 'version';
  const popup = PopupElement.createPopup(PopupElement, 'popup-instance-deactivated', {overlayClosable: true});
  const c = document.createElement('div');
  c.classList.add('instance-deactivated-container');
  (popup as any).container.replaceWith(c);

  const header = document.createElement('div');
  header.classList.add('header');
  header.append(i18n(isUpdated ? 'Deactivated.Version.Title' : 'Deactivated.Title'));

  const subtitle = document.createElement('div');
  subtitle.classList.add('subtitle');
  subtitle.append(i18n(isUpdated ? 'Deactivated.Version.Subtitle' : 'Deactivated.Subtitle'));

  c.append(header, subtitle);

  document.body.classList.add('deactivated');

  const onClose = isUpdated ? () => {
    appRuntimeManager.reload();
  } : () => {
    document.body.classList.add('deactivated-backwards');

    singleInstance.activateInstance();

    setTimeout(() => {
      document.body.classList.remove('deactivated', 'deactivated-backwards');
    }, 333);
  };

  popup.addEventListener('close', onClose);
  popup.show();
};

const TIME_LABEL = 'Elapsed time since unlocked';

function setDocumentLangPackProperties(langPack: LangPackDifference.langPackDifference) {
  if(langPack.lang_code === 'ar' || langPack.lang_code === 'fa' && IS_BETA && false) {
    document.documentElement.classList.add('is-rtl');
    document.documentElement.dir = 'rtl';
    document.documentElement.lang = langPack.lang_code;
    I18n.setRTL(true);
  } else {
    document.documentElement.dir = 'ltr';
  }
}

(window as any)['showIconLibrary'] = async() => {
  const {showIconLibrary} = await import('./components/iconLibrary/trigger');
  showIconLibrary();
};

/* false &&  */document.addEventListener('DOMContentLoaded', async() => {
  const perf = performance.now();
  randomlyChooseVersionFromSearch();
  setSidebarLeftWidth();
  toggleAttributePolyfill();
  replaceChildrenPolyfill();
  rootScope.managers = getProxiedManagers();
  setManifest();
  setViewportHeightListeners();
  setWorkerProxy; // * just to import
  listenForWindowPrint();
  cancelImageEvents();
  setRootClasses();

  if(IS_INSTALL_PROMPT_SUPPORTED) {
    cacheInstallPrompt();
  }

  await PasscodeLockScreenController.waitForUnlock(async() => {
    rootScope.settings = await commonStateStorage.get('settings');
    themeController.setThemeListener();

    const langPack = await I18n.getCacheLangPackAndApply();
    setDocumentLangPackProperties(langPack);

    if(IS_BETA) import('./pages/pageIm'); // cache it
    // const settings = await commonStateStorage.get('settings');
    // const timeFormat =
    // I18n.setTimeFormat(settings?.timeFormat || STATE_INIT.settings?.timeFormat);
  });

  console.time(TIME_LABEL);

  // * (1) load states
  // * (2) check app version
  // * (3) send all states if updated
  // * (4) exit if not updated

  // * (1)
  const allStates = await apiManagerProxy.loadAllStates();
  const stateResult = allStates[getCurrentAccount()];

  console.timeLog(TIME_LABEL, 'allStates loaded');

  // * (2)
  singleInstance.addEventListener('deactivated', onInstanceDeactivated);
  await singleInstance.start();
  console.timeLog(TIME_LABEL, 'singleInstance started');

  const sendAllStatesPromise = singleInstance.deactivatedReason !== 'version' && apiManagerProxy.sendAllStates(allStates);
  if(singleInstance.deactivatedReason) {
    onInstanceDeactivated(singleInstance.deactivatedReason);
  }

  // * (3)
  await sendAllStatesPromise;
  console.timeLog(TIME_LABEL, 'sent all states (1)');

  const setUnreadMessagesText = () => {
    const text = I18n.format('UnreadMessages', true);
    document.documentElement.style.setProperty('--unread-messages-text', `"${text}"`);
  };

  const onLanguageApply = () => {
    fillLocalizedDates();
    setUnreadMessagesText();
  };

  const langPack = await I18n.getCacheLangPackAndApply();
  console.timeLog(TIME_LABEL, 'await I18n.getCacheLangPack()');
  I18n.setTimeFormat(rootScope.settings.timeFormat);
  onLanguageApply();
  rootScope.addEventListener('language_apply', onLanguageApply);

  // * (4)
  if(!sendAllStatesPromise) {
    return;
  }

  await apiManagerProxy.sendAllStates(allStates);

  console.timeLog(TIME_LABEL, 'sent all states (2)');

  const [, setHasFoldersSidebar] = useHasFoldersSidebar();
  setHasFoldersSidebar(!!rootScope.settings.tabsInSidebar);

  rootScope.managers.rootScope.getPremium().then((isPremium) => {
    rootScope.premium = isPremium;
  });

  themeController.setThemeListener();

  // * fetch lang pack updates
  if(langPack.localVersion !== App.langPackLocalVersion && IS_BETA) {
    I18n.getLangPackAndApply(langPack.lang_code);
  } else {
    checkLangPackForUpdates();
  }

  // * handle multi-tab language change (will occur extra time in the original tab though)
  rootScope.addEventListener('language_change', (langCode) => {
    I18n.getLangPackAndApply(langCode);
  });

  /**
   * won't fire if font is loaded too fast
   */
  function fadeInWhenFontsReady(elem: HTMLElement, promise: Promise<any>) {
    elem.style.opacity = '0';

    promise.then(() => {
      window.requestAnimationFrame(() => {
        elem.style.opacity = '';
      });
    });
  }

  console.log('got state, time:', performance.now() - perf);

  await IMAGE_MIME_TYPES_SUPPORTED_PROMISE;

  console.timeLog(TIME_LABEL, 'IMAGE_MIME_TYPES_SUPPORTED_PROMISE');


  setDocumentLangPackProperties(langPack);

  let authState = stateResult.state.authState;

  const hash = location.hash;
  const splitted = hash.split('?');
  const params = parseUriParamsLine(splitted[1] ?? splitted[0].slice(1));
  if(params.tgWebAuthToken && authState._ !== 'authStateSignedIn') {
    const data: AuthState.signImport['data'] = {
      token: params.tgWebAuthToken,
      dcId: +params.tgWebAuthDcId,
      userId: params.tgWebAuthUserId.toUserId(),
      isTest: params.tgWebAuthTest !== undefined && !!+params.tgWebAuthTest,
      tgAddr: params.tgaddr
    };

    if(data.isTest !== Modes.test) {
      const urlSearchParams = new URLSearchParams(location.search);
      if(+params.tgWebAuthTest) {
        urlSearchParams.set('test', '1');
      } else {
        urlSearchParams.delete('test');
      }

      location.search = urlSearchParams.toString();
      return;
    }

    rootScope.managers.appStateManager.pushToState('authState', authState = {_: 'authStateSignImport', data});

    // appNavigationController.overrideHash('?tgaddr=' + encodeURIComponent(params.tgaddr));
  }

  if(authState._ !== 'authStateSignedIn'/*  || 1 === 1 */) {
    console.log('Will mount auth page:', authState._, Date.now() / 1000);

    (async() => {
      const totalAccounts = await AccountController.getTotalAccounts();
      const hasSomeonePremium = await apiManagerProxy.hasSomeonePremium();
      const maxAccountNumber = hasSomeonePremium ? MAX_ACCOUNTS_PREMIUM : MAX_ACCOUNTS_FREE;

      const currentAccount = getCurrentAccount();

      if(currentAccount > Math.min(maxAccountNumber, totalAccounts + 1)) {
        changeAccount(1);
      }
    })();

    const el = document.getElementById('auth-pages');
    let scrollable: HTMLElement;

    let isEnteringAnimationFinished = false;

    const finishEnteringAnimation = async() => {
      if(isEnteringAnimationFinished) return;
      isEnteringAnimationFinished = true;

      await doubleRaf();
      el.classList.add('auth-pages-entering');

      await pause(1000); // Need a little more time for the animation to finish
      el.classList.remove('auth-pages-enter', 'auth-pages-entering');
    }

    if(el) {
      if(await sessionStorage.get('should_animate_auth')) {
        await sessionStorage.delete('should_animate_auth');
        el.classList.add('auth-pages-enter');

        // Just in case
        pause(1000).then(() => finishEnteringAnimation());
      }

      scrollable = el.querySelector('.scrollable') as HTMLElement;
      if((!IS_TOUCH_SUPPORTED || IS_MOBILE_SAFARI)) {
        scrollable.classList.add('no-scrollbar');
      }

      // * don't remove this line
      scrollable.style.opacity = '0';

      const placeholder = document.createElement('div');
      placeholder.classList.add('auth-placeholder');

      scrollable.prepend(placeholder);
      scrollable.append(placeholder.cloneNode());
    }

    try {
      await Promise.all([
        import('./lib/mtproto/telegramMeWebManager'),
        import('./lib/mtproto/webPushApiManager')
      ]).then(([meModule, pushModule]) => {
        meModule.default.setAuthorized(false);
        pushModule.default.forceUnsubscribe();
      });
    } catch(err) {

    }

    let pagePromise: Promise<void>;
    // langPromise.then(async() => {
    switch(authState._) {
      case 'authStateSignIn':
        pagePromise = (await import('./pages/pageSignIn')).default.mount();
        break;
      case 'authStateSignQr':
        pagePromise = (await import('./pages/pageSignQR')).default.mount();
        break;
      case 'authStateAuthCode':
        pagePromise = (await import('./pages/pageAuthCode')).default.mount(authState.sentCode);
        break;
      case 'authStatePassword':
        pagePromise = (await import('./pages/pagePassword')).default.mount();
        break;
      case 'authStateSignUp':
        pagePromise = (await import('./pages/pageSignUp')).default.mount(authState.authCode);
        break;
      case 'authStateSignImport':
        pagePromise = (await import('./pages/pageSignImport')).default.mount(authState.data);
        break;
    }
    // });

    if(scrollable) {
      // wait for text appear
      if(pagePromise) {
        await pagePromise;
      }

      const promise = 'fonts' in document ?
        Promise.race([
          pause(1000),
          document.fonts.ready
        ]) :
        Promise.resolve();

      promise.then(async() => {
        await pause(20);
        finishEnteringAnimation();
      });

      fadeInWhenFontsReady(scrollable, promise);
    }

    /* setTimeout(async() => {
      (await import('./pages/pageAuthCode')).default.mount({
        "_": "auth.sentCode",
        "pFlags": {},
        "flags": 6,
        "type": {
          "_": "auth.sentCodeTypeSms",
          "length": 5
        },
        "phone_code_hash": "",
        "next_type": {
          "_": "auth.codeTypeCall"
        },
        "timeout": 120,
        "phone_number": ""
      });

      (await import('./pages/pageSignQR')).default.mount();

      (await import('./pages/pagePassword')).default.mount();

      (await import('./pages/pageSignUp')).default.mount({
        "phone_code_hash": "",
        "phone_number": ""
      });
    }, 500); */
  } else {
    console.log('Will mount IM page:', Date.now() / 1000);

    const fontsPromise = loadFonts();
    fadeInWhenFontsReady(document.getElementById('main-columns'), fontsPromise);

    const [page, shouldAnimate] = await Promise.all([
      import('./pages/pageIm').then((module) => module.default),
      sessionStorage.get('should_animate_main')
    ]);
    if(shouldAnimate) {
      await sessionStorage.delete('should_animate_main');
      page.pageEl.classList.add('main-screen-enter');

      await page.mount();
      console.timeLog(TIME_LABEL, 'await page.mount()');

      await fontsPromise;
      console.timeLog(TIME_LABEL, 'await fontsPromise');


      await doubleRaf();
      page.pageEl.classList.add('main-screen-entering');
      await pause(200);

      page.pageEl.classList.remove('main-screen-enter', 'main-screen-entering');
    } else {
      await page.mount();
    }
  }
});
