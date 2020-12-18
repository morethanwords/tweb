import Button from '../components/button';
import InputField from '../components/inputField';
import { putPreloader } from '../components/misc';
import PopupAvatar from '../components/popups/avatar';
import appStateManager from '../lib/appManagers/appStateManager';
//import apiManager from '../lib/mtproto/apiManager';
import apiManager from '../lib/mtproto/mtprotoworker';
import RichTextProcessor from '../lib/richtextprocessor';
import { AuthState } from '../types';
import Page from './page';
import pageIm from './pageIm';

let authCode: AuthState.signUp['authCode'] = null;

const onFirstMount = () => import('../lib/appManagers/appProfileManager').then(imported => {
  const pageElement = page.pageEl;
  const avatarPreview = pageElement.querySelector('#canvas-avatar') as HTMLCanvasElement;
  const appProfileManager = imported.default;

  let uploadAvatar: () => Promise<any>;
  pageElement.querySelector('.auth-image').addEventListener('click', () => {
    new PopupAvatar().open(avatarPreview, (_uploadAvatar) => {
      uploadAvatar = _uploadAvatar;
    });
  });

  const headerName = pageElement.getElementsByClassName('fullName')[0] as HTMLHeadingElement;

  const handleInput = (e: Event) => {
    const name = nameInputField.value || '';
    const lastName = lastNameInputField.value || '';

    const fullName = name || lastName 
      ? (name + ' ' + lastName).trim() 
      : 'Your Name';
    
    if(headerName.innerHTML != fullName) headerName.innerHTML = RichTextProcessor.wrapEmojiText(fullName);
  };

  let sendAvatar = () => new Promise<void>((resolve, reject) => {
    if(!uploadAvatar) {
      //console.log('User has not selected avatar');
      return resolve();
    }

    //console.log('invoking uploadFile...');
    uploadAvatar().then((inputFile: any) => {
      //console.log('uploaded smthn', inputFile);
  
      appProfileManager.uploadProfilePhoto(inputFile).then(resolve, reject);
    }, reject);
  });

  const inputWrapper = document.createElement('div');
  inputWrapper.classList.add('input-wrapper');

  const nameInputField = new InputField({
    label: 'Name',
    maxLength: 70
  });

  const lastNameInputField = new InputField({
    label: 'Last Name (optional)',
    maxLength: 64
  });

  const btnSignUp = Button('btn-primary');
  btnSignUp.append('START MESSAGING');

  inputWrapper.append(nameInputField.container, lastNameInputField.container, btnSignUp);

  headerName.parentElement.append(inputWrapper);

  nameInputField.input.addEventListener('input', handleInput);
  lastNameInputField.input.addEventListener('input', handleInput);

  btnSignUp.addEventListener('click', function(this: typeof btnSignUp, e) {
    if(nameInputField.input.classList.contains('error') || lastNameInputField.input.classList.contains('error')) {
      return false;
    }

    if(!nameInputField.value.length) {
      nameInputField.input.classList.add('error');
      return false;
    }

    this.setAttribute('disabled', 'true');

    const name = nameInputField.value.trim();
    const lastName = lastNameInputField.value.trim();

    const params = {
      phone_number: authCode.phone_number,
      phone_code_hash: authCode.phone_code_hash,
      first_name: name,
      last_name: lastName
    };

    //console.log('invoking auth.signUp with params:', params);

    this.textContent = 'PLEASE WAIT...';
    putPreloader(this);

    apiManager.invokeApi('auth.signUp', params)
    .then((response) => {
      //console.log('auth.signUp response:', response);
      
      switch(response._) {
        case 'auth.authorization': // success
          apiManager.setUserAuth(response.user.id);

          sendAvatar().finally(() => {
            pageIm.mount();
          });
          
          break;
        default:
          this.innerText = response._;
          break;
      }

      /* (document.body.getElementsByClassName('page-sign')[0] as HTMLDivElement).style.display = 'none';
      pageAuthCode(Object.assign(code, {phoneNumber})); */
    }).catch(err => {
      this.removeAttribute('disabled');

      switch(err.type) {
        default:
          this.innerText = err.type;
          break;
      }
    });
  });
});

const page = new Page('page-signUp', true, onFirstMount, (_authCode: typeof authCode) => {
  authCode = _authCode;

  appStateManager.pushToState('authState', {_: 'authStateSignUp', authCode: _authCode});
  appStateManager.saveState();
});

export default page;
