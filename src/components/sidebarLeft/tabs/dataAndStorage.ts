/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {AutoDownloadPeerTypeSettings, STATE_INIT, SETTINGS_INIT} from '../../../config/state';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import replaceContent from '../../../helpers/dom/replaceContent';
import toggleDisability from '../../../helpers/dom/toggleDisability';
import formatBytes from '../../../helpers/formatBytes';
import copy from '../../../helpers/object/copy';
import deepEqual from '../../../helpers/object/deepEqual';
import {FormatterArguments, i18n, join, LangPackKey} from '../../../lib/langPack';
import rootScope from '../../../lib/rootScope';
import Button from '../../button';
import CheckboxField from '../../checkboxField';
import confirmationPopup from '../../confirmationPopup';
import Row from '../../row';
import {SliderSuperTabEventable, SliderSuperTabEventableConstructable} from '../../sliderTab';
import AppAutoDownloadFileTab from './autoDownload/file';
import AppAutoDownloadPhotoTab from './autoDownload/photo';
import AppAutoDownloadVideoTab from './autoDownload/video';
import SettingSection from '../../settingSection';
import {joinDeepPath} from '../../../helpers/object/setDeepProperty';

const AUTO_DOWNLOAD_FOR_KEYS: {[k in keyof AutoDownloadPeerTypeSettings]: LangPackKey} = {
  contacts: 'AutoDownloadContacts',
  private: 'AutoDownloadPm',
  groups: 'AutoDownloadGroups',
  channels: 'AutoDownloadChannels'
};

export default class AppDataAndStorageTab extends SliderSuperTabEventable {
  public init() {
    this.setTitle('DataSettings');

    {
      const section = new SettingSection({name: 'AutomaticMediaDownload', caption: 'AutoDownloadAudioInfo'});

      const autoCheckboxField = new CheckboxField({
        text: 'AutoDownloadMedia',
        name: 'auto',
        checked: !rootScope.settings.autoDownloadNew.pFlags.disabled,
        listenerSetter: this.listenerSetter
      });

      const autoRow = new Row({
        checkboxField: autoCheckboxField,
        listenerSetter: this.listenerSetter
      });

      const onChange = () => {
        toggleDisability([resetButton],
          deepEqual(rootScope.settings.autoDownload, SETTINGS_INIT.autoDownload) &&
          deepEqual(rootScope.settings.autoDownloadNew, SETTINGS_INIT.autoDownloadNew));
      };

      const setSubtitles = () => {
        this.setAutoDownloadSubtitle(photoRow, rootScope.settings.autoDownload.photo /* state.settings.autoDownloadNew.photo_size_max */);
        this.setAutoDownloadSubtitle(videoRow, rootScope.settings.autoDownload.video/* , state.settings.autoDownloadNew.video_size_max */);
        this.setAutoDownloadSubtitle(fileRow, rootScope.settings.autoDownload.file, rootScope.settings.autoDownloadNew.file_size_max);
      };

      const openTab = (tabConstructor: SliderSuperTabEventableConstructable) => {
        const tab = this.slider.createTab(tabConstructor);
        tab.open();

        this.listenerSetter.add(tab.eventListener)('destroy', () => {
          setSubtitles();
          onChange();
        }, {once: true});
      };

      const photoRow = new Row({
        titleLangKey: 'AutoDownloadPhotos',
        subtitle: '',
        clickable: () => {
          openTab(AppAutoDownloadPhotoTab);
        },
        listenerSetter: this.listenerSetter
      });

      const videoRow = new Row({
        titleLangKey: 'AutoDownloadVideos',
        subtitle: '',
        clickable: () => {
          openTab(AppAutoDownloadVideoTab);
        },
        listenerSetter: this.listenerSetter
      });

      const fileRow = new Row({
        titleLangKey: 'AutoDownloadFiles',
        subtitle: '',
        clickable: () => {
          openTab(AppAutoDownloadFileTab);
        },
        listenerSetter: this.listenerSetter
      });

      const resetButton = Button('btn-primary btn-transparent primary', {icon: 'delete', text: 'ResetAutomaticMediaDownload'});
      attachClickEvent(resetButton, () => {
        confirmationPopup({
          titleLangKey: 'ResetAutomaticMediaDownloadAlertTitle',
          descriptionLangKey: 'ResetAutomaticMediaDownloadAlert',
          button: {
            langKey: 'Reset'
          }
        }).then(() => {
          const settings = rootScope.settings;
          settings.autoDownloadNew = copy(SETTINGS_INIT.autoDownloadNew);
          settings.autoDownload = copy(SETTINGS_INIT.autoDownload);
          rootScope.settings = settings;
          this.managers.appStateManager.setByKey('settings', settings);

          setSubtitles();
          autoCheckboxField.checked = !rootScope.settings.autoDownloadNew.pFlags.disabled;
        });
      });

      const onDisabledChange = () => {
        const disabled = !autoCheckboxField.checked;

        const autoDownloadNew = rootScope.settings.autoDownloadNew;
        if(disabled) {
          autoDownloadNew.pFlags.disabled = true;
        } else {
          delete autoDownloadNew.pFlags.disabled;
        }

        [photoRow, videoRow, fileRow].forEach((row) => {
          row.container.classList.toggle('is-disabled', disabled);
        });

        this.managers.appStateManager.setByKey(joinDeepPath('settings', 'autoDownloadNew'), autoDownloadNew);

        onChange();
      };

      autoCheckboxField.input.addEventListener('change', onDisabledChange);
      onDisabledChange();
      setSubtitles();

      section.content.append(
        autoRow.container,
        photoRow.container,
        videoRow.container,
        fileRow.container,
        resetButton
      );

      this.scrollable.append(section.container);
    }
  }

  private setAutoDownloadSubtitle(row: Row, settings: AutoDownloadPeerTypeSettings, sizeMax?: number) {
    let key: LangPackKey;
    const args: FormatterArguments = [];

    const peerKeys = Object.keys(settings) as (keyof typeof AUTO_DOWNLOAD_FOR_KEYS)[];
    const enabledKeys = peerKeys.map((key) => settings[key] ? AUTO_DOWNLOAD_FOR_KEYS[key] : undefined).filter(Boolean);
    if(!enabledKeys.length || sizeMax === 0) {
      key = 'AutoDownloadOff';
    } else {
      const isAll = enabledKeys.length === peerKeys.length;
      if(sizeMax !== undefined) {
        key = isAll ? 'AutoDownloadUpToOnAllChats' : 'AutoDownloadOnUpToFor';
        args.push(formatBytes(sizeMax));
      } else {
        key = isAll ? 'AutoDownloadOnAllChats' : 'AutoDownloadOnFor';
      }

      if(!isAll) {
        const fragment = document.createElement('span');
        fragment.append(...join(enabledKeys.map((key) => i18n(key)), true, false));
        args.push(fragment);
      }
    }

    replaceContent(row.subtitle, i18n(key, args));
  }
}
