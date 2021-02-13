/* import PasswordManager from './passwordManager';
import DcConfigurator from './dcConfigurator';
import RSAKeysManager from './rsaKeysManager';
import TimeManager from './timeManager';
import ServerTimeManager from './serverTimeManager';
import Authorizer from './authorizer';
import NetworkerFactory from './networkerFactory';
import ApiManager from './apiManager';
import ApiFileManager from './apiFileManager'; */

/* export class TelegramMeWebService {
  public disabled = Modes.test ||
    App.domains.indexOf(location.hostname) === -1 ||
    location.protocol !== 'http:' && location.protocol !== 'https:' ||
    location.protocol === 'https:' && location.hostname !== 'web.telegram.org';

  public setAuthorized(canRedirect: boolean) {
    if(this.disabled) {
      return false;
    }

    sessionStorage.get('tgme_sync').then((curValue) => {
      var ts = Date.now() / 1000;
      if(canRedirect &&
        curValue &&
        curValue.canRedirect === canRedirect &&
        curValue.ts + 86400 > ts) {
        return false;
      }

      sessionStorage.set({tgme_sync: {canRedirect: canRedirect, ts: ts}});

      var urls = [
        '//telegram.me/_websync_?authed=' + (canRedirect ? '1' : '0'),
        '//t.me/_websync_?authed=' + (canRedirect ? '1' : '0')
      ];

      urls.forEach(url => {
        let script = document.createElement('script');
        script.onload = script.onerror = function() {
          script.remove();
        };
        script.src = url;
        document.body.appendChild(script);
      });
    });
  }
}

export const telegramMeWebService = new TelegramMeWebService(); */

/* export namespace MTProto {
  //$($window).on('click keydown', rng_seed_time); // WARNING!

  export const passwordManager = PasswordManager;
  export const dcConfigurator = DcConfigurator;
  export const rsaKeysManager = RSAKeysManager;
  export const timeManager = TimeManager;
  export const authorizer = Authorizer;
  export const networkerFactory = NetworkerFactory;
  export const apiManager = ApiManager;
  export const apiFileManager = ApiFileManager;
  export const serverTimeManager = ServerTimeManager;
}

//(window as any).MTProto = MTProto; */

export default null;
