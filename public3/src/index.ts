import './materialize.scss';
import './scss/style.scss';
import './scss/tgico.scss';

//console.log('pineapples in my head');

/* Promise.all([
  import('./components/pageIm'),
  import('./components/pageSignIn'),
  import('./components/misc'),
  import('./lib/storage')
]).then(imports => {
  let [pageIm, pageSignIn, misc, AppStorage] = imports; */

  document.addEventListener('DOMContentLoaded', async() => {
    //let socket = new Socket(2);

    // We listen to the resize event (https://css-tricks.com/the-trick-to-viewport-units-on-mobile/)
    let setVH = () => {
      let vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    }
    window.addEventListener('resize', setVH);
    setVH();
  
    /* authorizer.auth(2).then((auth: any) => {
      console.log('authorized', auth);
    }, (error: any) => {
      console.log('Get networker error', error, error.stack);
      return Promise.reject(error);
    });
  
    return; */
  
    //console.time('get storage');
    let AppStorage = (await import('./lib/storage')).default;
    (await import('./lib/polyfill'));
  
    let auth = await AppStorage.get<any>('user_auth');

    //console.log('got auth:', auth);

    //console.timeEnd('get storage');

    if(navigator.userAgent.search(/OS X|iPhone|iPad|iOS/i) != -1) {
      document.documentElement.classList.add('is-mac', 'emoji-supported');
    } else if(navigator.userAgent.toLowerCase().indexOf('android') != -1) {
      document.documentElement.classList.add('is-android');
    }

    // @ts-ignore
    if(!(('ontouchstart' in window) || window.DocumentTouch && document instanceof DocumentTouch)) {
      document.documentElement.classList.add('no-touch');
    }

    let userID = auth.id || 0;

    if(!userID/*  || 1 == 1 */) {
      (await import('./pages/pageSignIn')).default.mount();

      /* setTimeout(async() => {
        (await import('./pages/pageAuthCode')).default.mount({
          "_": "auth.sentCode",
          "pFlags": {},
          "flags": 6,
          "type": {
            "_": "auth.sentCodeTypeSms",
            "length": 5
          },
          "phone_code_hash": "98008787f0546e7419",	
          "next_type": {
            "_": "auth.codeTypeCall"
          },
          "timeout": 120,
          "phone_number": "+380 50 914 45 04"
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
          "phone_code_hash": "98008787f0546e7419",	
          "phone_number": "+380 50 914 45 04"
        });
      }, 500); */
    } else {
      (await import('./pages/pageIm')).default.mount();
      //getNearestDc();
    }

    let utils = await import('./lib/utils');
    utils.$rootScope.myID = userID;
    let findUpClassName = utils.findUpClassName;
    Array.from(document.body.getElementsByClassName('popup-close')).forEach(el => {
      let popup = findUpClassName(el, 'popup');
      el.addEventListener('click', () => {
        popup.classList.remove('active');
      });
    });

    let ripple = (await import('./components/misc')).ripple;
    (Array.from(document.getElementsByClassName('rp')) as HTMLElement[]).forEach(el => ripple(el));
  });
//});


