/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {AutoDownloadPeerTypeSettings, STATE_INIT, SETTINGS_INIT} from '@config/state';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import replaceContent from '@helpers/dom/replaceContent';
import toggleDisability from '@helpers/dom/toggleDisability';
import formatBytes from '@helpers/formatBytes';
import copy from '@helpers/object/copy';
import deepEqual from '@helpers/object/deepEqual';
import {FormatterArguments, i18n, join, LangPackKey} from '@lib/langPack';
import Button from '@components/button';
import CheckboxField from '@components/checkboxField';
import confirmationPopup from '@components/confirmationPopup';
import Row from '@components/row';
import {SliderSuperTabEventable, SliderSuperTabEventableConstructable} from '@components/sliderTab';
import AppAutoDownloadFileTab from '@components/sidebarLeft/tabs/autoDownload/file';
import AppAutoDownloadPhotoTab from '@components/sidebarLeft/tabs/autoDownload/photo';
import AppAutoDownloadVideoTab from '@components/sidebarLeft/tabs/autoDownload/video';
import SettingSection from '@components/settingSection';
import {useAppSettings} from '@stores/appSettings';
import {unwrap} from 'solid-js/store';
import {renderComponent} from '@helpers/solid/renderComponent';
import {StorageQuota, StorageQuotaControls} from './storageQuota';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';

const AUTO_DOWNLOAD_FOR_KEYS: {[k in keyof AutoDownloadPeerTypeSettings]: LangPackKey} = {
  contacts: 'AutoDownloadContacts',
  private: 'AutoDownloadPm',
  groups: 'AutoDownloadGroups',
  channels: 'AutoDownloadChannels'
};

export default class AppDataAndStorageTab extends SliderSuperTabEventable {
  public init() {
    this.setTitle('DataSettings');
    const [appSettings, setAppSettings] = useAppSettings();

    {
      const section = new SettingSection({name: 'AutomaticMediaDownload', caption: 'AutoDownloadAudioInfo'});

      const autoCheckboxField = new CheckboxField({
        text: 'AutoDownloadMedia',
        name: 'auto',
        checked: !appSettings.autoDownloadNew.pFlags.disabled,
        listenerSetter: this.listenerSetter
      });

      const autoRow = new Row({
        checkboxField: autoCheckboxField,
        listenerSetter: this.listenerSetter
      });

      const onChange = () => {
        toggleDisability([resetButton],
          deepEqual(appSettings.autoDownload, SETTINGS_INIT.autoDownload) &&
          deepEqual(appSettings.autoDownloadNew, SETTINGS_INIT.autoDownloadNew));
      };

      const setSubtitles = () => {
        this.setAutoDownloadSubtitle(photoRow, appSettings.autoDownload.photo /* state.settings.autoDownloadNew.photo_size_max */);
        this.setAutoDownloadSubtitle(videoRow, appSettings.autoDownload.video/* , state.settings.autoDownloadNew.video_size_max */);
        this.setAutoDownloadSubtitle(fileRow, appSettings.autoDownload.file, appSettings.autoDownloadNew.file_size_max);
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
          setAppSettings('autoDownload', copy(SETTINGS_INIT.autoDownload));
          setAppSettings('autoDownloadNew', copy(SETTINGS_INIT.autoDownloadNew));

          setSubtitles();
          autoCheckboxField.checked = !appSettings.autoDownloadNew.pFlags.disabled;
        });
      });

      let initial = true;
      const onDisabledChange = () => {
        const disabled = !autoCheckboxField.checked;

        [photoRow, videoRow, fileRow].forEach((row) => {
          row.container.classList.toggle('is-disabled', disabled);
        });

        if(initial) {
          initial = false;
        } else {
          const obj = copy(unwrap(appSettings.autoDownloadNew));
          if(disabled) obj.pFlags.disabled = true;
          else delete obj.pFlags.disabled;
          setAppSettings('autoDownloadNew', obj);
        }

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

      const storageQuotaElement = document.createElement('div');
      let controls: StorageQuotaControls;

      renderComponent({
        element: storageQuotaElement,
        Component: StorageQuota,
        middleware: this.middlewareHelper.get(),
        HotReloadGuard: SolidJSHotReloadGuardProvider,
        props: {
          controlsRef: (localControls) => {
            controls = localControls;
          }
        }
      });

      this.eventListener.addEventListener('destroy', () => {
        controls?.save();
      });

      this.scrollable.append(section.container, storageQuotaElement);
    }
  }

  private setAutoDownloadSubtitle(row: Row, settings: AutoDownloadPeerTypeSettings, sizeMax?: number) {
    let key: LangPackKey;
    const args: FormatterArguments = [];

    settings = unwrap(settings);
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
