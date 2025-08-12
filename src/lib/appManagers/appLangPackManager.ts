/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {AppManager} from './manager';
import {HelpCountriesList} from '../../layer';
import App from '../../config/app';

export class AppLangPackManager extends AppManager {
  protected after() {
    this.apiUpdatesManager.addMultipleEventsListeners({
      updateLangPack: (update) => {
        this.rootScope.dispatchEvent('langpack_update', update);
      },
      updateLangPackTooLong: (update) => {
        this.rootScope.dispatchEvent('langpack_update_too_long', update);
      }
    });
  }

  public getLangPack(langCode: string, langPack: string, ignoreCache?: boolean) {
    return this.apiManager.invokeApiCacheable('langpack.getLangPack', {
      lang_code: langCode,
      lang_pack: langPack
    }, {override: ignoreCache});
  }

  public getCountriesList(langCode: string, ignoreCache?: boolean) {
    return this.apiManager.invokeApiCacheable('help.getCountriesList', {
      lang_code: langCode,
      hash: 0
    }, {override: ignoreCache}) as Promise<HelpCountriesList.helpCountriesList>;
  }

  public getStrings(langCode: string, strings: string[]) {
    return this.apiManager.invokeApi('langpack.getStrings', {
      lang_pack: App.langPack,
      lang_code: langCode,
      keys: strings
    });
  }

  public getDifference(langCode: string, fromVersion: number) {
    return this.apiManager.invokeApi('langpack.getDifference', {
      lang_code: langCode,
      from_version: fromVersion,
      lang_pack: App.langPack
    });
  }
}
