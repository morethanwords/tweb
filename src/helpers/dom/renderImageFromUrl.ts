export const loadedURLs: {[url: string]: boolean} = {};
const set = (elem: HTMLElement | HTMLImageElement | SVGImageElement | HTMLVideoElement, url: string) => {
  if(elem instanceof HTMLImageElement || elem instanceof HTMLVideoElement) elem.src = url;
  else if(elem instanceof SVGImageElement) elem.setAttributeNS(null, 'href', url);
  else elem.style.backgroundImage = 'url(' + url + ')';
};

// проблема функции в том, что она не подходит для ссылок, пригодна только для blob'ов, потому что обычным ссылкам нужен 'load' каждый раз.
export default function renderImageFromUrl(elem: HTMLElement | HTMLImageElement | SVGImageElement | HTMLVideoElement, url: string, callback?: (err?: Event) => void, useCache = false): boolean {
  if(((loadedURLs[url]/*  && false */) && useCache) || elem instanceof HTMLVideoElement) {
    if(elem) {
      set(elem, url);
    }
    
    callback && callback();
    return true;
  } else {
    const isImage = elem instanceof HTMLImageElement;
    const loader = isImage ? elem as HTMLImageElement : new Image();
    //const loader = new Image();
    loader.src = url;
    //let perf = performance.now();
    loader.addEventListener('load', () => {
      if(!isImage && elem) {
        set(elem, url);
      }

      loadedURLs[url] = true;
      //console.log('onload:', url, performance.now() - perf);
      if(callback) {
        // TODO: переделать прогрузки аватаров до начала анимации, иначе с этим ожиданием они неприятно появляются
        /* getHeavyAnimationPromise().then(() => {
          callback();
        }); */
        callback();
      }

      //callback && callback();
    });

    if(callback) {
      loader.addEventListener('error', callback);
    }

    return false;
  }
}
