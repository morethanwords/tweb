import {Component, JSX, onMount} from 'solid-js';
import {AutoDownloadPeerTypeSettings, SETTINGS_INIT} from '@config/state';
import formatBytes from '@helpers/formatBytes';
import copy from '@helpers/object/copy';
import deepEqual from '@helpers/object/deepEqual';
import {FormatterArguments, i18n, join, LangPackKey} from '@lib/langPack';
import Button from '@components/buttonTsx';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import confirmationPopup from '@components/confirmationPopup';
import Row from '@components/rowTsx';
import Section from '@components/section';
import {SliderSuperTabEventableConstructable} from '@components/sliderTab';
import {useAppSettings} from '@stores/appSettings';
import {StorageQuota, StorageQuotaControls} from './storageQuota';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {AppAutoDownloadFileTab, AppAutoDownloadPhotoTab, AppAutoDownloadVideoTab, type AppDataAndStorageTab} from '@components/solidJsTabs/tabs';

const AUTO_DOWNLOAD_FOR_KEYS: {[k in keyof AutoDownloadPeerTypeSettings]: LangPackKey} = {
  contacts: 'AutoDownloadContacts',
  private: 'AutoDownloadPm',
  groups: 'AutoDownloadGroups',
  channels: 'AutoDownloadChannels'
};

function getAutoDownloadSubtitle(settings: AutoDownloadPeerTypeSettings, sizeMax?: number): JSX.Element {
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

  return i18n(key, args);
}

const DataAndStorage: Component = () => {
  const [tab] = useSuperTab<typeof AppDataAndStorageTab>();
  const [appSettings, setAppSettings] = useAppSettings();
  let controls: StorageQuotaControls;

  const autoEnabled = () => !appSettings.autoDownloadNew.pFlags.disabled;

  const resetDisabled = () => (
    deepEqual(appSettings.autoDownload, SETTINGS_INIT.autoDownload) &&
    deepEqual(appSettings.autoDownloadNew, SETTINGS_INIT.autoDownloadNew)
  );

  const openTab = (tabConstructor: SliderSuperTabEventableConstructable) => {
    tab.slider.createTab(tabConstructor).open();
  };

  const onAutoEnabledChange = (enabled: boolean) => {
    setAppSettings('autoDownloadNew', 'pFlags', 'disabled', enabled ? undefined : true);
  };

  const onReset = () => confirmationPopup({
    titleLangKey: 'ResetAutomaticMediaDownloadAlertTitle',
    descriptionLangKey: 'ResetAutomaticMediaDownloadAlert',
    button: {
      langKey: 'Reset'
    }
  }).then(() => {
    setAppSettings('autoDownload', copy(SETTINGS_INIT.autoDownload));
    setAppSettings('autoDownloadNew', copy(SETTINGS_INIT.autoDownloadNew));
  });

  onMount(() => {
    tab.eventListener.addEventListener('destroy', () => {
      controls?.save();
    });
  });

  return (
    <>
      <Section name="AutomaticMediaDownload" caption="AutoDownloadAudioInfo">
        <Row>
          <Row.CheckboxFieldToggle>
            <CheckboxFieldTsx
              checked={autoEnabled()}
              toggle
              onChange={onAutoEnabledChange}
            />
          </Row.CheckboxFieldToggle>
          <Row.Title>{i18n('AutoDownloadMedia')}</Row.Title>
        </Row>
        <Row disabled={!autoEnabled()} clickable={() => openTab(AppAutoDownloadPhotoTab)}>
          <Row.Title>{i18n('AutoDownloadPhotos')}</Row.Title>
          <Row.Subtitle>{getAutoDownloadSubtitle(appSettings.autoDownload.photo)}</Row.Subtitle>
        </Row>
        <Row disabled={!autoEnabled()} clickable={() => openTab(AppAutoDownloadVideoTab)}>
          <Row.Title>{i18n('AutoDownloadVideos')}</Row.Title>
          <Row.Subtitle>{getAutoDownloadSubtitle(appSettings.autoDownload.video)}</Row.Subtitle>
        </Row>
        <Row disabled={!autoEnabled()} clickable={() => openTab(AppAutoDownloadFileTab)}>
          <Row.Title>{i18n('AutoDownloadFiles')}</Row.Title>
          <Row.Subtitle>{getAutoDownloadSubtitle(
            appSettings.autoDownload.file,
            appSettings.autoDownloadNew.file_size_max
          )}</Row.Subtitle>
        </Row>
        <Button
          disabled={resetDisabled()}
          icon="delete"
          primaryTransparent
          text="ResetAutomaticMediaDownload"
          onClick={onReset}
        />
      </Section>
      <StorageQuota controlsRef={(localControls) => controls = localControls} />
    </>
  );
};

export default DataAndStorage;
