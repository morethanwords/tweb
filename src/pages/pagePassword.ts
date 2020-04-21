import pageIm from './pageIm';
import CryptoWorker from '../lib/crypto/cryptoworker';
import { putPreloader } from '../components/misc';

import LottieLoader from '../lib/lottieLoader';
import passwordManager from '../lib/mtproto/passwordManager';
import apiManager from '../lib/mtproto/apiManager';
import Page from './page';

let onFirstMount = (): Promise<any> => {
  let needFrame = 0;
  let animation: /* AnimationItem */any = undefined;

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

    passwordManager.getState()
    .then(state => {
      console.log(state);
      passwordManager.check(state, value).then((response: any) => {
        console.log('passwordManager response:', response);
        
        switch(response._) {
          case 'auth.authorization':
            apiManager.setUserAuth({
              id: response.user.id
            });
    
            pageIm.mount();
            if(animation) animation.destroy();
            break;
          default:
            btnNext.removeAttribute('disabled');
            btnNext.innerText = response._;
            break;
        }
      }).catch(handleError);
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
    LottieLoader.loadLottie(),

    fetch('assets/img/TwoFactorSetupMonkeyClose.tgs')
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
      animation.addEventListener('enterFrame', (e: any) => {
        //console.log('enterFrame', e, needFrame);
        let currentFrame = Math.round(e.currentTime);
        
        if((e.direction == 1 && currentFrame >= needFrame) ||
          (e.direction == -1 && currentFrame <= needFrame)) {
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
