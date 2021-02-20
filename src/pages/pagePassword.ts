import { putPreloader } from '../components/misc';
import mediaSizes from '../helpers/mediaSizes';
import { AccountPassword } from '../layer';
import appStateManager from '../lib/appManagers/appStateManager';
import passwordManager from '../lib/mtproto/passwordManager';
import Page from './page';
import pageIm from './pageIm';
import Button from '../components/button';
import PasswordInputField from '../components/passwordInputField';
import PasswordMonkey from '../components/monkeys/password';
import { ripple } from '../components/ripple';
import RichTextProcessor from '../lib/richtextprocessor';

const TEST = false;
let passwordInput: HTMLInputElement;

let onFirstMount = (): Promise<any> => {
  const btnNext = Button('btn-primary btn-color-primary', {text: 'NEXT'});

  const passwordInputField = new PasswordInputField({
    label: 'Password',
    name: 'password'
  });

  passwordInput = passwordInputField.input as HTMLInputElement;

  page.pageEl.querySelector('.input-wrapper').append(passwordInputField.container, btnNext);

  let getStateInterval: number;

  let getState = () => {
    // * just to check session relevance
    if(!getStateInterval) {
      getStateInterval = window.setInterval(getState, 10e3);
    }

    return !TEST && passwordManager.getState().then(_state => {
      state = _state;

      passwordInputField.label.innerHTML = state.hint ? RichTextProcessor.wrapEmojiText(state.hint) : 'Password';
    });
  };

  let handleError = (err: any) => {
    btnNext.removeAttribute('disabled');
    passwordInputField.input.classList.add('error');
    
    switch(err.type) {
      default:
        //btnNext.innerText = err.type;
        btnNext.innerText = 'INVALID PASSWORD';
        break;
    }

    getState();
  };

  let state: AccountPassword;
  
  btnNext.addEventListener('click', function(this, e) {
    if(!passwordInput.value.length) {
      passwordInput.classList.add('error');
      return;
    }

    this.setAttribute('disabled', 'true');
    let value = passwordInput.value;

    this.textContent = 'PLEASE WAIT...';
    putPreloader(this);

    passwordManager.check(value, state).then((response) => {
      //console.log('passwordManager response:', response);
        
      switch(response._) {
        case 'auth.authorization':
          clearInterval(getStateInterval);
          pageIm.mount();
          if(monkey) monkey.remove();
          break;
        default:
          btnNext.removeAttribute('disabled');
          btnNext.innerText = response._;
          ripple(btnNext);
          break;
      }
    }).catch(handleError);
  });

  passwordInput.addEventListener('keypress', function(this, e) {
    this.classList.remove('error');
    btnNext.innerText = 'NEXT';
    ripple(btnNext);

    if(e.key === 'Enter') {
      return btnNext.click();
    }
  });

  const size = mediaSizes.isMobile ? 100 : 166;
  const monkey = new PasswordMonkey(passwordInputField, size);
  page.pageEl.querySelector('.auth-image').append(monkey.container);
  return Promise.all([
    monkey.load(),
    getState()
  ]);
};

const page = new Page('page-password', true, onFirstMount, null, () => {
  //if(!isAppleMobile) {
    passwordInput.focus();
  //}

  appStateManager.pushToState('authState', {_: 'authStatePassword'});
  appStateManager.saveState();
});

export default page;
