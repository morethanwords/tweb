/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import Row from '../../row';
import CheckboxField from '../../checkboxField';
import {InputNotifyPeer, InputPeerNotifySettings, Update} from '../../../layer';
import {SliderSuperTabEventable} from '../../sliderTab';
import rootScope from '../../../lib/rootScope';
import {LangPackKey} from '../../../lib/langPack';
import copy from '../../../helpers/object/copy';
import convertKeyToInputKey from '../../../helpers/string/convertKeyToInputKey';
import {MUTE_UNTIL} from '../../../lib/mtproto/mtproto_config';
import apiManagerProxy from '../../../lib/mtproto/mtprotoworker';
import SettingSection from '../../settingSection';

type InputNotifyKey = Exclude<InputNotifyPeer['_'], 'inputNotifyPeer' | 'inputNotifyForumTopic'>;

export default class AppNotificationsTab extends SliderSuperTabEventable {
  public init() {
    this.container.classList.add('notifications-container');
    this.setTitle('Telegram.NotificationSettingsViewController');

    const NotifySection = (options: {
      name: LangPackKey,
      typeText: LangPackKey,
      inputKey: InputNotifyKey,
    }) => {
      const section = new SettingSection({
        name: options.name
      });

      const enabledRow = new Row({
        checkboxField: new CheckboxField({text: options.typeText, checked: true}),
        subtitleLangKey: 'Loading',
        listenerSetter: this.listenerSetter,
        withCheckboxSubtitle: true
      });

      const previewEnabledRow = new Row({
        checkboxField: new CheckboxField({text: 'MessagePreview', checked: true}),
        subtitleLangKey: 'Loading',
        listenerSetter: this.listenerSetter,
        withCheckboxSubtitle: true
      });

      section.content.append(enabledRow.container, previewEnabledRow.container);

      this.scrollable.append(section.container);

      const inputNotifyPeer = {_: options.inputKey};
      const ret = this.managers.appNotificationsManager.getNotifySettings(inputNotifyPeer);
      (ret instanceof Promise ? ret : Promise.resolve(ret)).then((notifySettings) => {
        const applySettings = async() => {
          const muted = await this.managers.appNotificationsManager.isMuted(notifySettings);
          enabledRow.checkboxField.checked = !muted;
          previewEnabledRow.checkboxField.checked = notifySettings.show_previews;

          return muted;
        };

        applySettings();

        this.eventListener.addEventListener('destroy', async() => {
          const mute = !enabledRow.checkboxField.checked;
          const showPreviews = previewEnabledRow.checkboxField.checked;

          if(mute === (await this.managers.appNotificationsManager.isMuted(notifySettings)) && showPreviews === notifySettings.show_previews) {
            return;
          }

          const inputSettings: InputPeerNotifySettings = copy(notifySettings) as any;
          inputSettings._ = 'inputPeerNotifySettings';
          inputSettings.mute_until = mute ? MUTE_UNTIL : 0;
          inputSettings.show_previews = showPreviews;

          this.managers.appNotificationsManager.updateNotifySettings(inputNotifyPeer, inputSettings);
        }, {once: true});

        this.listenerSetter.add(rootScope)('notify_settings', (update: Update.updateNotifySettings) => {
          const inputKey = convertKeyToInputKey(update.peer._) as any;
          if(options.inputKey === inputKey) {
            notifySettings = update.notify_settings;
            applySettings();
          }
        });
      });
    };

    NotifySection({
      name: 'NotificationsPrivateChats',
      typeText: 'NotificationsForPrivateChats',
      inputKey: 'inputNotifyUsers'
    });

    NotifySection({
      name: 'NotificationsGroups',
      typeText: 'NotificationsForGroups',
      inputKey: 'inputNotifyChats'
    });

    NotifySection({
      name: 'NotificationsChannels',
      typeText: 'NotificationsForChannels',
      inputKey: 'inputNotifyBroadcasts'
    });

    {
      const section = new SettingSection({
        name: 'NotificationsOther'
      });

      const contactsSignUpRow = new Row({
        checkboxField: new CheckboxField({text: 'ContactJoined', checked: true}),
        subtitleLangKey: 'Loading',
        listenerSetter: this.listenerSetter,
        withCheckboxSubtitle: true
      });

      const soundRow = new Row({
        checkboxField: new CheckboxField({text: 'Notifications.Sound', checked: true, stateKey: 'settings.notifications.sound', listenerSetter: this.listenerSetter}),
        subtitleLangKey: 'Loading',
        listenerSetter: this.listenerSetter,
        withCheckboxSubtitle: true
      });

      apiManagerProxy.getState().then((state) => {
        soundRow.checkboxField.checked = state.settings.notifications.sound;
      });

      section.content.append(contactsSignUpRow.container, soundRow.container);

      this.scrollable.append(section.container);

      this.managers.appNotificationsManager.getContactSignUpNotification().then((enabled) => {
        contactsSignUpRow.checkboxField.checked = enabled;

        this.eventListener.addEventListener('destroy', () => {
          const _enabled = contactsSignUpRow.checkboxField.checked;
          if(enabled !== _enabled) {
            this.managers.appNotificationsManager.setContactSignUpNotification(!_enabled);
          }
        }, {once: true});
      });
    }
  }
}
