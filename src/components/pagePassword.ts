import {MTProto} from '../lib/mtproto/mtproto';

import pageIm from './pageIm';
import CryptoWorker from '../lib/crypto/cryptoworker';
import { putPreloader } from './misc';

import LottieLoader from '../lib/lottieLoader';

let installed = false;

export default async() => {
  //let LottieLoader = (await import('../lib/lottieLoader')).default;

  if(installed) return;
  installed = true;

  let needFrame = 0;
  let animation: /* AnimationItem */any = undefined;

  let passwordVisible = false;
  let pageElement = document.body.getElementsByClassName('page-password')[0] as HTMLDivElement;
  pageElement.style.display = '';

  fetch('assets/img/TwoFactorSetupMonkeyClose.tgs')
  .then(res => res.arrayBuffer())
  .then(async(data) => {
    let str = await CryptoWorker.gzipUncompress<string>(data, true);

    animation = await LottieLoader.loadAnimation({
      container: pageElement.querySelector('.auth-image'),
      renderer: 'svg',
      loop: false,
      autoplay: false,
      animationData: JSON.parse(str)
    });

    console.log(animation.getDuration(true));
    //animation.goToAndStop(822);

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
  });

  const btnNext = pageElement.querySelector('button') as HTMLButtonElement;
  const passwordInput = document.getElementById('password') as HTMLInputElement;
  //const passwordInputLabel = passwordInput.nextElementSibling as HTMLLabelElement;
  const toggleVisible = pageElement.querySelector('.toggle-visible') as HTMLSpanElement;

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

    MTProto.passwordManager.getState()
    .then(state => {
      console.log(state);
      MTProto.passwordManager.check(state, value).then((response: any) => {
        console.log('passwordManager response:', response);
        
        switch(response._) {
          case 'auth.authorization':
            MTProto.apiManager.setUserAuth({
              id: response.user.id
            });
    
            pageElement.style.display = 'none';
            pageIm();
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
};
