import cancelEvent from '@helpers/dom/cancelEvent';
import {bindActiveWindowListener} from '@helpers/appWindow';

export default function cancelImageEvents() {
  // Follow the active window so these still fire in a Document PiP window (the events fire on the PiP
  // document there, not the tab's) — else images become draggable and show the native context menu.

  // prevent firefox image dragging
  bindActiveWindowListener((w) => w.document, 'dragstart', (e) => {
    if((e.target as HTMLElement)?.tagName === 'IMG') {
      e.preventDefault();
      return false;
    }
  });

  // restrict contextmenu on images (e.g. webp stickers)
  bindActiveWindowListener((w) => w.document, 'contextmenu', (e) => {
    if((e.target as HTMLElement).tagName === 'IMG' && !(window as any).appMediaViewer) {
      cancelEvent(e);
    }
  });
}
