import pageSignIn from './pageSignIn';
import pageSignUp from './pageSignUp';
import pageIm from './pageIm';
import pagePassword from './pagePassword';
import CryptoWorker from '../lib/crypto/cryptoworker';
import LottieLoader from '../lib/lottieLoader';
import apiManager from '../lib/mtproto/apiManager';
import Page from './page';

let authCode: {
  _: string, // 'auth.sentCode'
  pFlags: any, // {}
  flags: number,
  type: {
    _: string, // 'auth.sentCodeTypeSms',
    length: number
  },
  phone_code_hash: string,
  phone_number: string
} = null;

const EDITONSAMEPAGE = false;

let headerElement: HTMLHeadElement = null;
let sentTypeElement: HTMLParagraphElement = null;

let onFirstMount = (): Promise<any> => {
  let needFrame = 0, lastLength = 0;
  let animation: /* AnimationItem */any = undefined;

  const CODELENGTH = authCode.type.length;

  const codeInput = page.pageEl.querySelector('#code') as HTMLInputElement;
  const codeInputLabel = codeInput.nextElementSibling as HTMLLabelElement;
  const editButton = page.pageEl.querySelector('.phone-edit') as HTMLElement;

  if(EDITONSAMEPAGE) {
    let editable = false;
    let changePhonePromise: Promise<unknown>;

    let changePhone = () => {
      if(changePhonePromise) return;

      let phone_number = '+' + headerElement.innerText.replace(/\D/g, '');
      if(authCode.phone_number == phone_number) return;

      codeInput.setAttribute('disabled', 'true');

      changePhonePromise = apiManager.invokeApi('auth.sendCode', {
        /* flags: 0, */
        phone_number: phone_number,
        api_id: Config.App.id,
        api_hash: Config.App.hash,
        settings: {
          _: 'codeSettings', // that's how we sending Type
          flags: 0
        }
        /* lang_code: navigator.language || 'en' */
      }).then((code: any) => {
        console.log('got code 2', code);

        authCode = Object.assign(code, {phone_number});
        
        changePhonePromise = undefined;
        codeInput.removeAttribute('disabled');
        codeInput.focus();
      }).catch(err => {
        switch(err.type) {
          case 'PHONE_NUMBER_INVALID':
            headerElement.classList.add('error');
            editable = true;
            headerElement.setAttribute('contenteditable', '' + editable);
            headerElement.focus();
            break;
          default:
              codeInputLabel.innerText = err.type;
            break;
        }

        changePhonePromise = undefined;
        codeInput.removeAttribute('disabled');
      });
    };

    headerElement.addEventListener('keypress', function(this, e) {
      if(e.key == 'Enter') {
        editable = false;
        headerElement.setAttribute('contenteditable', '' + editable);
        changePhone();
      }
  
      if(/\D/.test(e.key)) {
        e.preventDefault();
        return false;
      }
  
      this.classList.remove('error');
    });
  
    editButton.addEventListener('click', function() {
      if(changePhonePromise) return;
  
      editable = !editable;
      headerElement.setAttribute('contenteditable', '' + editable);
  
      if(!editable) changePhone();
    });
  } else {
    editButton.addEventListener('click', function() {
      return pageSignIn.mount();
    });
  }

  let submitCode = (code: string) => {
    codeInput.setAttribute('disabled', 'true');

    let params = {
      phone_number: authCode.phone_number,
      phone_code_hash: authCode.phone_code_hash,
      phone_code: code
    };

    console.log('invoking auth.signIn with params:', params);

    apiManager.invokeApi('auth.signIn', params)
    .then((response: any) => {
      console.log('auth.signIn response:', response);
      
      switch(response._) {
        case 'auth.authorization':
          apiManager.setUserAuth({
            id: response.user.id
          });

          pageIm.mount();
          if(animation) animation.destroy();
          break;
        case 'auth.authorizationSignUpRequired':
          console.log('Registration needed!');

          pageSignUp.mount({
            'phone_number': authCode.phone_number,
            'phone_code_hash': authCode.phone_code_hash
          });

          if(animation) animation.destroy();
          break;
        default:
          codeInput.innerText = response._;
          break;
      }
    }).catch(err => {
      codeInput.removeAttribute('disabled');

      switch(err.type) {
        case 'SESSION_PASSWORD_NEEDED':
          console.warn('pageAuthCode: SESSION_PASSWORD_NEEDED');
          err.handled = true;
          if(animation) animation.destroy();
          pagePassword.mount();
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
    });
  };

  const max = 45;
  // 1st symbol = frame 15
  // end symbol = frame 165
  codeInput.addEventListener('input', function(this: typeof codeInput, e) {
    this.classList.remove('error');

    this.value = this.value.replace(/\D/g, '');
    if(this.value.length > CODELENGTH) {
      this.value = this.value.slice(0, CODELENGTH);
    }

    let length = this.value.length;
    if(length == CODELENGTH) { // submit code
      submitCode(this.value);
    } else if(length == lastLength) {
      return;
    }

    lastLength = length;

    if(!animation) return;
    
    let frame: number;
    if(length) frame = Math.round((length > max ? max : length) * (165 / max) + 11.33);
    else frame = 0;
    //animation.playSegments([1, 2]);

    let direction = needFrame > frame ? -1 : 1;
    //console.log('keydown', length, frame, direction);

    animation.setDirection(direction);
    if(needFrame != 0 && frame == 0) {
      animation.setSpeed(7);
    }
    /* let diff = Math.abs(needFrame - frame * direction);
    if((diff / 20) > 1) animation.setSpeed(diff / 20 | 0); */
    needFrame = frame;
    
    animation.play();

    /* animation.goToAndStop(15, true); */
    //animation.goToAndStop(length / max * );
  });

  return Promise.all([
    LottieLoader.loadLottie(),

    fetch('assets/img/TwoFactorSetupMonkeyTracking.tgs')
    .then(res => res.arrayBuffer())
    .then(data => CryptoWorker.gzipUncompress<string>(data, true))
    .then(str => LottieLoader.loadAnimation({
      container: page.pageEl.querySelector('.auth-image'),
      renderer: 'svg',
      loop: false,
      autoplay: false,
      animationData: JSON.parse(str)
    }))
    .then(_animation => {
      animation = _animation;
      animation.setSpeed(1);
      //console.log(animation.getDuration(), animation.getDuration(true));

      animation.addEventListener('enterFrame', (e: any) => {
        //console.log('enterFrame', e, needFrame);
        let currentFrame = Math.round(e.currentTime);
        
        if((e.direction == 1 && currentFrame >= needFrame) ||
          (e.direction == -1 && currentFrame <= needFrame)) {
            animation.setSpeed(1);
            animation.pause();
          } 
      });
    })
  ]);
};

const page = new Page('page-authCode', true, onFirstMount, (_authCode: typeof authCode) => {
  authCode = _authCode;

  if(!headerElement) {
    headerElement = page.pageEl.getElementsByClassName('phone')[0] as HTMLHeadElement;
    sentTypeElement = page.pageEl.getElementsByClassName('sent-type')[0] as HTMLParagraphElement;
  }

  //let LottieLoader = (await import('../lib/lottieLoader')).default;

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
});

export default page;
