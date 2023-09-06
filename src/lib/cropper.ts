/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

function resizeableImage(originalImage: HTMLImageElement, canvas?: HTMLCanvasElement) {
  let cropComponent: HTMLDivElement,
    container: HTMLDivElement,
    cropImage: HTMLImageElement,
    cropLeft = 0,
    cropTop = 0,
    cropWidth = 0,
    cropHeight = 0,
    scaledRatio = 0;

  const keyZoomValue = 4.0;
  const event_state: Partial<{
    mouse_x: number,
    mouse_y: number,
    container_width: number,
    container_height: number,
    container_left: number,
    container_top: number
  }> = {};
  const MINWIDTH = 50,
    MINHEIGHT = 50,
    CROPWIDTH = 200,
    CROPHEIGHT = 200;

  if(originalImage.complete) init();
  else originalImage.onload = init;

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
    cropImage.remove();
  }

  function addHandlers() {
    container.addEventListener('mousedown', startMoving, false);
    container.addEventListener('touchstart', startMoving, false);
    container.addEventListener('wheel', resizing, false);

    document.addEventListener('keypress', keyHandler, false);
    // document.querySelector('.btn-crop').addEventListener('click', openCropCanvasImg);
  }

  function init() {
    originalImage.classList.add('crop-blur');
    originalImage.draggable = false;

    cropImage = new Image();
    cropImage.src = originalImage.src;
    cropImage.draggable = false;
    cropImage.classList.add('crop-overlay-image');

    if(!canvas) {
      canvas = document.createElement('canvas');
    }

    cropComponent = document.createElement('div');
    cropComponent.classList.add('crop-component');

    container = document.createElement('div');
    container.classList.add('crop-overlay');

    const overlayColor = document.createElement('div');
    overlayColor.classList.add('crop-overlay-color');

    cropComponent.appendChild(container);
    const wrapper = originalImage.parentNode as HTMLElement;
    wrapper.appendChild(cropComponent);
    cropComponent.appendChild(cropImage);
    cropComponent.appendChild(originalImage);
    cropComponent.appendChild(overlayColor);
    container.appendChild(cropImage);

    cropImage.style.maxWidth = originalImage.width + 'px';

    scaledRatio = originalImage.naturalWidth / originalImage.offsetWidth;

    const left = originalImage.offsetWidth / 2 - CROPWIDTH / 2;
    const top = originalImage.offsetHeight / 2 - CROPHEIGHT / 2;

    updateCropSize(CROPWIDTH, CROPHEIGHT);
    updateCropImage(left, top);
    updateContainer(left, top);
    addHandlers();
    // crop();
  }

  function updateCropSize(width: number, height: number) {
    cropWidth = width * scaledRatio;
    cropHeight = height * scaledRatio;

    container.style.width = width + 'px';
    container.style.height = height + 'px';
  }

  function updateCropImage(left: number, top: number) {
    cropTop = top * scaledRatio;
    cropLeft = left * scaledRatio;

    cropImage.style.top = -top + 'px';
    cropImage.style.left = -left + 'px';
  }

  function updateContainer(left: number, top: number) {
    container.style.top = top + 'px';
    container.style.left = left + 'px';
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
    const newWidth = Math.floor(container.clientWidth + zoom),
      newHeight = Math.floor(container.clientHeight + zoom),
      w = cropImage.clientWidth,
      h = cropImage.clientHeight;
    let left: number,
      top: number;

    if(newWidth < MINWIDTH) {
      return;
    } else if(newWidth > w) {
      return;
    }

    left = container.offsetLeft - (zoom / 2);
    top = container.offsetTop - (zoom / 2);
    const right = left + newWidth;
    const bottom = top + newHeight;

    if(left < 0) left = 0;
    if(top < 0) top = 0;

    if(right > w) return;
    if(bottom > h) return;

    updateCropSize(newWidth, newWidth);
    updateCropImage(left, top);
    updateContainer(left, top);
    // crop();
  }

  function keyHandler(e: KeyboardEvent) {
    e.preventDefault();

    switch(String.fromCharCode(e.charCode)) {
      case '+':
        imgZoom(keyZoomValue);
        break;
      case '-':
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
    const currentTouch = {x: 0, y: 0};

    e.preventDefault();
    e.stopPropagation();

    currentTouch.x = e.pageX || e.touches && e.touches[0].pageX;
    currentTouch.y = e.pageY || e.touches && e.touches[0].pageY;

    let left = currentTouch.x - (event_state.mouse_x - event_state.container_left);
    let top = currentTouch.y - (event_state.mouse_y - event_state.container_top);
    const w = container.offsetWidth;
    const h = container.offsetHeight;

    if(left < 0) left = 0;
    else if(left > cropImage.offsetWidth - w) left = cropImage.offsetWidth - w;

    if(top < 0) top = 0;
    else if(top > cropImage.offsetHeight - h) top = cropImage.offsetHeight - h;

    updateCropImage(left, top);
    updateContainer(left, top);
    // crop();
  }

  function crop() {
    canvas.width = cropWidth;
    canvas.height = cropHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(originalImage,
      cropLeft, cropTop,
      cropWidth, cropHeight,
      0, 0,
      cropWidth, cropHeight
    );
  }

  return {crop, removeHandlers};
}

export default resizeableImage;
