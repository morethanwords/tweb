import {Component} from 'solid-js';
import InputField from '@components/inputField';
import EditPeer from '@components/editPeer';
import {UsernameInputField} from '@components/usernameInputField';
import {i18n} from '@lib/langPack';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import getPeerEditableUsername from '@appManagers/utils/peers/getPeerEditableUsername';
import SettingSection, {generateSection} from '@components/settingSection';
import UsernamesSection from '@components/usernamesSection';
import {purchaseUsernameCaption} from '@components/sidebarLeft/tabs/purchaseUsernameCaption';
import Button from '@components/button';
import wrapUrl from '@lib/richTextProcessor/wrapUrl';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import type {AppEditBotTab} from '@components/solidJsTabs/tabs';

const EditBot: Component = () => {
  const [tab] = useSuperTab<typeof AppEditBotTab>();
  const promiseCollector = usePromiseCollector();
  const peerId = tab.payload;

  promiseCollector.collect((async() => {
    const botId = peerId.toUserId();
    tab.container.classList.add('edit-profile-container');

    const inputFields: InputField[] = [];

    const [bioMaxLength, user, botInfo] = await Promise.all([
      tab.managers.apiManager.getLimit('bio'),
      tab.managers.appUsersManager.getUser(botId),
      tab.managers.appProfileManager.getBotInfo(botId)
    ]);

    let firstNameInputField: InputField;
    let aboutInputField: InputField;
    let usernameInputField: UsernameInputField;
    let editPeer: EditPeer;

    {
      const section = generateSection(tab.scrollable, undefined);
      const inputWrapper = document.createElement('div');
      inputWrapper.classList.add('input-wrapper');

      firstNameInputField = new InputField({
        label: 'EditProfile.FirstNameLabel',
        name: 'first-name',
        maxLength: 70
      });
      aboutInputField = new InputField({
        label: 'DescriptionPlaceholder',
        name: 'bio',
        maxLength: bioMaxLength
      });

      inputWrapper.append(firstNameInputField.container, aboutInputField.container);

      inputFields.push(firstNameInputField, aboutInputField);

      editPeer = new EditPeer({
        peerId,
        inputFields,
        listenerSetter: tab.listenerSetter,
        middleware: tab.middlewareHelper.get()
      });

      tab.content.append(editPeer.nextBtn);

      section.append(editPeer.avatarEdit.container, inputWrapper);
    }

    {
      const section = generateSection(tab.scrollable, undefined, 'EditBot.Buttons.Caption');

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

      usernameInputField = new UsernameInputField({
        label: 'Username',
        name: 'username',
        plainText: true,
        listenerSetter: tab.listenerSetter,
        onChange: () => {
          editPeer.handleChange();

          const {error} = usernameInputField;
          const isPurchase = error?.type === 'USERNAME_PURCHASE_AVAILABLE';
          setUsername(isPurchase ? usernameInputField.value : undefined);
        },
        availableText: 'EditProfile.Username.Available',
        takenText: 'EditProfile.Username.Taken',
        invalidText: 'EditProfile.Username.Invalid'
      }, tab.managers);

      inputWrapper.append(usernameInputField.container);

      const caption = section.caption;

      const {setUsername, element: p} = purchaseUsernameCaption();

      caption.append(
        i18n('EditBot.Username.Caption'),
        p
      );

      inputFields.push(usernameInputField);
      section.content.append(inputWrapper);
      tab.scrollable.append(section.container);
    }

    {
      const section = new UsernamesSection({
        peerId,
        peer: user,
        listenerSetter: tab.listenerSetter,
        usernameInputField,
        middleware: tab.middlewareHelper.get()
      });

      tab.scrollable.append(section.container);
    }

    attachClickEvent(editPeer.nextBtn, () => {
      editPeer.nextBtn.disabled = true;

      const promises: Promise<any>[] = [];

      const profilePromise = tab.managers.appProfileManager.setBotInfo(
        botId,
        firstNameInputField.value,
        aboutInputField.value
      );
      promises.push(profilePromise.then(() => {
        tab.close();
      }, (err) => {
        console.error('updateProfile error:', err);
      }));

      if(editPeer.uploadAvatar) {
        promises.push(editPeer.uploadAvatar().then((inputFile) => {
          return tab.managers.appProfileManager.uploadProfilePhoto(inputFile, botId);
        }));
      }

      if(usernameInputField.isValidToChange()) {
        promises.push(tab.managers.appUsersManager.updateUsername(usernameInputField.value));
      }

      Promise.race(promises).finally(() => {
        editPeer.nextBtn.removeAttribute('disabled');
      });
    }, {listenerSetter: tab.listenerSetter});

    firstNameInputField.setOriginalValue(user.first_name, true);
    aboutInputField.setOriginalValue(botInfo.about, true);
    usernameInputField.setOriginalValue(getPeerEditableUsername(user), true);

    editPeer.handleChange();
  })());

  return null;
};

export default EditBot;
