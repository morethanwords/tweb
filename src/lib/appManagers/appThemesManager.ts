/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import assumeType from '../../helpers/assumeType';
import {AccountThemes, AccountWallPapers, InputWallPaper, WallPaper} from '../../layer';
import {AppManager} from './manager';

type WallPaperId = WallPaper['id'];

export default class AppThemesManager extends AppManager {
  private wallPapers: {[id: WallPaperId]: WallPaper};
  private wallPapersBySlug: {[slug: string]: WallPaper};

  protected after() {
    this.wallPapers = {};
    this.wallPapersBySlug = {};

    this.rootScope.addEventListener('user_auth', () => {
      this.getThemes();
    });

    return this.appStateManager.getState().then((state) => {
      try {
        this.saveAccountThemes(state.accountThemes);
      } catch(err) {}
    });
  }

  public saveWallPaper(wallPaper: WallPaper) {
    if(!wallPaper) {
      return wallPaper;
    }
    // const oldWallPaper = this.wallPapers[wallPaper.id];

    // ! IT'S BROKEN NOW. SERVER RETURNS SAME ID FOR DIFFERENT WALLPAPERS
    // if(oldWallPaper) {
    //   console.log('rewrite', {...oldWallPaper}, {...wallPaper});
    // }

    let slug: string;
    if(wallPaper._ !== 'wallPaperNoFile') {
      slug = wallPaper.slug;
      wallPaper.document = this.appDocsManager.saveDoc(wallPaper.document, {type: 'wallPaper', wallPaperId: wallPaper.id});
    }

    // if(oldWallPaper) {
    //   return Object.assign(oldWallPaper, wallPaper);
    // } else {
    this.wallPapers[wallPaper.id] = wallPaper;
    // }

    if(slug) {
      this.wallPapersBySlug[slug] = wallPaper;
    }

    return wallPaper;
  }

  public getWallPaper(inputWallPaper: InputWallPaper) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'account.getWallPaper',
      params: {wallpaper: inputWallPaper},
      processResult: (wallPaper) => {
        return this.saveWallPaper(wallPaper);
      }
    });
  }

  public getInputWallPaper(wallPaper: WallPaper | string): InputWallPaper {
    if(typeof(wallPaper) === 'string') {
      return {_: 'inputWallPaperSlug', slug: wallPaper};
    } else if(wallPaper._ === 'wallPaperNoFile') {
      return {_: 'inputWallPaperNoFile', id: wallPaper.id};
    } else {
      return {_: 'inputWallPaper', id: wallPaper.id, access_hash: wallPaper.access_hash};
    }
  }

  public getWallPaperById(id: WallPaperId) {
    const wallPaper = this.wallPapers[id];
    return this.getWallPaper(this.getInputWallPaper(wallPaper));
  }

  public getWallPaperBySlug(slug: string) {
    const wallPaper = this.wallPapersBySlug[slug];
    if(wallPaper) {
      return wallPaper;
    }

    return this.getWallPaper(this.getInputWallPaper(slug));
  }

  private saveAccountThemes(accountThemes: AccountThemes.accountThemes) {
    accountThemes.themes?.forEach((theme) => {
      if(!theme.settings) {
        return;
      }

      theme.settings.forEach((themeSettings) => {
        themeSettings.wallpaper = this.saveWallPaper(themeSettings.wallpaper);
      });
    });
  }

  public async getThemes() {
    const state = await this.appStateManager.getState();
    const oldAccountThemes = state.accountThemes;
    return this.apiManager.invokeApiSingleProcess({
      method: 'account.getThemes',
      params: {format: 'macos', hash: oldAccountThemes?.hash ?? 0},
      processResult: async(accountThemes) => {
        if(accountThemes._ === 'account.themesNotModified') {
          return oldAccountThemes.themes;
        }

        this.saveAccountThemes(accountThemes);
        await this.appStateManager.pushToState('accountThemes', accountThemes);
        return accountThemes.themes;
      }
    });
  }

  public getWallPapers() {
    return this.apiManager.invokeApiHashable({method: 'account.getWallPapers'}).then((accountWallpapers) => {
      const wallPapers = (accountWallpapers as AccountWallPapers.accountWallPapers).wallpapers;
      wallPapers.forEach((wallPaper, idx, arr) => {
        arr[idx] = this.saveWallPaper(wallPaper);
      });

      return wallPapers;
    });
  }
}
