import {MTProto} from '../lib/mtproto/mtproto';
import {putPreloader} from './misc';

let installed = false;
let authCode: {
  'phone_number': string,
  'phone_code_hash': string
} = null;

import resizeableImage from '../lib/cropper';
import pageIm from './pageIm';

export default (_authCode: typeof authCode) => {
  authCode = _authCode;
  if(installed) return;
  installed = true;

  let pageElement = document.body.getElementsByClassName('page-signUp')[0] as HTMLDivElement;
  pageElement.style.display = '';

  const avatarInput = document.getElementById('avatar-input') as HTMLInputElement;
  const avatarPopup = pageElement.getElementsByClassName('popup-avatar')[0];
  const avatarPreview = pageElement.querySelector('#canvas-avatar') as HTMLCanvasElement;
  const cropContainer = avatarPopup.getElementsByClassName('crop')[0];
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
    
    /* console.log(file, typeof(file)); */

    // @ts-ignore
    /* MTProto.apiFileManager.uploadFile(file).then(function(inputFile) {
      console.log('uploaded smthn', inputFile);

      MTProto.apiManager.invokeApi('photos.uploadProfilePhoto', {
        file: inputFile
      }).then(function (updateResult) {
        console.log('updated photo!');
      });
    }); */

    var reader = new FileReader();
    reader.onload = (e) => {
      var contents = e.target.result as string;
      
      avatarImage = new Image();
      cropContainer.append(avatarImage);
      avatarImage.src = contents;

      avatarImage.onload = () => {
        /* avatarPreviewCtx.drawImage(avatarImage,
          70, 20,   // Start at 70/20 pixels from the left and the top of the image (crop),
          50, 50,   // "Get" a `50 * 50` (w * h) area from the source image (crop),
          0, 0,     // Place the result at 0, 0 in the canvas,
          100, 100); // With as width / height: 100 * 100 (scale) */

        cropper = resizeableImage(avatarImage, avatarPreview);
        avatarInput.value = '';
      };

      avatarPopup.classList.add('active');
      //console.log(contents);
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
    // @ts-ignore
    MTProto.apiFileManager.uploadFile(avatarBlob).then((inputFile: any) => {
      console.log('uploaded smthn', inputFile);
  
      MTProto.apiManager.invokeApi('photos.uploadProfilePhoto', {
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

    MTProto.apiManager.invokeApi('auth.signUp', params)
    .then((response: any) => {
      console.log('auth.signUp response:', response);
      
      switch(response._) {
        case 'auth.authorization': // success
          MTProto.apiManager.setUserAuth({ // warning
            id: response.user.id
          });

          sendAvatar().then(() => {
            pageElement.style.display = 'none';
            pageIm();
          }, () => {
            pageElement.style.display = 'none';
            pageIm();
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
