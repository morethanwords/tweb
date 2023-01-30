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

  protected after() {
    this.wallPapers = {};
  }

  private saveWallPaper(wallPaper: WallPaper) {
    if(!wallPaper) {
      return wallPaper;
    }
    // const oldWallPaper = this.wallPapers[wallPaper.id];

    // ! IT'S BROKEN NOW. SERVER RETURNS SAME ID FOR DIFFERENT WALLPAPERS
    // if(oldWallPaper) {
    //   console.log('rewrite', {...oldWallPaper}, {...wallPaper});
    // }

    if(wallPaper._ !== 'wallPaperNoFile') {
      wallPaper.document = this.appDocsManager.saveDoc(wallPaper.document, {type: 'wallPaper', wallPaperId: wallPaper.id});
    }

    // if(oldWallPaper) {
    //   return Object.assign(oldWallPaper, wallPaper);
    // } else {
    this.wallPapers[wallPaper.id] = wallPaper;
    // }

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

  public getThemes() {
    return this.apiManager.invokeApiSingleProcess({
      method: 'account.getThemes',
      params: {format: 'macos', hash: 0},
      processResult: (accountThemes) => {
        assumeType<AccountThemes.accountThemes>(accountThemes);

        accountThemes.themes.forEach((theme) => {
          if(!theme.settings) {
            return;
          }

          theme.settings.forEach((themeSettings) => {
            themeSettings.wallpaper = this.saveWallPaper(themeSettings.wallpaper);
          });
        });

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
