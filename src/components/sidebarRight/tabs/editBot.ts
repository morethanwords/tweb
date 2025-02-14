/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import InputField from '../../inputField';
import {SliderSuperTab} from '../../slider';
import EditPeer from '../../editPeer';
import {UsernameInputField} from '../../usernameInputField';
import {i18n, i18n_, LangPackKey} from '../../../lib/langPack';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import rootScope from '../../../lib/rootScope';
import setBlankToAnchor from '../../../lib/richTextProcessor/setBlankToAnchor';
import getPeerEditableUsername from '../../../lib/appManagers/utils/peers/getPeerEditableUsername';
import SettingSection, {generateSection} from '../../settingSection';
import UsernamesSection from '../../usernamesSection';
import {purchaseUsernameCaption} from '../../sidebarLeft/tabs/editProfile';
import Button from '../../button';
import wrapUrl from '../../../lib/richTextProcessor/wrapUrl';

export default class AppEditBotTab extends SliderSuperTab {
  private firstNameInputField: InputField;
  private aboutInputField: InputField;
  private usernameInputField: UsernameInputField;

  private editPeer: EditPeer;

  public async init(peerId: PeerId) {
    const botId = peerId.toUserId();
    this.container.classList.add('edit-profile-container');
    this.setTitle('EditBot.Title');

    const inputFields: InputField[] = [];

    const [bioMaxLength, user, botInfo] = await Promise.all([
      this.managers.apiManager.getLimit('bio'),
      this.managers.appUsersManager.getUser(botId),
      this.managers.appProfileManager.getBotInfo(botId)
    ]);

    {
      const section = generateSection(this.scrollable, undefined);
      const inputWrapper = document.createElement('div');
      inputWrapper.classList.add('input-wrapper');

      this.firstNameInputField = new InputField({
        label: 'EditProfile.FirstNameLabel',
        name: 'first-name',
        maxLength: 70
      });
      this.aboutInputField = new InputField({
        label: 'DescriptionPlaceholder',
        name: 'bio',
        maxLength: bioMaxLength
      });

      inputWrapper.append(this.firstNameInputField.container, this.aboutInputField.container);

      inputFields.push(this.firstNameInputField, this.aboutInputField);

      this.editPeer = new EditPeer({
        peerId,
        inputFields,
        listenerSetter: this.listenerSetter,
        middleware: this.middlewareHelper.get()
      });

      this.content.append(this.editPeer.nextBtn);

      section.append(this.editPeer.avatarEdit.container, inputWrapper);
    }

    {
      const section = generateSection(this.scrollable, undefined, 'EditBot.Buttons.Caption');

      const btnIntro = Button('btn-primary btn-transparent', {icon: 'info', text: 'EditBot.Buttons.Intro', asLink: true});
      const btnCommands = Button('btn-primary btn-transparent', {icon: 'botcom', text: 'EditBot.Buttons.Commands', asLink: true});
      const btnSettings = Button('btn-primary btn-transparent', {icon: 'bots', text: 'EditBot.Buttons.Settings', asLink: true});

      const url = 't.me/botfather?start=' + getPeerEditableUsername(user);
      const arr: [HTMLAnchorElement, string][] = [
        [btnIntro, 'intro'],
        [btnCommands, 'commands'],
        [btnSettings, '']
      ];

      arr.forEach(([anchor, suffix]) => {
        const wrapped = wrapUrl(url + (suffix ? '-' + suffix : ''));
        anchor.href = wrapped.url;
        anchor.setAttribute('onclick', wrapped.onclick + '(this)');
      });

      section.append(btnIntro, btnCommands, btnSettings);
    }

    {
      const section = new SettingSection({
        name: 'EditAccount.Username',
        caption: true
      });

      const inputWrapper = document.createElement('div');
      inputWrapper.classList.add('input-wrapper');

      this.usernameInputField = new UsernameInputField({
        label: 'Username',
        name: 'username',
        plainText: true,
        listenerSetter: this.listenerSetter,
        onChange: () => {
          this.editPeer.handleChange();

          const {error} = this.usernameInputField;
          const isPurchase = error?.type === 'USERNAME_PURCHASE_AVAILABLE';
          setUsername(isPurchase ? this.usernameInputField.value : undefined);
        },
        availableText: 'EditProfile.Username.Available',
        takenText: 'EditProfile.Username.Taken',
        invalidText: 'EditProfile.Username.Invalid'
      }, this.managers);

      inputWrapper.append(this.usernameInputField.container);

      const caption = section.caption;

      const {setUsername, element: p} = purchaseUsernameCaption();

      caption.append(
        i18n('EditBot.Username.Caption'),
        p
      );

      inputFields.push(this.usernameInputField);
      section.content.append(inputWrapper);
      this.scrollable.append(section.container);
    }

    {
      const section = new UsernamesSection({
        peerId,
        peer: user,
        listenerSetter: this.listenerSetter,
        usernameInputField: this.usernameInputField,
        middleware: this.middlewareHelper.get()
      });

      this.scrollable.append(section.container);
    }

    attachClickEvent(this.editPeer.nextBtn, () => {
      this.editPeer.nextBtn.disabled = true;

      const promises: Promise<any>[] = [];

      const profilePromise = this.managers.appProfileManager.setBotInfo(
        botId,
        this.firstNameInputField.value,
        this.aboutInputField.value
      );
      promises.push(profilePromise.then(() => {
        this.close();
      }, (err) => {
        console.error('updateProfile error:', err);
      }));

      if(this.editPeer.uploadAvatar) {
        promises.push(this.editPeer.uploadAvatar().then((inputFile) => {
          return this.managers.appProfileManager.uploadProfilePhoto(inputFile, botId);
        }));
      }

      if(this.usernameInputField.isValidToChange()) {
        promises.push(this.managers.appUsersManager.updateUsername(this.usernameInputField.value));
      }

      Promise.race(promises).finally(() => {
        this.editPeer.nextBtn.removeAttribute('disabled');
      });
    }, {listenerSetter: this.listenerSetter});

    this.firstNameInputField.setOriginalValue(user.first_name, true);
    this.aboutInputField.setOriginalValue(botInfo.about, true);
    this.usernameInputField.setOriginalValue(getPeerEditableUsername(user), true);

    this.editPeer.handleChange();
  }
}
