/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import formatBytes from '../../../../helpers/formatBytes';
import {joinDeepPath} from '../../../../helpers/object/setDeepProperty';
import debounce from '../../../../helpers/schedulers/debounce';
import I18n from '../../../../lib/langPack';
import rootScope from '../../../../lib/rootScope';
import {SliderSuperTabEventable} from '../../../sliderTab';
import {RangeSettingSelector} from '../generalSettings';
import {autoDownloadPeerTypeSection} from './photo';

export default class AppAutoDownloadFileTab extends SliderSuperTabEventable {
  public init() {
    this.setTitle('AutoDownloadFiles');

    const debouncedSave = debounce((sizeMax: number) => {
      this.managers.appStateManager.setByKey(joinDeepPath('settings', 'autoDownloadNew', 'file_size_max'), sizeMax);
    }, 200, false, true);

    const section = autoDownloadPeerTypeSection('file', 'AutoDownloadFilesTitle', this.listenerSetter);

    const MIN = 512 * 1024;
    // const MAX = 2 * 1024 * 1024 * 1024;
    const MAX = 20 * 1024 * 1024;
    const MAX_RANGE = MAX - MIN;

    const sizeMax = rootScope.settings.autoDownloadNew.file_size_max;
    const value = Math.sqrt(Math.sqrt((sizeMax - MIN) / MAX_RANGE));
    const upTo = new I18n.IntlElement({
      key: 'AutodownloadSizeLimitUpTo',
      args: [formatBytes(sizeMax)]
    });
    const range = new RangeSettingSelector('AutoDownloadMaxFileSize', 0.01, value, 0, 1, false);
    range.onChange = (value) => {
      const sizeMax = (value ** 4 * MAX_RANGE + MIN) | 0;

      upTo.compareAndUpdate({args: [formatBytes(sizeMax)]});

      debouncedSave(sizeMax);
    };

    range.valueContainer.append(upTo.element);

    section.content.append(range.container);

    this.scrollable.append(section.container);
  }
}
