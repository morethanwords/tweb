//import apiManager from '../lib/mtproto/apiManager';
import apiManager from '../lib/mtproto/mtprotoworker';
import Page from './page';
import pageIm from './pageIm';
import pagePassword from './pagePassword';
import pageSignIn from './pageSignIn';
import serverTimeManager from '../lib/mtproto/serverTimeManager';
import { AuthAuthorization, AuthLoginToken } from '../layer';
import { bytesCmp, bytesToBase64 } from '../helpers/bytes';
import { pause } from '../helpers/schedulers';
import App from '../config/app';
import Button from '../components/button';
import { _i18n, i18n, LangPackKey } from '../lib/langPack';

let onFirstMount = async() => {
  const pageElement = page.pageEl;
  const imageDiv = pageElement.querySelector('.auth-image') as HTMLDivElement;

  const inputWrapper = document.createElement('div');
  inputWrapper.classList.add('input-wrapper');

  const btnBack = Button('btn-primary btn-secondary btn-primary-transparent primary', {text: 'Login.QR.Cancel'});
  inputWrapper.append(btnBack);

  const container = imageDiv.parentElement;

  const h4 = document.createElement('h4');
  _i18n(h4, 'Login.QR.Title');

  const helpList = document.createElement('ol');
  helpList.classList.add('qr-description');
  (['Login.QR.Help1', 'Login.QR.Help2', 'Login.QR.Help3'] as LangPackKey[]).forEach((key) => {
    const li = document.createElement('li');
    li.append(i18n(key));
    helpList.append(li);
  });

  container.append(h4, helpList, inputWrapper);

  btnBack.addEventListener('click', () => {
    pageSignIn.mount();
    stop = true;
  });
  
  const results = await Promise.all([
    import('qr-code-styling' as any)
  ]);
  const QRCodeStyling = results[0].default;

  let stop = false;
  document.addEventListener('user_auth', () => {
    stop = true;
    cachedPromise = null;
  }, {once: true});
  
  let options: {dcId?: number, ignoreErrors: true} = {ignoreErrors: true};
  let prevToken: Uint8Array | number[];

  const iterate = async(isLoop: boolean) => {
    try {
      let loginToken = await apiManager.invokeApi('auth.exportLoginToken', {
        api_id: App.id,
        api_hash: App.hash,
        except_ids: []
      }, {ignoreErrors: true});
  
      if(loginToken._ === 'auth.loginTokenMigrateTo') {
        if(!options.dcId) {
          options.dcId = loginToken.dc_id;
          apiManager.setBaseDcId(loginToken.dc_id);
          //continue;
        }
        
        loginToken = await apiManager.invokeApi('auth.importLoginToken', {
          token: loginToken.token
        }, options) as AuthLoginToken.authLoginToken;
      }

      if(loginToken._ === 'auth.loginTokenSuccess') {
        const authorization = loginToken.authorization as any as AuthAuthorization.authAuthorization;
        apiManager.setUserAuth(authorization.user.id);
        pageIm.mount();
        return true;
      }

      /* // to base64
      var decoder = new TextDecoder('utf8');
      var b64encoded = btoa(String.fromCharCode.apply(null, [...loginToken.token])); */

      if(!prevToken || !bytesCmp(prevToken, loginToken.token)) {
        prevToken = loginToken.token;

        let encoded = bytesToBase64(loginToken.token);
        let url = "tg://login?token=" + encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/\=+$/, "");

        const qrCode = new QRCodeStyling({
          width: 240 * window.devicePixelRatio,
          height: 240 * window.devicePixelRatio,
          data: url,
          image: "assets/img/logo_padded.svg",
          dotsOptions: {
            color: "#000000",
            type: "rounded"
          },
          imageOptions: {
            imageSize: .75
          },
          backgroundOptions: {
            color: "#ffffff"
          },
          qrOptions: {
            errorCorrectionLevel: "L"
          }
        });

        qrCode.append(imageDiv);
        (imageDiv.lastChild as HTMLCanvasElement).classList.add('qr-canvas');

        let promise: Promise<void>;
        if(qrCode._drawingPromise) {
          promise = qrCode._drawingPromise;
        } else {
          promise = Promise.race([
            pause(1000),
            new Promise<void>((resolve) => {
              qrCode._canvas._image.addEventListener('load', () => {
                window.requestAnimationFrame(() => resolve());
              }, {once: true});
            })
          ]);
        }

        // * это костыль, но библиотека не предоставляет никаких событий
        await promise.then(() => {
          Array.from(imageDiv.children).slice(0, -1).forEach(el => {
            el.remove();
          });
        });
      }

      if(isLoop) {
        let timestamp = Date.now() / 1000;
        let diff = loginToken.expires - timestamp - serverTimeManager.serverTimeOffset;
  
        await pause(diff > 5 ? 5e3 : 1e3 * diff | 0);
      }
    } catch(err) {
      switch(err.type) {
        case 'SESSION_PASSWORD_NEEDED':
          console.warn('pageSignQR: SESSION_PASSWORD_NEEDED');
          err.handled = true;
          pagePassword.mount();
          stop = true;
          cachedPromise = null;
          break;
        default:
          console.error('pageSignQR: default error:', err);
          break;
      }
    }
  };

  await iterate(false);

  return async() => {
    stop = false;

    do {
      if(stop) {
        break;
      }
  
      const needBreak = await iterate(true);
      if(needBreak) {
        break;
      }
    } while(true);
  };
};

let cachedPromise: Promise<() => Promise<void>>;
const page = new Page('page-signQR', true, () => {
  return cachedPromise;
}, () => {
  //console.log('onMount');
  if(!cachedPromise) cachedPromise = onFirstMount();
  cachedPromise.then(func => {
    func();
  });
});

export default page;
