//import apiManager from '../lib/mtproto/apiManager';
import apiManager from '../lib/mtproto/mtprotoworker';
import Page from './page';
import pageIm from './pageIm';
import pagePassword from './pagePassword';
import pageSignIn from './pageSignIn';
import { App } from '../lib/mtproto/mtproto_config';
import { bytesToBase64, bytesCmp } from '../lib/bin_utils';
import serverTimeManager from '../lib/mtproto/serverTimeManager';
import { AuthAuthorization, AuthLoginToken } from '../layer';

let onFirstMount = async() => {
  const pageElement = page.pageEl;
  const imageDiv = pageElement.querySelector('.auth-image') as HTMLDivElement;

  page.pageEl.querySelector('.a-qr').addEventListener('click', () => {
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
  
  let options: {dcID?: number, ignoreErrors: true} = {ignoreErrors: true};
  let prevToken: Uint8Array | number[];

  return async() => {
    stop = false;

    do {
      if(stop) {
        break;
      }
  
      try {
        let loginToken = await apiManager.invokeApi('auth.exportLoginToken', {
          api_id: App.id,
          api_hash: App.hash,
          except_ids: []
        }, {ignoreErrors: true});
    
        if(loginToken._ == 'auth.loginTokenMigrateTo') {
          if(!options.dcID) {
            options.dcID = loginToken.dc_id;
            apiManager.setBaseDcID(loginToken.dc_id);
            //continue;
          }
          
          loginToken = await apiManager.invokeApi('auth.importLoginToken', {
            token: loginToken.token
          }, options) as AuthLoginToken.authLoginToken;
        }
  
        if(loginToken._ == 'auth.loginTokenSuccess') {
          const authorization = loginToken.authorization as any as AuthAuthorization.authAuthorization;
          apiManager.setUserAuth({
            id: authorization.user.id
          });
          pageIm.mount();
          break;
        }
  
        /* // to base64
        var decoder = new TextDecoder('utf8');
        var b64encoded = btoa(String.fromCharCode.apply(null, [...loginToken.token])); */
  
        if(!prevToken || !bytesCmp(prevToken, loginToken.token)) {
          prevToken = loginToken.token;
  
          let encoded = bytesToBase64(loginToken.token);
          let url = "tg://login?token=" + encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/\=+$/, "");
    
          imageDiv.innerHTML = '';
          const qrCode = new QRCodeStyling({
            width: 166,
            height: 166,
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
        }
  
        let timestamp = Date.now() / 1000;
        let diff = loginToken.expires - timestamp - serverTimeManager.serverTimeOffset;
  
        await new Promise((resolve, reject) => setTimeout(resolve, diff > 5 ? 5e3 : 1e3 * diff | 0));
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
