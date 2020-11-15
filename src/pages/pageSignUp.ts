import { putPreloader } from '../components/misc';
import PopupAvatar from '../components/popupAvatar';
import appStateManager from '../lib/appManagers/appStateManager';
//import apiManager from '../lib/mtproto/apiManager';
import apiManager from '../lib/mtproto/mtprotoworker';
import { AuthState } from '../types';
import Page from './page';
import pageIm from './pageIm';

let authCode: AuthState.signUp['authCode'] = null;

let onFirstMount = () => import('../lib/appManagers/appProfileManager').then(imported => {
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

  let handleInput = function(this: typeof fieldName, e: Event) {
    let name = fieldName.value || '';
    let lastName = fieldLastName.value || '';

    let fullName = name || lastName 
      ? (name + ' ' + lastName).trim() 
      : 'Your Name';
    
    if(headerName.innerText != fullName) headerName.innerText = fullName;
    this.classList.remove('error');
  };

  let sendAvatar = () => new Promise((resolve, reject) => {
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

  const fieldName = document.getElementById('name') as HTMLInputElement;
  fieldName.addEventListener('input', handleInput);

  const fieldLastName = document.getElementById('lastName') as HTMLInputElement;
  fieldLastName.addEventListener('input', handleInput);

  const signUpButton = document.getElementById('signUp') as HTMLButtonElement;
  signUpButton.addEventListener('click', function(this: typeof signUpButton, e) {
    this.setAttribute('disabled', 'true');

    if(!fieldName.value.length) {
      fieldName.classList.add('error');
      return false;
    }

    let name = fieldName.value;
    let lastName = fieldLastName.value;

    let params = {
      'phone_number': authCode.phone_number,
      'phone_code_hash': authCode.phone_code_hash,
      'first_name': name,
      'last_name': lastName
    };

    //console.log('invoking auth.signUp with params:', params);

    this.textContent = 'PLEASE WAIT...';
    putPreloader(this);

    apiManager.invokeApi('auth.signUp', params)
    .then((response: any) => {
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
