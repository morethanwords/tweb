
function resizeableImage(image_target: HTMLImageElement, resize_canvas?: HTMLCanvasElement) {
  var cropComponent: HTMLDivElement
  , container: HTMLDivElement
  , crop_img: HTMLImageElement
  , event_state: {
    mouse_x?: number, 
    mouse_y?: number, 
    container_width?: number,
    container_height?: number,
    container_left?: number,
    container_top?: number
  } = {}
  , ratio = 1.0
  , keyZoomValue = 4.0
  , MINWIDTH = 50
  //, MINHEIGHT = 50
  , CROPWIDTH = 200
  , CROPHEIGHT = 200
  , cropLeft = 0
  , cropTop = 0
  , cropWidth = 0
  , cropHeight = 0;
  
  if(image_target.complete) {
    init();
  } else {
    image_target.onload = init;
  }
  
  function removeHandlers() {
    container.removeEventListener('mousedown', startMoving);
    container.removeEventListener('touchstart', startMoving);
    container.removeEventListener('wheel', resizing);
    
    document.removeEventListener('mouseup', endMoving);
    document.removeEventListener('touchend', endMoving);
    document.removeEventListener('mousemove', moving);
    document.removeEventListener('touchmove', moving);
    document.removeEventListener('keypress', keyHandler);

    cropComponent.remove();
    container.remove();
    crop_img.remove();
  }
  
  function addHandlers() {
    container.addEventListener('mousedown', startMoving, false);
    container.addEventListener('touchstart', startMoving, false);
    container.addEventListener('wheel', resizing, false);
    
    document.addEventListener('keypress', keyHandler, false);
    //document.querySelector('.btn-crop').addEventListener('click', openCropCanvasImg);
  }
  
  function init() {
    var wraper, left, top;
    
    if (image_target.dataset.isCrop) {
      throw 'image is already crop'
    }
    
    image_target.dataset.isCrop = 'true';
    image_target.classList.add('crop-blur');
    image_target.draggable = false;
    
    crop_img = new Image();
    crop_img.crossOrigin = image_target.crossOrigin;  
    crop_img.src = image_target.src;
    crop_img.draggable = false;
    
    if(!resize_canvas) {
      resize_canvas = document.createElement('canvas');
    }
    
    cropComponent = document.createElement('div');
    cropComponent.classList.add('crop-component');
    
    container = document.createElement('div');
    container.classList.add('overlay');
    
    let overlayColor = document.createElement('div');
    overlayColor.classList.add('crop-overlay-color');
    
    cropComponent.appendChild(container);
    wraper = image_target.parentNode;
    wraper.appendChild(cropComponent);
    cropComponent.appendChild(crop_img);
    cropComponent.appendChild(image_target);
    cropComponent.appendChild(overlayColor);
    container.appendChild(crop_img);

    crop_img.style.maxWidth = image_target.width + 'px';
    
    left = image_target.offsetWidth / 2 - CROPWIDTH / 2;
    top = image_target.offsetHeight / 2 - CROPHEIGHT / 2;
    
    updateCropImage(left, top);
    addHandlers();
  }
  
  function updateCropSize(width: number, height: number) {
    container.style.width = width + 'px';
    container.style.height = height + 'px';
  }
  
  function updateCropImage(left: number, top: number) {
    cropLeft = -left * ratio;
    cropTop = -top * ratio;

    crop_img.style.top = -top + 'px';
    crop_img.style.left = -left + 'px';
  }
  
  function updateContainer(left: number, top: number) {
    let _top = top + (CROPWIDTH / 2) + 'px';
    let _left = left + (CROPHEIGHT / 2) + 'px';
    
    container.style.top = _top;
    container.style.left = _left;
  }
  
  // Save the initial event details and container state
  function saveEventState(e: any) {
    event_state.container_width = container.offsetWidth;
    event_state.container_height = container.offsetHeight;
    
    event_state.container_left = container.offsetLeft;
    event_state.container_top = container.offsetTop;
    
    event_state.mouse_x = (e.clientX || e.pageX || e.touches && e.touches[0].clientX) + window.scrollX;
    event_state.mouse_y = (e.clientY || e.pageY || e.touches && e.touches[0].clientY) + window.scrollY;
  }
  
  function imgZoom(zoom: number) {
    zoom = zoom * Math.PI * 2
    var newWidth = Math.floor(container.clientWidth + zoom)
    , newHeight = Math.floor(container.clientHeight + zoom)
    , w = crop_img.clientWidth
    , h = crop_img.clientHeight
    , left
    , top
    , right
    , bottom;
    
    if(newWidth < MINWIDTH) {
      return;
    } else if (newWidth > w) {
      return;
    }
    
    left = container.offsetLeft - (zoom / 2);
    top = container.offsetTop - (zoom / 2);
    right = left + newWidth;
    bottom = top + newHeight;
    
    if(left < 0) {
      left = 0;
    }
    if(top < 0) {
      top = 0;
    }
    if(right > w) {
      return;
    }
    if(bottom > h) {
      return;
    }
    
    ratio = CROPWIDTH / newWidth;
    
    updateCropSize(newWidth, newWidth);
    updateCropImage(left, top);
    updateContainer(left, top);
    //crop();
  }
  
  function keyHandler(e: KeyboardEvent) {
    e.preventDefault();
    
    switch (String.fromCharCode(e.charCode)) {
      case '+' :
      imgZoom(keyZoomValue);
      break;
      case '-' :
      imgZoom(-keyZoomValue);
      break;
    }
  }
  
  function resizing(e: any) {
    e.preventDefault();
    imgZoom(e.deltaY > 0 ? 1 : -1);
  }
  
  function startMoving(e: MouseEvent | TouchEvent) {
    e.preventDefault();
    e.stopPropagation();
    
    saveEventState(e);
    
    document.addEventListener('mousemove', moving);
    document.addEventListener('touchmove', moving);
    document.addEventListener('mouseup', endMoving);
    document.addEventListener('touchend', endMoving);
  }
  
  function endMoving(e: MouseEvent | TouchEvent) {
    e.preventDefault();
    
    document.removeEventListener('mouseup', endMoving);
    document.removeEventListener('touchend', endMoving);
    document.removeEventListener('mousemove', moving);
    document.removeEventListener('touchmove', moving);
  }
  
  function moving(e: any) {
    var curuntTouch = {x: 0, y: 0}
    , left
    , top
    , w
    , h;
    
    e.preventDefault();
    e.stopPropagation();
    
    curuntTouch.x = e.pageX || e.touches && e.touches[0].pageX;
    curuntTouch.y = e.pageY || e.touches && e.touches[0].pageY;
    
    left = curuntTouch.x - (event_state.mouse_x - event_state.container_left);
    top = curuntTouch.y - (event_state.mouse_y - event_state.container_top);
    w = container.offsetWidth;
    h = container.offsetHeight;
    
    if(left < 0) {
      left = 0;
    } else if (left > crop_img.offsetWidth - w) {
      left = crop_img.offsetWidth - w;
    }
    if(top < 0) {
      top = 0;
    } else if (top > crop_img.offsetHeight - h) {
      top = crop_img.offsetHeight - h;
    }
    
    updateCropImage(left, top);
    updateContainer(left, top);
  }

  function crop() {
    cropWidth = crop_img.width * ratio;
    cropHeight = crop_img.height * ratio;
    
    resize_canvas.width = CROPWIDTH;
    resize_canvas.height = CROPHEIGHT;
    
    var ctx = resize_canvas.getContext('2d');
    ctx.drawImage(crop_img,
      cropLeft, cropTop,
      cropWidth, cropHeight
    );
  }
  
  return {crop, removeHandlers};
    
  /* function openCropCanvasImg() {
    crop();
    
    try {
      var base64Img = resize_canvas.toDataURL('image/png', 1.0);
      window.open(base64Img);
    } catch(e) {
      alert(e);
    } finally {
      // removeHandlers();
    }
    
  } */
}
  
//resizeableImage(document.querySelector('.crop-image'));
export default resizeableImage;
