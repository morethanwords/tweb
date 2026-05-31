import {Component, onMount} from 'solid-js';
import {AutoDownloadPeerTypeSettings, SETTINGS_INIT} from '@config/state';
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
import {SliderSuperTabEventableConstructable} from '@components/sliderTab';
import SettingSection from '@components/settingSection';
import {useAppSettings} from '@stores/appSettings';
import {unwrap} from 'solid-js/store';
import {renderComponent} from '@helpers/solid/renderComponent';
import {StorageQuota, StorageQuotaControls} from './storageQuota';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {AppAutoDownloadFileTab, AppAutoDownloadPhotoTab, AppAutoDownloadVideoTab, type AppDataAndStorageTab} from '@components/solidJsTabs/tabs';

const AUTO_DOWNLOAD_FOR_KEYS: {[k in keyof AutoDownloadPeerTypeSettings]: LangPackKey} = {
  contacts: 'AutoDownloadContacts',
  private: 'AutoDownloadPm',
  groups: 'AutoDownloadGroups',
  channels: 'AutoDownloadChannels'
};

function setAutoDownloadSubtitle(row: Row, settings: AutoDownloadPeerTypeSettings, sizeMax?: number) {
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

const DataAndStorage: Component = () => {
  const [tab] = useSuperTab<typeof AppDataAndStorageTab>();
  const {HotReloadGuard} = useHotReloadGuard();
  const [appSettings, setAppSettings] = useAppSettings();

  onMount(() => {
    const section = new SettingSection({name: 'AutomaticMediaDownload', caption: 'AutoDownloadAudioInfo'});

    const autoCheckboxField = new CheckboxField({
      text: 'AutoDownloadMedia',
      name: 'auto',
      checked: !appSettings.autoDownloadNew.pFlags.disabled,
      listenerSetter: tab.listenerSetter
    });

    const autoRow = new Row({
      checkboxField: autoCheckboxField,
      listenerSetter: tab.listenerSetter
    });

    const onChange = () => {
      toggleDisability([resetButton],
        deepEqual(appSettings.autoDownload, SETTINGS_INIT.autoDownload) &&
        deepEqual(appSettings.autoDownloadNew, SETTINGS_INIT.autoDownloadNew));
    };

    const setSubtitles = () => {
      setAutoDownloadSubtitle(photoRow, appSettings.autoDownload.photo);
      setAutoDownloadSubtitle(videoRow, appSettings.autoDownload.video);
      setAutoDownloadSubtitle(fileRow, appSettings.autoDownload.file, appSettings.autoDownloadNew.file_size_max);
    };

    const openTab = (tabConstructor: SliderSuperTabEventableConstructable) => {
      const subTab = tab.slider.createTab(tabConstructor);
      subTab.open();

      tab.listenerSetter.add(subTab.eventListener)('destroy', () => {
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
      listenerSetter: tab.listenerSetter
    });

    const videoRow = new Row({
      titleLangKey: 'AutoDownloadVideos',
      subtitle: '',
      clickable: () => {
        openTab(AppAutoDownloadVideoTab);
      },
      listenerSetter: tab.listenerSetter
    });

    const fileRow = new Row({
      titleLangKey: 'AutoDownloadFiles',
      subtitle: '',
      clickable: () => {
        openTab(AppAutoDownloadFileTab);
      },
      listenerSetter: tab.listenerSetter
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
      middleware: tab.middlewareHelper.get(),
      HotReloadGuard,
      props: {
        controlsRef: (localControls) => {
          controls = localControls;
        }
      }
    });

    tab.eventListener.addEventListener('destroy', () => {
      controls?.save();
    });

    tab.scrollable.append(section.container, storageQuotaElement);
  });

  return null;
};

export default DataAndStorage;
