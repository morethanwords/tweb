import {createElement, addEventListener} from './minifiers';
import {toggleText} from './toggleText';
import {throttle} from './utils';

export function createHeader(
  container: HTMLElement,
  title: string,
  zoomOutLabel: string = 'Zoom out',
  zoomOutCallback: () => void,
  titleElement?: HTMLElement,
  captionElement?: HTMLElement,
  zoomOutElement?: HTMLElement
) {
  let _element: HTMLElement = titleElement?.parentElement;
  let _titleElement: HTMLElement = titleElement;
  let _zoomOutElement: HTMLElement = zoomOutElement;
  let _captionElement: HTMLElement = captionElement;
  let _isZooming: boolean;
  const isManual = !!titleElement;

  const setCaptionThrottled = throttle(setCaption, 100, false);

  if(isManual) {
    _zoomOutElement && addEventListener(_zoomOutElement, 'click', _onZoomOut);
  } else {
    _setupLayout();
  }

  function setCaption(caption: string) {
    if(_isZooming) {
      return;
    }

    _captionElement.innerHTML = caption;
  }

  function zoom(caption: string) {
    if(isManual) {
      _titleElement.classList.add('is-zoomed');
    } else {
      _zoomOutElement = toggleText(_titleElement, zoomOutLabel, 'lovely-chart--header-title lovely-chart--header-zoom-out-control');
      setTimeout(() => {
        addEventListener(_zoomOutElement, 'click', _onZoomOut);
      }, 500);
    }

    setCaption(caption);
  }

  function toggleIsZooming(isZooming: boolean) {
    if(_isZooming === isZooming) {
      return;
    }

    _isZooming = isZooming;
  }

  function _setupLayout() {
    if(!_titleElement) {
      _element = createElement();
      _element.className = 'lovely-chart--header';
    }

    _titleElement ||= createElement();
    _titleElement.className = 'lovely-chart--header-title';
    title && (_titleElement.innerHTML = title);
    !titleElement.parentNode && _element.appendChild(_titleElement);

    _captionElement ||= createElement();
    _captionElement.className = 'lovely-chart--header-caption lovely-chart--position-right';
    !_captionElement.parentNode && _element.appendChild(_captionElement);

    _element && container.appendChild(_element);
  }

  function _onZoomOut() {
    if(isManual) {
      _titleElement.classList.remove('is-zoomed');
    } else {
      _titleElement = toggleText(_zoomOutElement, title, 'lovely-chart--header-title', true);
      _titleElement.classList.remove('lovely-chart--transition');
    }

    zoomOutCallback();
  }

  return {
    setCaption: setCaptionThrottled,
    zoom,
    toggleIsZooming
  };
}
