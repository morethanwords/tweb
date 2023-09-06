/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type ListenerSetter from '../../../../helpers/listenerSetter';
import {LangPackKey} from '../../../../lib/langPack';
import CheckboxField from '../../../checkboxField';
import {SliderSuperTabEventable} from '../../../sliderTab';
import Row, {CreateRowFromCheckboxField} from '../../../row';
import SettingSection from '../../../settingSection';
import {joinDeepPath} from '../../../../helpers/object/setDeepProperty';

export function autoDownloadPeerTypeSection(type: 'photo' | 'video' | 'file', title: LangPackKey, listenerSetter: ListenerSetter) {
  const section = new SettingSection({name: title});

  const key = joinDeepPath('settings', 'autoDownload', type);
  const contactsCheckboxField = new CheckboxField({
    text: 'AutodownloadContacts',
    name: 'contacts',
    stateKey: joinDeepPath(key, 'contacts'),
    listenerSetter
  });
  const privateCheckboxField = new CheckboxField({
    text: 'AutodownloadPrivateChats',
    name: 'private',
    stateKey: joinDeepPath(key, 'private'),
    listenerSetter
  });
  const groupsCheckboxField = new CheckboxField({
    text: 'AutodownloadGroupChats',
    name: 'groups',
    stateKey: joinDeepPath(key, 'groups'),
    listenerSetter
  });
  const channelsCheckboxField = new CheckboxField({
    text: 'AutodownloadChannels',
    name: 'channels',
    stateKey: joinDeepPath(key, 'channels'),
    listenerSetter
  });

  section.content.append(
    CreateRowFromCheckboxField(contactsCheckboxField).container,
    CreateRowFromCheckboxField(privateCheckboxField).container,
    CreateRowFromCheckboxField(groupsCheckboxField).container,
    CreateRowFromCheckboxField(channelsCheckboxField).container
  );

  return section;
}

export default class AppAutoDownloadPhotoTab extends SliderSuperTabEventable {
  public init() {
    this.setTitle('AutoDownloadPhotos');

    const section = autoDownloadPeerTypeSection('photo', 'AutoDownloadPhotosTitle', this.listenerSetter);
    this.scrollable.append(section.container);
  }
}
