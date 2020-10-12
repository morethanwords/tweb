import appSidebarLeft from "..";
import { InputFile } from "../../../layer";
import appProfileManager from "../../../lib/appManagers/appProfileManager";
import appUsersManager from "../../../lib/appManagers/appUsersManager";
import apiManager from "../../../lib/mtproto/mtprotoworker";
import $rootScope from "../../../lib/rootScope";
import PopupAvatar from "../../popupAvatar";
import Scrollable from "../../scrollable";
import { SliderTab } from "../../slider";

// TODO: аватарка не поменяется в этой вкладке после изменения почему-то (если поставить в другом клиенте, и потом тут проверить, для этого ещё вышел в чатлист)

export default class AppEditProfileTab implements SliderTab {
  private container = document.querySelector('.edit-profile-container') as HTMLDivElement;
  private scrollWrapper = this.container.querySelector('.scroll-wrapper') as HTMLDivElement;
  private nextBtn = this.container.querySelector('.btn-corner') as HTMLButtonElement;
  private canvas = this.container.querySelector('.avatar-edit-canvas') as HTMLCanvasElement;
  private uploadAvatar: () => Promise<InputFile> = null;

  private firstNameInput = this.container.querySelector('.firstname') as HTMLInputElement;
  private lastNameInput = this.container.querySelector('.lastname') as HTMLInputElement;
  private bioInput = this.container.querySelector('.bio') as HTMLInputElement;
  private userNameInput = this.container.querySelector('.username') as HTMLInputElement;

  private avatarElem = document.createElement('avatar-element');

  private profileUrlContainer = this.container.querySelector('.profile-url-container') as HTMLDivElement;
  private profileUrlAnchor = this.profileUrlContainer.lastElementChild as HTMLAnchorElement;

  private originalValues = {
    firstName: '',
    lastName: '',
    userName: '',
    bio: ''
  };

  constructor() {
    this.container.querySelector('.avatar-edit').addEventListener('click', () => {
      new PopupAvatar().open(this.canvas, (_upload) => {
        this.uploadAvatar = _upload;
        this.handleChange();
        this.avatarElem.remove();
      });
    });

    this.avatarElem.classList.add('avatar-placeholder');

    let userNameLabel = this.userNameInput.nextElementSibling as HTMLLabelElement;

    this.firstNameInput.addEventListener('input', () => this.handleChange());
    this.lastNameInput.addEventListener('input', () => this.handleChange());
    this.bioInput.addEventListener('input', () => this.handleChange());
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
      

      promises.push(appProfileManager.updateProfile(this.firstNameInput.value, this.lastNameInput.value, this.bioInput.value).then(() => {
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

      Promise.race(promises).then(() => {
        this.nextBtn.disabled = false;
      }, () => {
        this.nextBtn.disabled = false;
      });
    });

    let scrollable = new Scrollable(this.scrollWrapper as HTMLElement);
  }

  public fillElements() {
    let user = appUsersManager.getSelf();
    this.firstNameInput.value = this.originalValues.firstName = user.first_name ?? '';
    this.lastNameInput.value = this.originalValues.lastName = user.last_name ?? '';
    this.userNameInput.value = this.originalValues.userName = user.username ?? '';

    this.userNameInput.classList.remove('valid', 'error');
    this.userNameInput.nextElementSibling.innerHTML = 'Username (optional)';

    appProfileManager.getProfile(user.id).then(userFull => {
      if(userFull.rAbout) {
        this.bioInput.value = this.originalValues.bio = userFull.rAbout;
      }
    });

    this.avatarElem.setAttribute('peer', '' + $rootScope.myID);
    if(!this.avatarElem.parentElement) {
      this.canvas.parentElement.append(this.avatarElem);
    }

    this.uploadAvatar = null;

    this.setProfileUrl();
  }

  public isUsernameValid(username: string) {
    return ((username.length >= 5 && username.length <= 32) || !username.length) && /^[a-zA-Z0-9_]*$/.test(username);
  }

  private isChanged() {
    return !!this.uploadAvatar 
      || this.firstNameInput.value != this.originalValues.firstName 
      || this.lastNameInput.value != this.originalValues.lastName 
      || (this.userNameInput.value != this.originalValues.userName && !this.userNameInput.classList.contains('error')) 
      || this.bioInput.value != this.originalValues.bio;
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

  private handleChange() {
    if(this.isChanged()) {
      this.nextBtn.classList.add('is-visible');
    } else {
      this.nextBtn.classList.remove('is-visible');
    }
  }

  onCloseAfterTimeout() {
    this.nextBtn.classList.remove('is-visible');
  }
}