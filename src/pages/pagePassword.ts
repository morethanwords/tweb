import pageIm from './pageIm';
//import CryptoWorker from '../lib/crypto/cryptoworker';
//import apiManager from '../lib/mtproto/apiManager';
import { putPreloader } from '../components/misc';

import LottieLoader, { RLottiePlayer } from '../lib/lottieLoader';
//import passwordManager from '../lib/mtproto/passwordManager';
import apiManager from '../lib/mtproto/mtprotoworker';
import Page from './page';

let onFirstMount = (): Promise<any> => {
  let needFrame = 0;
  let animation: RLottiePlayer;

  let passwordVisible = false;

  const btnNext = page.pageEl.querySelector('button') as HTMLButtonElement;
  const passwordInput = document.getElementById('password') as HTMLInputElement;
  //const passwordInputLabel = passwordInput.nextElementSibling as HTMLLabelElement;
  const toggleVisible = page.pageEl.querySelector('.toggle-visible') as HTMLSpanElement;

  let handleError = (err: any) => {
    btnNext.removeAttribute('disabled');
    
    switch(err.type) {
      default:
        btnNext.innerText = err.type;
        break;
    }
  };

  toggleVisible.addEventListener('click', function(this, e) {
    if(!passwordVisible) {
      this.classList.add('tgico-eye2');
      passwordInput.setAttribute('type', 'text');
      animation.setDirection(-1);
      needFrame = 0;
      animation.play();
    } else {
      this.classList.remove('tgico-eye2');
      passwordInput.setAttribute('type', 'password');
      animation.setDirection(1);
      needFrame = 49;
      animation.play();
    }

    passwordVisible = !passwordVisible;
  });

  btnNext.addEventListener('click', function(this, e) {
    if(!passwordInput.value.length) {
      passwordInput.classList.add('error');
      return;
    }

    this.setAttribute('disabled', 'true');
    let value = passwordInput.value;

    this.textContent = 'PLEASE WAIT...';
    putPreloader(this);

    apiManager.checkPassword(value).then((response: any) => {
      console.log('passwordManager response:', response);
        
      switch(response._) {
        case 'auth.authorization':
          apiManager.setUserAuth({
            id: response.user.id
          });
  
          pageIm.mount();
          if(animation) animation.remove();
          break;
        default:
          btnNext.removeAttribute('disabled');
          btnNext.innerText = response._;
          break;
      }
    }).catch(handleError);
  });

  passwordInput.addEventListener('keypress', function(this, e) {
    this.classList.remove('error');

    if(e.key == 'Enter') {
      return btnNext.click();
    }
  });

  /* passwordInput.addEventListener('input', function(this, e) {
    
  }); */
  return Promise.all([
    LottieLoader.loadLottieWorkers(),

    fetch('assets/img/TwoFactorSetupMonkeyClose.tgs')
    .then(res => res.arrayBuffer())
    .then(data => apiManager.gzipUncompress<string>(data, true))
    .then(str => LottieLoader.loadAnimationWorker({
      container: page.pageEl.querySelector('.auth-image'),
      loop: false,
      autoplay: false,
      animationData: JSON.parse(str),
      width: 166,
      height: 166
    }))
    .then(_animation => {
      animation = _animation;
      animation.addListener('enterFrame', currentFrame => {
        //console.log('enterFrame', e, needFrame);

        if((animation.direction == 1 && currentFrame >= needFrame) ||
          (animation.direction == -1 && currentFrame <= needFrame)) {
            animation.setSpeed(1);
            animation.pause();
        } 
      });
  
      needFrame = 49;
      animation.play();
    })
  ]);
};

const page = new Page('page-password', true, onFirstMount);

export default page;
