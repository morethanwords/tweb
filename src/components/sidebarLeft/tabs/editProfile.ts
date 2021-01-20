import type { InputFile } from "../../../layer";
import appProfileManager from "../../../lib/appManagers/appProfileManager";
import appUsersManager from "../../../lib/appManagers/appUsersManager";
import apiManager from "../../../lib/mtproto/mtprotoworker";
import RichTextProcessor from "../../../lib/richtextprocessor";
import rootScope from "../../../lib/rootScope";
import AvatarElement from "../../avatar";
import InputField from "../../inputField";
import Scrollable from "../../scrollable";
import SidebarSlider, { SliderSuperTab } from "../../slider";
import AvatarEdit from "../../avatarEdit";
import ButtonIcon from "../../buttonIcon";

// TODO: аватарка не поменяется в этой вкладке после изменения почему-то (если поставить в другом клиенте, и потом тут проверить, для этого ещё вышел в чатлист)

export default class AppEditProfileTab extends SliderSuperTab {
  //private scrollWrapper: HTMLElement;
  private nextBtn: HTMLButtonElement;
  
  private firstNameInputField: InputField;
  private lastNameInputField: InputField;
  private bioInputField: InputField;
  private userNameInputField: InputField;
  private firstNameInput: HTMLElement;
  private lastNameInput: HTMLElement;
  private bioInput: HTMLElement;
  private userNameInput: HTMLElement;
  
  private uploadAvatar: () => Promise<InputFile> = null;
  private avatarEdit: AvatarEdit;
  private avatarElem: AvatarElement;

  private profileUrlContainer: HTMLDivElement;
  private profileUrlAnchor: HTMLAnchorElement;

  private originalValues = {
    firstName: '',
    lastName: '',
    userName: '',
    bio: ''
  };

  constructor(slider: SidebarSlider) {
    super(slider);
  }

  protected init() {
    this.container.classList.add('edit-profile-container');
    this.title.innerText = 'Edit Profile';
    //this.scrollWrapper = this.container.querySelector('.scroll-wrapper');
    this.nextBtn = ButtonIcon('check btn-circle btn-corner');
    this.content.append(this.nextBtn);

    this.avatarElem = document.createElement('avatar-element') as AvatarElement;
    this.avatarElem.classList.add('avatar-placeholder', 'avatar-120');
    
    this.avatarEdit = new AvatarEdit((_upload) => {
      this.uploadAvatar = _upload;
      this.handleChange();
      this.avatarElem.remove();
    });

    this.scrollable.append(this.avatarEdit.container);

    {
      const inputWrapper = document.createElement('div');
      inputWrapper.classList.add('input-wrapper');
  
      this.firstNameInputField = new InputField({
        label: 'Name',
        name: 'first-name',
        maxLength: 70
      });
      this.lastNameInputField = new InputField({
        label: 'Last Name',
        name: 'last-name',
        maxLength: 64
      });
      this.bioInputField = new InputField({
        label: 'Bio (optional)',
        name: 'bio',
        maxLength: 70
      });
  
      this.firstNameInput = this.firstNameInputField.input;
      this.lastNameInput = this.lastNameInputField.input;
      this.bioInput = this.bioInputField.input;
  
      inputWrapper.append(this.firstNameInputField.container, this.lastNameInputField.container, this.bioInputField.container);
      
      const caption = document.createElement('div');
      caption.classList.add('caption');
      caption.innerHTML = 'Any details such as age, occupation or city. Example:<br>23 y.o. designer from San Francisco.';

      this.scrollable.append(inputWrapper, caption);
    }

    this.scrollable.append(document.createElement('hr'));

    {
      const h2 = document.createElement('div');
      h2.classList.add('sidebar-left-h2');
      h2.innerText = 'Username';

      const inputWrapper = document.createElement('div');
      inputWrapper.classList.add('input-wrapper');

      this.userNameInputField =  new InputField({
        label: 'Username (optional)',
        name: 'username',
        plainText: true
      });
      this.userNameInput = this.userNameInputField.input;

      inputWrapper.append(this.userNameInputField.container);

      const caption = document.createElement('div');
      caption.classList.add('caption');
      caption.innerHTML = `You can choose a username on Telegram. If you do, other people will be able to find you by this username and contact you without knowing your phone number.<br><br>You can use a-z, 0-9 and underscores. Minimum length is 5 characters.<br><br><div class="profile-url-container">This link opens a chat with you:
      <br><a class="profile-url" href="#" target="_blank"></a></div>`;

      this.profileUrlContainer = caption.querySelector('.profile-url-container');
      this.profileUrlAnchor = this.profileUrlContainer.lastElementChild as HTMLAnchorElement;

      this.scrollable.append(h2, inputWrapper, caption);
    }

    let userNameLabel = this.userNameInput.nextElementSibling as HTMLLabelElement;

    this.firstNameInput.addEventListener('input', this.handleChange);
    this.lastNameInput.addEventListener('input', this.handleChange);
    this.bioInput.addEventListener('input', this.handleChange);
    this.userNameInput.addEventListener('input', () => {
      let value = this.userNameInputField.value;

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
        if(this.userNameInputField.value != value) return;

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
        if(this.userNameInputField.value != value) return;

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
      
      promises.push(appProfileManager.updateProfile(this.firstNameInputField.value, this.lastNameInputField.value, this.bioInputField.value).then(() => {
        this.slider.selectTab(0);
      }, (err) => {
        console.error('updateProfile error:', err);
      }));

      if(this.uploadAvatar) {
        promises.push(this.uploadAvatar().then(inputFile => {
          appProfileManager.uploadProfilePhoto(inputFile);
        }));
      }

      if(this.userNameInputField.value != this.originalValues.userName && this.userNameInput.classList.contains('valid')) {
        promises.push(appProfileManager.updateUsername(this.userNameInputField.value));
      }

      Promise.race(promises).finally(() => {
        this.nextBtn.removeAttribute('disabled');
      });
    });
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

    this.firstNameInputField.value = RichTextProcessor.wrapDraftText(user.first_name);
    this.lastNameInputField.value = RichTextProcessor.wrapDraftText(user.last_name);
    this.bioInputField.value = '';
    this.userNameInputField.value = this.originalValues.userName = user.username ?? '';

    this.userNameInput.classList.remove('valid', 'error');
    this.userNameInput.nextElementSibling.innerHTML = 'Username (optional)';

    appProfileManager.getProfile(user.id, true).then(userFull => {
      if(userFull.about) {
        this.originalValues.bio = userFull.about;
        this.bioInputField.value = RichTextProcessor.wrapDraftText(userFull.about);

        this.handleChange();
      }
    });

    this.avatarElem.setAttribute('peer', '' + rootScope.myId);
    if(!this.avatarElem.parentElement) {
      this.avatarEdit.container.append(this.avatarElem);
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
      || (!this.firstNameInput.classList.contains('error') && this.firstNameInputField.value != this.originalValues.firstName) 
      || (!this.lastNameInput.classList.contains('error') && this.lastNameInputField.value != this.originalValues.lastName) 
      || (!this.bioInput.classList.contains('error') && this.bioInputField.value != this.originalValues.bio)
      || (this.userNameInputField.value != this.originalValues.userName && !this.userNameInput.classList.contains('error'));
  }

  private setProfileUrl() {
    if(this.userNameInput.classList.contains('error') || !this.userNameInputField.value.length) {
      this.profileUrlContainer.style.display = 'none';
    } else {
      this.profileUrlContainer.style.display = '';
      let url = 'https://t.me/' + this.userNameInputField.value;
      this.profileUrlAnchor.innerText = url;
      this.profileUrlAnchor.href = url;
    }
  }

  private handleChange = () => {
    this.nextBtn.classList.toggle('is-visible', this.isChanged());
  };

  onCloseAfterTimeout() {
    this.nextBtn.classList.remove('is-visible');
    this.firstNameInputField.value = this.lastNameInputField.value = this.bioInputField.value = '';
  }
}