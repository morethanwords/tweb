import appProfileManager from "../../../lib/appManagers/appProfileManager";
import appUsersManager from "../../../lib/appManagers/appUsersManager";
import apiManager from "../../../lib/mtproto/mtprotoworker";
import InputField from "../../inputField";
import { SliderSuperTab } from "../../slider";
import { attachClickEvent } from "../../../helpers/dom";
import EditPeer from "../../editPeer";

// TODO: аватарка не поменяется в этой вкладке после изменения почему-то (если поставить в другом клиенте, и потом тут проверить, для этого ещё вышел в чатлист)

export default class AppEditProfileTab extends SliderSuperTab {
  private firstNameInputField: InputField;
  private lastNameInputField: InputField;
  private bioInputField: InputField;
  private userNameInputField: InputField;
  private userNameInput: HTMLElement;
  
  private profileUrlContainer: HTMLDivElement;
  private profileUrlAnchor: HTMLAnchorElement;

  private editPeer: EditPeer;

  protected init() {
    this.container.classList.add('edit-profile-container');
    this.title.innerText = 'Edit Profile';

    const inputFields: InputField[] = [];

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
  
      inputWrapper.append(this.firstNameInputField.container, this.lastNameInputField.container, this.bioInputField.container);
      
      const caption = document.createElement('div');
      caption.classList.add('caption');
      caption.innerHTML = 'Any details such as age, occupation or city. Example:<br>23 y.o. designer from San Francisco.';

      inputFields.push(this.firstNameInputField, this.lastNameInputField, this.bioInputField);
      this.scrollable.append(inputWrapper, caption);
    }

    this.scrollable.append(document.createElement('hr'));

    this.editPeer = new EditPeer({
      peerId: appUsersManager.getSelf().id,
      inputFields,
      listenerSetter: this.listenerSetter
    });
    this.content.append(this.editPeer.nextBtn);
    this.scrollable.prepend(this.editPeer.avatarEdit.container);

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

      inputFields.push(this.userNameInputField);
      this.scrollable.append(h2, inputWrapper, caption);
    }

    let userNameLabel = this.userNameInput.nextElementSibling as HTMLLabelElement;

    this.listenerSetter.add(this.userNameInput, 'input', () => {
      let value = this.userNameInputField.value;

      //console.log('userNameInput:', value);
      if(value === this.userNameInputField.originalValue || !value.length) {
        this.userNameInput.classList.remove('valid', 'error');
        userNameLabel.innerText = 'Username (optional)';
        this.setProfileUrl();
        this.editPeer.handleChange();
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
        this.editPeer.handleChange();
        return;
      }

      apiManager.invokeApi('account.checkUsername', {
        username: value
      }).then(available => {
        if(this.userNameInputField.value !== value) return;

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
        if(this.userNameInputField.value !== value) return;

        switch(err.type) {
          case 'USERNAME_INVALID': {
            this.userNameInput.classList.add('error');
            this.userNameInput.classList.remove('valid');
            userNameLabel.innerText = 'Username is invalid';
            break;
          }
        }
      }).then(() => {
        this.editPeer.handleChange();
        this.setProfileUrl();
      });
    });

    attachClickEvent(this.editPeer.nextBtn, () => {
      this.editPeer.nextBtn.disabled = true;

      let promises: Promise<any>[] = [];
      
      promises.push(appProfileManager.updateProfile(this.firstNameInputField.value, this.lastNameInputField.value, this.bioInputField.value).then(() => {
        this.close();
      }, (err) => {
        console.error('updateProfile error:', err);
      }));

      if(this.editPeer.uploadAvatar) {
        promises.push(this.editPeer.uploadAvatar().then(inputFile => {
          return appProfileManager.uploadProfilePhoto(inputFile);
        }));
      }

      if(this.userNameInputField.isValid() && this.userNameInput.classList.contains('valid')) {
        promises.push(appProfileManager.updateUsername(this.userNameInputField.value));
      }

      Promise.race(promises).finally(() => {
        this.editPeer.nextBtn.removeAttribute('disabled');
      });
    }, {listenerSetter: this.listenerSetter});
  }

  public fillElements() {
    if(this.init) {
      this.init();
      this.init = null;
    }

    const user = appUsersManager.getSelf();

    this.firstNameInputField.setOriginalValue(user.first_name);
    this.lastNameInputField.setOriginalValue(user.last_name);
    this.bioInputField.setOriginalValue('');
    this.userNameInputField.setOriginalValue(user.username ?? '');

    this.userNameInput.classList.remove('valid', 'error');
    this.userNameInput.nextElementSibling.innerHTML = 'Username (optional)';

    appProfileManager.getProfile(user.id, true).then(userFull => {
      if(userFull.about) {
        this.bioInputField.setOriginalValue(userFull.about);
      }
    });

    this.setProfileUrl();
    this.editPeer.handleChange();
  }

  public isUsernameValid(username: string) {
    return ((username.length >= 5 && username.length <= 32) || !username.length) && /^[a-zA-Z0-9_]*$/.test(username);
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
}
