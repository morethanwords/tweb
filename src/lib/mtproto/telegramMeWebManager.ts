/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 *
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import App from '../../config/app';
import {MOUNT_CLASS_TO} from '../../config/debug';
import Modes from '../../config/modes';
import loadScript from '../../helpers/dom/loadScript';
import tsNow from '../../helpers/tsNow';
import sessionStorage from '../sessionStorage';

export class TelegramMeWebManager {
  private disabled = /* false &&  */(Modes.test || !App.domains.includes(location.hostname));

  public setAuthorized(canRedirect: boolean) {
    if(this.disabled) {
      return;
    }

    return sessionStorage.get('tgme_sync').then((curValue) => {
      const ts = tsNow(true);
      if(
        canRedirect &&
        curValue?.canRedirect === canRedirect &&
        (curValue.ts + 86400) > ts
      ) {
        return;
      }

      sessionStorage.set({
        tgme_sync: {
          canRedirect,
          ts
        }
      });

      const path = `_websync_?authed=${canRedirect ? '1' : '0'}&version=${encodeURIComponent(App.version + ' ' + App.suffix)}`;
      const urls = [
        '//telegram.me/' + path,
        '//t.me/' + path
      ];

      const promises = urls.map((url) => {
        return loadScript(url).then((script) => {
          script.remove();
        });
      });

      return Promise.all(promises);
    });
  }
}

const telegramMeWebManager = new TelegramMeWebManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.telegramMeWebManager = telegramMeWebManager);
export default telegramMeWebManager;
