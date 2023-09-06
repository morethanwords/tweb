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

// TODO: аватарка не поменяется в этой вкладке после изменения почему-то (если поставить в другом клиенте, и потом тут проверить, для этого ещё вышел в чатлист)

export function purchaseUsernameCaption() {
  const p = document.createElement('div');
  const FRAGMENT_USERNAME_URL = 'https://fragment.com/username/';
  const a = setBlankToAnchor(document.createElement('a'));
  const purchaseText = i18n('Username.Purchase', [a]);
  purchaseText.classList.add('username-purchase-help');
  p.append(
    purchaseText,
    document.createElement('br'),
    document.createElement('br')
  );
  p.classList.add('hide');

  return {
    element: p,
    setUsername: (username: string) => {
      if(username) {
        a.href = FRAGMENT_USERNAME_URL + username;
      }

      p.classList.toggle('hide', !username);
    }
  };
}

export default class AppEditProfileTab extends SliderSuperTab {
  private firstNameInputField: InputField;
  private lastNameInputField: InputField;
  private bioInputField: InputField;
  private usernameInputField: UsernameInputField;

  // private profileUrlContainer: HTMLDivElement;
  // private profileUrlAnchor: HTMLAnchorElement;

  private editPeer: EditPeer;

  public static getInitArgs() {
    return {
      bioMaxLength: rootScope.managers.apiManager.getLimit('bio'),
      user: rootScope.managers.appUsersManager.getSelf(),
      userFull: rootScope.managers.appProfileManager.getProfile(rootScope.myId.toUserId())
    };
  }

  public async init(p: ReturnType<typeof AppEditProfileTab['getInitArgs']> = AppEditProfileTab.getInitArgs()) {
    this.container.classList.add('edit-profile-container');
    this.setTitle('EditAccount.Title');

    const inputFields: InputField[] = [];

    const [bioMaxLength, user, userFull] = await Promise.all([p.bioMaxLength, p.user, p.userFull]);

    {
      const section = generateSection(this.scrollable, undefined, 'Bio.Description');
      const inputWrapper = document.createElement('div');
      inputWrapper.classList.add('input-wrapper');

      this.firstNameInputField = new InputField({
        label: 'EditProfile.FirstNameLabel',
        name: 'first-name',
        maxLength: 70
      });
      this.lastNameInputField = new InputField({
        label: 'Login.Register.LastName.Placeholder',
        name: 'last-name',
        maxLength: 64
      });
      this.bioInputField = new InputField({
        label: 'EditProfile.BioLabel',
        name: 'bio',
        maxLength: bioMaxLength
      });

      inputWrapper.append(
        this.firstNameInputField.container,
        this.lastNameInputField.container,
        this.bioInputField.container
      );

      inputFields.push(
        this.firstNameInputField,
        this.lastNameInputField,
        this.bioInputField
      );

      this.editPeer = new EditPeer({
        peerId: rootScope.myId,
        inputFields,
        listenerSetter: this.listenerSetter,
        middleware: this.middlewareHelper.get()
      });

      this.content.append(this.editPeer.nextBtn);

      section.append(this.editPeer.avatarEdit.container, inputWrapper);
    }

    {
      const section = new SettingSection({
        name: 'EditAccount.Username',
        caption: true
      });

      const inputWrapper = document.createElement('div');
      inputWrapper.classList.add('input-wrapper');

      this.usernameInputField = new UsernameInputField({
        label: 'EditProfile.Username.Label',
        name: 'username',
        plainText: true,
        listenerSetter: this.listenerSetter,
        onChange: () => {
          this.editPeer.handleChange();
          // this.setProfileUrl();

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
        p,
        i18n('UsernameHelp')
        // document.createElement('br'),
        // document.createElement('br')
      );

      // const profileUrlContainer = this.profileUrlContainer = document.createElement('div');
      // profileUrlContainer.classList.add('profile-url-container');
      // const profileUrlAnchor = this.profileUrlAnchor = anchorCopy();
      // profileUrlContainer.append(i18n('UsernameHelpLink', [profileUrlAnchor]));
      // caption.append(profileUrlContainer);

      inputFields.push(this.usernameInputField);
      section.content.append(inputWrapper);
      this.scrollable.append(section.container);
    }

    {
      const section = new UsernamesSection({
        peerId: rootScope.myId,
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

      const profilePromise = this.managers.appProfileManager.updateProfile(
        this.firstNameInputField.value,
        this.lastNameInputField.value,
        this.bioInputField.value
      );
      promises.push(profilePromise.then(() => {
        this.close();
      }, (err) => {
        console.error('updateProfile error:', err);
      }));

      if(this.editPeer.uploadAvatar) {
        promises.push(this.editPeer.uploadAvatar().then((inputFile) => {
          return this.managers.appProfileManager.uploadProfilePhoto(inputFile);
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
    this.lastNameInputField.setOriginalValue(user.last_name, true);
    this.bioInputField.setOriginalValue(userFull.about, true);
    this.usernameInputField.setOriginalValue(getPeerEditableUsername(user), true);

    // this.setProfileUrl();
    this.editPeer.handleChange();
  }

  // private setProfileUrl() {
  //   if(this.usernameInputField.input.classList.contains('error') || !this.usernameInputField.value.length) {
  //     this.profileUrlContainer.style.display = 'none';
  //   } else {
  //     this.profileUrlContainer.style.display = '';
  //     this.profileUrlAnchor.replaceWith(this.profileUrlAnchor = anchorCopy({mePath: this.usernameInputField.value}));
  //   }
  // }
}
