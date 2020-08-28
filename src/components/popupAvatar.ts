import resizeableImage from "../lib/cropper";
import appDownloadManager from "../lib/appManagers/appDownloadManager";

export class PopupAvatar {
  private container = document.getElementById('popup-avatar');
  private input = this.container.querySelector('input') as HTMLInputElement;
  private cropContainer = this.container.querySelector('.crop') as HTMLDivElement;
  private closeBtn = this.container.querySelector('.popup-close') as HTMLButtonElement;
  private image = new Image();

  private canvas: HTMLCanvasElement;
  private blob: Blob;
  private cropper = {
    crop: () => {},
    removeHandlers: () => {}
  };

  private onCrop: (upload: () => Promise<any>) => void;

  constructor() {
    this.container.style.display = ''; // need for no blink
    this.cropContainer.append(this.image);

    this.input.addEventListener('change', (e: any) => {
      var file = e.target.files[0];
      if(!file) {
        return;
      }
  
      var reader = new FileReader();
      reader.onload = (e) => {
        var contents = e.target.result as string;
        
        this.image = new Image();
        this.cropContainer.append(this.image);
        this.image.src = contents;
  
        this.image.onload = () => {
          /* let {w, h} = calcImageInBox(this.image.naturalWidth, this.image.naturalHeight, 460, 554);
          cropContainer.style.width = w + 'px';
          cropContainer.style.height = h + 'px'; */
          this.container.classList.remove('hide');
          void this.container.offsetWidth; // reflow
          this.container.classList.add('active');
  
          this.cropper = resizeableImage(this.image, this.canvas);
          this.input.value = '';
        };
      };
  
      reader.readAsDataURL(file);
    }, false);

    // apply
    this.container.querySelector('.btn-crop').addEventListener('click', () => {
      this.cropper.crop();
      this.closeBtn.click();

      this.canvas.toBlob(blob => {
        this.blob = blob; // save blob to send after reg
        this.darkenCanvas();
        this.resolve();
      }, 'image/jpeg', 1);
    });

    this.closeBtn.addEventListener('click', () => {
      setTimeout(() => {
        this.cropper.removeHandlers();
        if(this.image) {
          this.image.remove();
        }

        this.container.classList.add('hide');
      }, 200);
    });
  }

  private resolve() {
    this.onCrop(() => {
      return appDownloadManager.upload(this.blob);
    });
  }

  public open(postCanvas: HTMLCanvasElement, onCrop: (upload: () => Promise<any>) => void) {
    this.canvas = postCanvas;
    this.onCrop = onCrop;

    this.input.click();
  }

  public darkenCanvas() {
    let ctx = this.canvas.getContext('2d');
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

export default new PopupAvatar();
