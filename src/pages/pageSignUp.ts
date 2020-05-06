import {putPreloader} from '../components/misc';
import resizeableImage from '../lib/cropper';
import pageIm from './pageIm';
//import apiManager from '../lib/mtproto/apiManager';
import apiManager from '../lib/mtproto/mtprotoworker';
import apiFileManager from '../lib/mtproto/apiFileManager';
import Page from './page';

let authCode: {
  'phone_number': string,
  'phone_code_hash': string
} = null;

let onFirstMount = () => {
  const pageElement = page.pageEl;
  const avatarInput = document.getElementById('avatar-input') as HTMLInputElement;
  const avatarPopup = document.getElementsByClassName('popup-avatar')[0];
  const avatarPreview = pageElement.querySelector('#canvas-avatar') as HTMLCanvasElement;
  const cropContainer = avatarPopup.getElementsByClassName('crop')[0] as HTMLDivElement;
  let avatarImage = new Image();
  cropContainer.append(avatarImage);

  let avatarBlob: Blob;

  (avatarPopup.getElementsByClassName('popup-close')[0] as HTMLButtonElement)
  .addEventListener('click', function(this, e) {
    /* let popup = findUpClassName(this, 'popup');
    popup.classList.remove('active'); */

    setTimeout(() => {
      cropper.removeHandlers();
      if(avatarImage) {
        avatarImage.remove();
      }
    }, 200);

    /* e.cancelBubble = true;
    return false; */
  });

  let cropper = {
    crop: () => {},
    removeHandlers: () => {}
  };

  // apply
  avatarPopup.getElementsByClassName('btn-crop')[0].addEventListener('click', () => {
    cropper.crop();
    avatarPopup.classList.remove('active');
    cropper.removeHandlers();

    avatarPreview.toBlob(blob => {
      avatarBlob = blob; // save blob to send after reg

      // darken
      let ctx = avatarPreview.getContext('2d');
      ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
      ctx.fillRect(0, 0, avatarPreview.width, avatarPreview.height);
    }, 'image/jpeg', 1);

    avatarImage.remove();
  });

  avatarInput.addEventListener('change', (e: any) => {
    var file = e.target.files[0];
    if(!file) {
      return;
    }

    var reader = new FileReader();
    reader.onload = (e) => {
      var contents = e.target.result as string;
      
      avatarImage = new Image();
      cropContainer.append(avatarImage);
      avatarImage.src = contents;

      avatarImage.onload = () => {
        /* let {w, h} = calcImageInBox(avatarImage.naturalWidth, avatarImage.naturalHeight, 460, 554);
        cropContainer.style.width = w + 'px';
        cropContainer.style.height = h + 'px'; */
        avatarPopup.classList.add('active');

        cropper = resizeableImage(avatarImage, avatarPreview);
        avatarInput.value = '';
      };
    };

    reader.readAsDataURL(file);
  }, false);

  pageElement.querySelector('.auth-image').addEventListener('click', () => {
    avatarInput.click();
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
    if(!avatarBlob) {
      console.log('User has not selected avatar');
      return resolve();
    }

    console.log('invoking uploadFile...');
    apiFileManager.uploadFile(avatarBlob).then((inputFile: any) => {
      console.log('uploaded smthn', inputFile);
  
      apiManager.invokeApi('photos.uploadProfilePhoto', {
        file: inputFile
      }).then((updateResult) => {
        console.log('updated photo!');
        resolve();
      }, reject);
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

    console.log('invoking auth.signUp with params:', params);

    this.textContent = 'PLEASE WAIT...';
    putPreloader(this);

    apiManager.invokeApi('auth.signUp', params)
    .then((response: any) => {
      console.log('auth.signUp response:', response);
      
      switch(response._) {
        case 'auth.authorization': // success
          apiManager.setUserAuth({ // warning
            id: response.user.id
          });

          sendAvatar().then(() => {
            pageIm.mount();
          }, () => {
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
};

const page = new Page('page-signUp', true, onFirstMount, (_authCode: typeof authCode) => {
  authCode = _authCode;
});

export default page;
