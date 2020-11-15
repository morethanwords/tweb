import appSidebarLeft from "..";
import { getRichValue } from "../../../helpers/dom";
import { InputFile } from "../../../layer";
import appProfileManager from "../../../lib/appManagers/appProfileManager";
import appUsersManager from "../../../lib/appManagers/appUsersManager";
import apiManager from "../../../lib/mtproto/mtprotoworker";
import RichTextProcessor from "../../../lib/richtextprocessor";
import rootScope from "../../../lib/rootScope";
import AvatarElement from "../../avatar";
import InputField from "../../inputField";
import PopupAvatar from "../../popupAvatar";
import Scrollable from "../../scrollable";
import { SliderTab } from "../../slider";

// TODO: аватарка не поменяется в этой вкладке после изменения почему-то (если поставить в другом клиенте, и потом тут проверить, для этого ещё вышел в чатлист)

export default class AppEditProfileTab implements SliderTab {
  private container: HTMLElement;
  private scrollWrapper: HTMLElement;
  private nextBtn: HTMLButtonElement;
  private canvas: HTMLCanvasElement;
  private uploadAvatar: () => Promise<InputFile> = null;

  private firstNameInput: HTMLInputElement;
  private lastNameInput: HTMLInputElement;
  private bioInput: HTMLInputElement;
  private userNameInput: HTMLInputElement;

  private avatarElem: AvatarElement;

  private profileUrlContainer: HTMLDivElement;
  private profileUrlAnchor: HTMLAnchorElement;

  private originalValues = {
    firstName: '',
    lastName: '',
    userName: '',
    bio: ''
  };

  public init() {
    this.container = document.querySelector('.edit-profile-container');
    this.scrollWrapper = this.container.querySelector('.scroll-wrapper');
    this.nextBtn = this.container.querySelector('.btn-corner');
    this.canvas = this.container.querySelector('.avatar-edit-canvas');

    this.avatarElem = document.createElement('avatar-element') as AvatarElement;
    this.avatarElem.classList.add('avatar-placeholder');

    this.profileUrlContainer = this.container.querySelector('.profile-url-container');
    this.profileUrlAnchor = this.profileUrlContainer.lastElementChild as HTMLAnchorElement;

    const avatarEdit = this.container.querySelector('.avatar-edit');
    avatarEdit.addEventListener('click', () => {
      new PopupAvatar().open(this.canvas, (_upload) => {
        this.uploadAvatar = _upload;
        this.handleChange();
        this.avatarElem.remove();
      });
    });

    {
      const inputWrapper = document.createElement('div');
      inputWrapper.classList.add('input-wrapper');
  
      const firstNameInputField = InputField({
        label: 'Name',
        name: 'first-name',
        maxLength: 70
      });
      const lastNameInputField = InputField({
        label: 'Last Name',
        name: 'last-name',
        maxLength: 64
      });
      const bioInputField = InputField({
        label: 'Bio (optional)',
        name: 'bio',
        maxLength: 70
      });
  
      this.firstNameInput = firstNameInputField.input;
      this.lastNameInput = lastNameInputField.input;
      this.bioInput = bioInputField.input;
  
      inputWrapper.append(firstNameInputField.container, lastNameInputField.container, bioInputField.container);
      avatarEdit.parentElement.insertBefore(inputWrapper, avatarEdit.nextElementSibling);
    }

    {
      const inputWrapper = document.createElement('div');
      inputWrapper.classList.add('input-wrapper');

      const userNameInputField = InputField({
        label: 'Username (optional)',
        name: 'username',
        plainText: true
      });
      this.userNameInput = userNameInputField.input;

      inputWrapper.append(userNameInputField.container);
      
      const caption = this.profileUrlContainer.parentElement;
      caption.parentElement.insertBefore(inputWrapper, caption);
    }

    let userNameLabel = this.userNameInput.nextElementSibling as HTMLLabelElement;

    this.firstNameInput.addEventListener('input', this.handleChange);
    this.lastNameInput.addEventListener('input', this.handleChange);
    this.bioInput.addEventListener('input', this.handleChange);
    this.userNameInput.addEventListener('input', () => {
      let value = this.userNameInput.value;

      //console.log('userNameInput:', value);
      if(value == this.originalValues.userName || !value.length) {
        this.userNameInput.classList.remove('valid', 'error');
        userNameLabel.innerText = 'Username (optional)';
        this.setProfileUrl();
        this.handleChange();
        return;
      } else if(!this.isUsernameValid(value)) { // does not check the last underscore
        this.userNameInput.classList.add('error');
        this.userNameInput.classList.remove('valid');
        userNameLabel.innerText = 'Username is invalid';
      } else {
        this.userNameInput.classList.remove('valid', 'error');
      }

      if(this.userNameInput.classList.contains('error')) {
        this.setProfileUrl();
        this.handleChange();
        return;
      }

      apiManager.invokeApi('account.checkUsername', {
        username: value
      }).then(available => {
        if(this.userNameInput.value != value) return;

        if(available) {
          this.userNameInput.classList.add('valid');
          this.userNameInput.classList.remove('error');
          userNameLabel.innerText = 'Username is available';
        } else {
          this.userNameInput.classList.add('error');
          this.userNameInput.classList.remove('valid');
          userNameLabel.innerText = 'Username is already taken';
        }
      }, (err) => {
        if(this.userNameInput.value != value) return;

        switch(err.type) {
          case 'USERNAME_INVALID': {
            this.userNameInput.classList.add('error');
            this.userNameInput.classList.remove('valid');
            userNameLabel.innerText = 'Username is invalid';
            break;
          }
        }
      }).then(() => {
        this.handleChange();
        this.setProfileUrl();
      });
    });

    this.nextBtn.addEventListener('click', () => {
      this.nextBtn.disabled = true;

      let promises: Promise<any>[] = [];
      
      promises.push(appProfileManager.updateProfile(getRichValue(this.firstNameInput), getRichValue(this.lastNameInput), getRichValue(this.bioInput)).then(() => {
        appSidebarLeft.selectTab(0);
      }, (err) => {
        console.error('updateProfile error:', err);
      }));

      if(this.uploadAvatar) {
        promises.push(this.uploadAvatar().then(inputFile => {
          appProfileManager.uploadProfilePhoto(inputFile);
        }));
      }

      if(this.userNameInput.value != this.originalValues.userName && this.userNameInput.classList.contains('valid')) {
        promises.push(appProfileManager.updateUsername(this.userNameInput.value));
      }

      Promise.race(promises).finally(() => {
        this.nextBtn.removeAttribute('disabled');
      });
    });

    let scrollable = new Scrollable(this.scrollWrapper as HTMLElement);
  }

  public fillElements() {
    if(this.init) {
      this.init();
      this.init = null;
    }

    const user = appUsersManager.getSelf();

    Object.assign(this.originalValues, {
      firstName: user.first_name,
      lastName: user.last_name,
      userName: user.username,
      bio: ''
    });

    this.firstNameInput.innerHTML = user.rFirstName;
    this.lastNameInput.innerHTML = RichTextProcessor.wrapRichText(user.last_name, {noLinks: true, noLinebreaks: true});
    this.bioInput.innerHTML = '';
    this.userNameInput.value = this.originalValues.userName = user.username ?? '';

    this.userNameInput.classList.remove('valid', 'error');
    this.userNameInput.nextElementSibling.innerHTML = 'Username (optional)';

    appProfileManager.getProfile(user.id, true).then(userFull => {
      if(userFull.about) {
        this.originalValues.bio = userFull.about;
        this.bioInput.innerHTML = userFull.rAbout;

        this.handleChange();
      }
    });

    this.avatarElem.setAttribute('peer', '' + rootScope.myID);
    if(!this.avatarElem.parentElement) {
      this.canvas.parentElement.append(this.avatarElem);
    }

    this.uploadAvatar = null;

    this.setProfileUrl();
    this.handleChange();
  }

  public isUsernameValid(username: string) {
    return ((username.length >= 5 && username.length <= 32) || !username.length) && /^[a-zA-Z0-9_]*$/.test(username);
  }

  private isChanged() {
    return !!this.uploadAvatar 
      || (!this.firstNameInput.classList.contains('error') && getRichValue(this.firstNameInput) != this.originalValues.firstName) 
      || (!this.lastNameInput.classList.contains('error') && getRichValue(this.lastNameInput) != this.originalValues.lastName) 
      || (!this.bioInput.classList.contains('error') && getRichValue(this.bioInput) != this.originalValues.bio)
      || (this.userNameInput.value != this.originalValues.userName && !this.userNameInput.classList.contains('error'));
  }

  private setProfileUrl() {
    if(this.userNameInput.classList.contains('error') || !this.userNameInput.value.length) {
      this.profileUrlContainer.style.display = 'none';
    } else {
      this.profileUrlContainer.style.display = '';
      let url = 'https://t.me/' + this.userNameInput.value;
      this.profileUrlAnchor.innerText = url;
      this.profileUrlAnchor.href = url;
    }
  }

  private handleChange = () => {
    if(this.isChanged()) {
      this.nextBtn.classList.add('is-visible');
    } else {
      this.nextBtn.classList.remove('is-visible');
    }
  };

  onCloseAfterTimeout() {
    this.nextBtn.classList.remove('is-visible');
    this.firstNameInput.innerHTML = this.lastNameInput.innerHTML = this.bioInput.innerHTML = '';
  }
}