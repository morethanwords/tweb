/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { SettingSection } from "..";
import Row from "../../row";
import CheckboxField from "../../checkboxField";
import { InputNotifyPeer, Update } from "../../../layer";
import appNotificationsManager from "../../../lib/appManagers/appNotificationsManager";
import { SliderSuperTabEventable } from "../../sliderTab";
import rootScope from "../../../lib/rootScope";
import { LangPackKey } from "../../../lib/langPack";
import appStateManager from "../../../lib/appManagers/appStateManager";
import copy from "../../../helpers/object/copy";
import convertKeyToInputKey from "../../../helpers/string/convertKeyToInputKey";

type InputNotifyKey = Exclude<InputNotifyPeer['_'], 'inputNotifyPeer'>;

export default class AppNotificationsTab extends SliderSuperTabEventable {
  protected init() {
    this.header.classList.add('with-border');
    this.container.classList.add('notifications-container', 'with-border');
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
      });
      
      const previewEnabledRow = new Row({
        checkboxField: new CheckboxField({text: 'MessagePreview', checked: true}),
        subtitleLangKey: 'Loading',
      });

      section.content.append(enabledRow.container, previewEnabledRow.container);

      this.scrollable.append(section.container);

      const inputNotifyPeer = {_: options.inputKey};
      const ret = appNotificationsManager.getNotifySettings(inputNotifyPeer);
      (ret instanceof Promise ? ret : Promise.resolve(ret)).then((notifySettings) => {
        const applySettings = () => {
          const muted = appNotificationsManager.isMuted(notifySettings);
          enabledRow.checkboxField.checked = !muted;
          previewEnabledRow.checkboxField.checked = notifySettings.show_previews;
  
          return muted;
        };
        
        applySettings();

        this.eventListener.addEventListener('destroy', () => {
          const mute = !enabledRow.checkboxField.checked;
          const showPreviews = previewEnabledRow.checkboxField.checked;

          if(mute === appNotificationsManager.isMuted(notifySettings) && showPreviews === notifySettings.show_previews) {
            return;
          }

          const inputSettings: any = copy(notifySettings);
          inputSettings._ = 'inputPeerNotifySettings';
          inputSettings.mute_until = mute ? 0x7FFFFFFF : 0;
          inputSettings.show_previews = showPreviews;

          appNotificationsManager.updateNotifySettings(inputNotifyPeer, inputSettings);
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
      });
      
      const soundRow = new Row({
        checkboxField: new CheckboxField({text: 'Notifications.Sound', checked: true, stateKey: 'settings.notifications.sound'}),
        subtitleLangKey: 'Loading',
      });

      appStateManager.getState().then(state => {
        soundRow.checkboxField.checked = state.settings.notifications.sound;
      });

      section.content.append(contactsSignUpRow.container, soundRow.container);

      this.scrollable.append(section.container);

      appNotificationsManager.getContactSignUpNotification().then(enabled => {
        contactsSignUpRow.checkboxField.checked = enabled;

        this.eventListener.addEventListener('destroy', () => {
          const _enabled = contactsSignUpRow.checkboxField.checked;
          if(enabled !== _enabled) {
            appNotificationsManager.setContactSignUpNotification(!_enabled);
          }
        }, {once: true});
      });
    }
  }
}
