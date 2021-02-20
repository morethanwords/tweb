import mediaSizes from '../helpers/mediaSizes';
import { AuthSentCode, AuthSentCodeType } from '../layer';
import appStateManager from '../lib/appManagers/appStateManager';
import apiManager from '../lib/mtproto/mtprotoworker';
import Page from './page';
import pageIm from './pageIm';
import pagePassword from './pagePassword';
import pageSignIn from './pageSignIn';
import pageSignUp from './pageSignUp';
import InputField from '../components/inputField';
import TrackingMonkey from '../components/monkeys/tracking';

let authCode: AuthSentCode.authSentCode = null;

let headerElement: HTMLHeadElement = null;
let sentTypeElement: HTMLParagraphElement = null;
let codeInput: HTMLInputElement;

let onFirstMount = (): Promise<any> => {
  let lastLength = 0;

  const CODELENGTH = (authCode.type as AuthSentCodeType.authSentCodeTypeApp).length;

  const codeInputField = new InputField({
    label: 'Code',
    name: 'code',
    plainText: true
  });

  codeInput = codeInputField.input as HTMLInputElement;
  codeInput.type = 'tel';
  codeInput.setAttribute('required', '');
  codeInput.autocomplete = 'off';

  page.pageEl.querySelector('.input-wrapper').append(codeInputField.container);

  const codeInputLabel = codeInput.nextElementSibling as HTMLLabelElement;
  const editButton = page.pageEl.querySelector('.phone-edit') as HTMLElement;

  editButton.addEventListener('click', function() {
    return pageSignIn.mount();
  });

  const cleanup = () => {
    setTimeout(() => {
      monkey.remove();
    }, 300);
  };

  const submitCode = (code: string) => {
    codeInput.setAttribute('disabled', 'true');

    const params = {
      phone_number: authCode.phone_number,
      phone_code_hash: authCode.phone_code_hash,
      phone_code: code
    };

    //console.log('invoking auth.signIn with params:', params);

    apiManager.invokeApi('auth.signIn', params, {ignoreErrors: true})
    .then((response) => {
      //console.log('auth.signIn response:', response);
      
      switch(response._) {
        case 'auth.authorization':
          apiManager.setUserAuth(response.user.id);

          pageIm.mount();
          cleanup();
          break;
        case 'auth.authorizationSignUpRequired':
          //console.log('Registration needed!');

          pageSignUp.mount({
            'phone_number': authCode.phone_number,
            'phone_code_hash': authCode.phone_code_hash
          });

          cleanup();
          break;
        /* default:
          codeInput.innerText = response._;
          break; */
      }
    }).catch(async(err) => {
      switch(err.type) {
        case 'SESSION_PASSWORD_NEEDED':
          //console.warn('pageAuthCode: SESSION_PASSWORD_NEEDED');
          err.handled = true;
          await pagePassword.mount();
          break;
        case 'PHONE_CODE_EXPIRED':
          codeInput.classList.add('error');
          codeInputLabel.innerText = 'Code expired';
          break;
        case 'PHONE_CODE_EMPTY':
        case 'PHONE_CODE_INVALID':
          codeInput.classList.add('error');
          codeInputLabel.innerText = 'Invalid Code';
          break;
        default:
          codeInputLabel.innerText = err.type;
          break;
      }

      codeInput.removeAttribute('disabled');
    });
  };

  codeInput.addEventListener('input', function(this: typeof codeInput, e) {
    this.classList.remove('error');
    codeInputLabel.innerText = 'Code';

    this.value = this.value.replace(/\D/g, '');
    if(this.value.length > CODELENGTH) {
      this.value = this.value.slice(0, CODELENGTH);
    }

    const length = this.value.length;
    if(length === CODELENGTH) { // submit code
      submitCode(this.value);
    } else if(length === lastLength) {
      return;
    }

    lastLength = length;
  });

  const imageDiv = page.pageEl.querySelector('.auth-image') as HTMLDivElement;
  const size = mediaSizes.isMobile ? 100 : 166;
  const monkey = new TrackingMonkey(codeInputField, size);
  imageDiv.append(monkey.container);
  return monkey.load();
};

const page = new Page('page-authCode', true, onFirstMount, (_authCode: typeof authCode) => {
  authCode = _authCode;

  if(!headerElement) {
    headerElement = page.pageEl.getElementsByClassName('phone')[0] as HTMLHeadElement;
    sentTypeElement = page.pageEl.getElementsByClassName('sent-type')[0] as HTMLParagraphElement;
  } else {
    codeInput.value = '';

    const evt = document.createEvent('HTMLEvents');
    evt.initEvent('input', false, true);
    codeInput.dispatchEvent(evt);
  }

  headerElement.innerText = authCode.phone_number;
  switch(authCode.type._) {
    case 'auth.sentCodeTypeSms':
      sentTypeElement.innerHTML = 'We have sent you an SMS<br>with the code.';
      break;
    case 'auth.sentCodeTypeApp': 
      sentTypeElement.innerHTML = 'We have sent you a message in Telegram<br>with the code.';
      break;
    case 'auth.sentCodeTypeCall': 
      sentTypeElement.innerHTML = 'We will call you and voice<br>the code.';
      break;
    default:
      sentTypeElement.innerHTML = `Please check everything<br>for a code (type: ${authCode.type._})`;
      break;
  }

  appStateManager.pushToState('authState', {_: 'authStateAuthCode', sentCode: _authCode});
  appStateManager.saveState();
}, () => {
  codeInput.focus();
});

export default page;
