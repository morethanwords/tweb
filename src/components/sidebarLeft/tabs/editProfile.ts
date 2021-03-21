import appProfileManager from "../../../lib/appManagers/appProfileManager";
import appUsersManager from "../../../lib/appManagers/appUsersManager";
import InputField from "../../inputField";
import { SliderSuperTab } from "../../slider";
import { attachClickEvent } from "../../../helpers/dom";
import EditPeer from "../../editPeer";
import { UsernameInputField } from "../../usernameInputField";
import { i18n_ } from "../../../lib/langPack";

// TODO: аватарка не поменяется в этой вкладке после изменения почему-то (если поставить в другом клиенте, и потом тут проверить, для этого ещё вышел в чатлист)

export default class AppEditProfileTab extends SliderSuperTab {
  private firstNameInputField: InputField;
  private lastNameInputField: InputField;
  private bioInputField: InputField;
  private usernameInputField: InputField;
  
  private profileUrlContainer: HTMLDivElement;
  private profileUrlAnchor: HTMLAnchorElement;

  private editPeer: EditPeer;

  protected async init() {
    this.container.classList.add('edit-profile-container');
    this.setTitle('EditAccount.Title');

    const inputFields: InputField[] = [];

    {
      const inputWrapper = document.createElement('div');
      inputWrapper.classList.add('input-wrapper');
  
      this.firstNameInputField = new InputField({
        label: 'Login.Register.FirstName.Placeholder',
        name: 'first-name',
        maxLength: 70
      });
      this.lastNameInputField = new InputField({
        label: 'Login.Register.LastName.Placeholder',
        name: 'last-name',
        maxLength: 64
      });
      this.bioInputField = new InputField({
        label: 'AccountSettings.Bio',
        name: 'bio',
        maxLength: 70
      });
  
      inputWrapper.append(this.firstNameInputField.container, this.lastNameInputField.container, this.bioInputField.container);
      
      const caption = document.createElement('div');
      caption.classList.add('caption');
      i18n_({element: caption, key: 'Bio.Description'});

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
      i18n_({element: h2, key: 'EditAccount.Username'});

      const inputWrapper = document.createElement('div');
      inputWrapper.classList.add('input-wrapper');

      this.usernameInputField = new UsernameInputField({
        peerId: 0,
        label: 'EditAccount.Username',
        name: 'username',
        plainText: true,
        listenerSetter: this.listenerSetter,
        onChange: () => {
          this.editPeer.handleChange();
          this.setProfileUrl();
        },
        availableText: 'Username is available',
        takenText: 'Username is already taken',
        invalidText: 'Username is invalid'
      });

      inputWrapper.append(this.usernameInputField.container);

      const caption = document.createElement('div');
      caption.classList.add('caption');
      caption.innerHTML = `You can choose a username on Telegram. If you do, other people will be able to find you by this username and contact you without knowing your phone number.<br><br>You can use a-z, 0-9 and underscores. Minimum length is 5 characters.<br><br><div class="profile-url-container">This link opens a chat with you:
      <br><a class="profile-url" href="#" target="_blank"></a></div>`;

      this.profileUrlContainer = caption.querySelector('.profile-url-container');
      this.profileUrlAnchor = this.profileUrlContainer.lastElementChild as HTMLAnchorElement;

      inputFields.push(this.usernameInputField);
      this.scrollable.append(h2, inputWrapper, caption);
    }

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

      if(this.usernameInputField.isValid() && this.usernameInputField.input.classList.contains('valid')) {
        promises.push(appUsersManager.updateUsername(this.usernameInputField.value));
      }

      Promise.race(promises).finally(() => {
        this.editPeer.nextBtn.removeAttribute('disabled');
      });
    }, {listenerSetter: this.listenerSetter});

    const user = appUsersManager.getSelf();

    const userFull = await appProfileManager.getProfile(user.id, true);

    this.firstNameInputField.setOriginalValue(user.first_name, true);
    this.lastNameInputField.setOriginalValue(user.last_name, true);
    this.bioInputField.setOriginalValue(userFull.about, true);
    this.usernameInputField.setOriginalValue(user.username, true);

    this.setProfileUrl();
    this.editPeer.handleChange();
  }

  private setProfileUrl() {
    if(this.usernameInputField.input.classList.contains('error') || !this.usernameInputField.value.length) {
      this.profileUrlContainer.style.display = 'none';
    } else {
      this.profileUrlContainer.style.display = '';
      let url = 'https://t.me/' + this.usernameInputField.value;
      this.profileUrlAnchor.innerText = url;
      this.profileUrlAnchor.href = url;
    }
  }
}
