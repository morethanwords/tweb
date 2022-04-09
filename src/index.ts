/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import App from './config/app';
import blurActiveElement from './helpers/dom/blurActiveElement';
import { cancelEvent } from './helpers/dom/cancelEvent';
import { IS_STICKY_INPUT_BUGGED } from './helpers/dom/fixSafariStickyInputFocusing';
import loadFonts from './helpers/dom/loadFonts';
import IS_EMOJI_SUPPORTED from './environment/emojiSupport';
import { IS_MOBILE_SAFARI } from './environment/userAgent';
import './materialize.scss';
import './scss/style.scss';
/* import { computeCheck } from './lib/crypto/srp';
import { salt1, salt2, g, p, srp_id, secure_random, srp_B, password } from './mock/srp'; */

//console.log('pineapples are in my head');

/* console.time('get storage1');
import * as a from './lib/config';
import * as b from './lib/mtproto/mtproto_config';
import * as c from './helpers/userAgent';
import * as d from './lib/mtproto/mtprotoworker';
import * as e from './lib/polyfill';
import * as f from './lib/storage';
a && b && c && d && e && f;
console.timeEnd('get storage1'); */

/* Promise.all([
  import('./components/pageIm'),
  import('./components/pageSignIn'),
  import('./components/misc'),
  import('./lib/storage')
]).then(imports => {
  let [pageIm, pageSignIn, misc, AppStorage] = imports; */

  document.addEventListener('DOMContentLoaded', async() => {
    //let socket = new Socket(2);

    if(!Element.prototype.toggleAttribute) {
      Element.prototype.toggleAttribute = function(name, force) {
        if(force !== void 0) force = !!force;
        
        if(this.hasAttribute(name)) {
          if(force) return true;
    
          this.removeAttribute(name);
          return false;
        }
        if(force === false) return false;
          
        this.setAttribute(name, "");
        return true;
      };
    }

    // We listen to the resize event (https://css-tricks.com/the-trick-to-viewport-units-on-mobile/)
    // @ts-ignore
    const w = window.visualViewport || window; // * handle iOS keyboard
    let setViewportVH = false/* , hasFocus = false */;
    let lastVH: number;
    const setVH = () => {
      // @ts-ignore
      const vh = (setViewportVH && !rootScope.default.isOverlayActive ? w.height || w.innerHeight : window.innerHeight) * 0.01;
      if(lastVH === vh) {
        return;
      } else if(touchSupport.IS_TOUCH_SUPPORTED && lastVH < vh && (vh - lastVH) > 1) {
        blurActiveElement(); // (Android) fix blurring inputs when keyboard is being closed (e.g. closing keyboard by back arrow and touching a bubble)
      }

      lastVH = vh;

      //const vh = document.documentElement.scrollHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);

      //console.log('setVH', vh, setViewportVH ? w : window);

      /* if(setViewportVH && userAgent.isSafari && touchSupport.isTouchSupported && document.activeElement && (document.activeElement as HTMLElement).blur) {
        const rect = document.activeElement.getBoundingClientRect();
        if(rect.top < 0 || rect.bottom >= (w as any).height) {
          fastSmoothScroll(findUpClassName(document.activeElement, 'scrollable-y') || window as any, document.activeElement as HTMLElement, 'center', 4, undefined, FocusDirection.Static);
        }
      } */
    };

    // * hook worker constructor to set search parameters (test, debug, etc)
    const workerHandler = {
      construct(target: any, args: any) {
        //console.log(target, args);
        const url = args[0] + location.search;

        return new target(url);
      }
    };
    
    const workerProxy = new Proxy(Worker, workerHandler);
    Worker = workerProxy;

    const [_, touchSupport, userAgent, rootScope, appStateManager, I18n, __/* , ___ */] = await Promise.all([
      import('./lib/polyfill'),
      import('./environment/touchSupport'),
      import('./environment/userAgent'),
      import('./lib/rootScope'),
      import('./lib/appManagers/appStateManager'),
      import('./lib/langPack'),
      import('./helpers/peerIdPolyfill'),
      // import('./helpers/cacheFunctionPolyfill')
    ]);

    //console.timeEnd('get storage');

    window.addEventListener('resize', setVH);
    setVH();

    //console.log(new Uint8Array([255, 200, 145]).hex);

    if(IS_STICKY_INPUT_BUGGED) {
      const toggleResizeMode = () => {
        setViewportVH = tabId === 1 && IS_STICKY_INPUT_BUGGED && !rootScope.default.isOverlayActive;
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
      rootScope.default.addEventListener('im_tab_change', (id) => {
        const wasTabId = tabId !== undefined;
        tabId = id;
  
        if(wasTabId || tabId === 1) {
          toggleResizeMode();
        }
      });
      
      rootScope.default.addEventListener('overlay_toggle', () => {
        toggleResizeMode();
      });
    }

    if(userAgent.IS_FIREFOX && !IS_EMOJI_SUPPORTED) {
      document.addEventListener('dragstart', (e) => {
        const target = e.target as HTMLElement;
        if(target.tagName === 'IMG' && target.classList.contains('emoji')) {
          cancelEvent(e);
          return false;
        }
      });
    }

    // prevent firefox image dragging
    document.addEventListener('dragstart', (e) => {
      if((e.target as HTMLElement)?.tagName === "IMG") {
        e.preventDefault();
        return false;
      }
    });

    if(userAgent.IS_FIREFOX) {
      document.documentElement.classList.add('is-firefox');
    }

    if(userAgent.IS_MOBILE) {
      document.documentElement.classList.add('is-mobile');
    }

    if(userAgent.IS_APPLE) {
      if(userAgent.IS_SAFARI) {
        document.documentElement.classList.add('is-safari');
      }
      
      // document.documentElement.classList.add('emoji-supported');

      if(userAgent.IS_APPLE_MOBILE) {
        document.documentElement.classList.add('is-ios');
      } else {
        document.documentElement.classList.add('is-mac');
      }
    } else if(userAgent.IS_ANDROID) {
      document.documentElement.classList.add('is-android');

      /* document.addEventListener('focusin', (e) => {
        hasFocus = true;
        focusTime = Date.now();
      }, {passive: true});

      document.addEventListener('focusout', () => {
        hasFocus = false;
      }, {passive: true}); */
    }

    if(!touchSupport.IS_TOUCH_SUPPORTED) {
      document.documentElement.classList.add('no-touch');
    } else {
      document.documentElement.classList.add('is-touch');
      /* document.addEventListener('touchmove', (event: any) => {
        event = event.originalEvent || event;
        if(event.scale && event.scale !== 1) {
          event.preventDefault();
        }
      }, {capture: true, passive: false}); */
    }

    /* if(config.isServiceWorkerSupported) {
      await navigator.serviceWorker.ready;
      navigator.serviceWorker.controller ? true : await new Promise((resolve, reject) => {
        navigator.serviceWorker.addEventListener('controllerchange', resolve);
      });
    } */
  
    //console.time('get storage');

    const perf = performance.now();

    //import('./vendor/dateFormat');

    const langPromise = I18n.default.getCacheLangPack();

    const [state, langPack] = await Promise.all([
      appStateManager.default.getState(), 
      langPromise
    ]);
    //I18n.getCacheLangPack();
    //console.log('got auth:', auth);
    //console.timeEnd('get storage');

    I18n.default.setTimeFormat(state.settings.timeFormat);

    rootScope.default.setThemeListener();

    if(langPack.appVersion !== App.langPackVersion) {
      I18n.default.getLangPack(langPack.lang_code);
    }

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

    const authState = state.authState;
    if(authState._ !== 'authStateSignedIn'/*  || 1 === 1 */) {
      console.log('Will mount auth page:', authState._, Date.now() / 1000);

      const el = document.getElementById('auth-pages');
      let scrollable: HTMLElement;
      if(el) {
        scrollable = el.querySelector('.scrollable') as HTMLElement;
        if((!touchSupport.IS_TOUCH_SUPPORTED || IS_MOBILE_SAFARI)) {
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
      //langPromise.then(async() => {
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
        }
      //});

      if(scrollable) {
        // wait for text appear
        if(pagePromise) {
          await pagePromise;
        }

        const promise = 'fonts' in document ? 
          Promise.race([
            new Promise((resolve) => setTimeout(resolve, 1e3)), 
            // @ts-ignore
            document.fonts.ready
          ]) : 
          Promise.resolve();
        fadeInWhenFontsReady(scrollable, promise);
      }

      /* computeCheck(password, {
        current_algo: {
          salt1, 
          salt2,
          p,
          g
        },
        srp_id,
        srp_B,
        secure_random,
      }).then(res => {
        console.log(res);
      }); */

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
      }, 500); */
      /* setTimeout(async() => {
        (await import('./pages/pageSignQR')).default.mount();
      }, 500); */
      /* setTimeout(async() => {
        (await import('./pages/pagePassword')).default.mount();
      }, 500); */
      /* setTimeout(async() => {
        (await import('./pages/pageSignUp')).default.mount({
          "phone_code_hash": "",	
          "phone_number": ""
        });
      }, 500); */
    } else {
      console.log('Will mount IM page:', Date.now() / 1000);
      fadeInWhenFontsReady(document.getElementById('main-columns'), loadFonts());
      (await import('./pages/pageIm')).default.mount();
      //getNearestDc();
    }

    const ripple = (await import('./components/ripple')).ripple;
    (Array.from(document.getElementsByClassName('rp')) as HTMLElement[]).forEach(el => ripple(el));
  });
//});


