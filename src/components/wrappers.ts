/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export {};

/* function wrapMediaWithTail(photo: MyPhoto | MyDocument, message: {mid: number, message: string}, container: HTMLElement, boxWidth: number, boxHeight: number, isOut: boolean) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add('bubble__media-container', isOut ? 'is-out' : 'is-in');

  const foreignObject = document.createElementNS("http://www.w3.org/2000/svg", 'foreignObject');

  const gotThumb = appPhotosManager.getStrippedThumbIfNeeded(photo, true);
  if(gotThumb) {
    foreignObject.append(gotThumb.image);
  }
  appPhotosManager.setAttachmentSize(photo, foreignObject, boxWidth, boxHeight);

  const width = +foreignObject.getAttributeNS(null, 'width');
  const height = +foreignObject.getAttributeNS(null, 'height');

  svg.setAttributeNS(null, 'width', '' + width);
  svg.setAttributeNS(null, 'height', '' + height);

  svg.setAttributeNS(null, 'viewBox', '0 0 ' + width + ' ' + height);
  svg.setAttributeNS(null, 'preserveAspectRatio', 'none');

  const clipId = 'clip' + message.mid + '_' + nextRandomInt(9999);
  svg.dataset.clipId = clipId;

  const defs = document.createElementNS("http://www.w3.org/2000/svg", 'defs');
  let clipPathHTML: string = '';

  if(message.message) {
    //clipPathHTML += `<rect width="${width}" height="${height}"></rect>`;
  } else {
    if(isOut) {
      clipPathHTML += `
      <use href="#message-tail" transform="translate(${width - 2}, ${height}) scale(-1, -1)"></use>
      <path />
      `;
    } else {
      clipPathHTML += `
      <use href="#message-tail" transform="translate(2, ${height}) scale(1, -1)"></use>
      <path />
      `;
    }
  }

  defs.innerHTML = `<clipPath id="${clipId}">${clipPathHTML}</clipPath>`;

  container.style.width = parseInt(container.style.width) - 9 + 'px';
  container.classList.add('with-tail');

  svg.append(defs, foreignObject);
  container.append(svg);

  let img = foreignObject.firstElementChild as HTMLImageElement;
  if(!img) {
    foreignObject.append(img = new Image());
  }

  return img;
} */

// export function renderImageWithFadeIn(container: HTMLElement,
//   image: HTMLImageElement,
//   url: string,
//   needFadeIn: boolean,
//   aspecter = container,
//   thumbImage?: HTMLImageElement
// ) {
//   if(needFadeIn) {
//     // image.classList.add('fade-in-new', 'not-yet');
//     image.classList.add('fade-in');
//   }

//   return new Promise<void>((resolve) => {
//     /* if(photo._ === 'document') {
//       console.error('wrapPhoto: will render document', photo, size, cacheContext);
//       return resolve();
//     } */

//     renderImageFromUrl(image, url, () => {
//       sequentialDom.mutateElement(container, () => {
//         aspecter.append(image);
//         // (needFadeIn ? getHeavyAnimationPromise() : Promise.resolve()).then(() => {

//         // fastRaf(() => {
//           resolve();
//         // });

//         if(needFadeIn) {
//           fastRaf(() => {
//             /* if(!image.isConnected) {
//               alert('aaaa');
//             } */
//             // fastRaf(() => {
//               image.classList.remove('not-yet');
//             // });
//           });

//           image.addEventListener('transitionend', () => {
//             sequentialDom.mutate(() => {
//               image.classList.remove('fade-in-new');

//               if(thumbImage) {
//                 thumbImage.remove();
//               }
//             });
//           }, {once: true});
//         }
//       // });
//       });
//     });
//   });
// }

export {};
