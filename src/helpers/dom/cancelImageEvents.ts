import cancelEvent from './cancelEvent';

export default function cancelImageEvents() {
  // prevent firefox image dragging
  document.addEventListener('dragstart', (e) => {
    if((e.target as HTMLElement)?.tagName === 'IMG') {
      e.preventDefault();
      return false;
    }
  });

  // restrict contextmenu on images (e.g. webp stickers)
  document.addEventListener('contextmenu', (e) => {
    if((e.target as HTMLElement).tagName === 'IMG' && !(window as any).appMediaViewer) {
      cancelEvent(e);
    }
  });
}
