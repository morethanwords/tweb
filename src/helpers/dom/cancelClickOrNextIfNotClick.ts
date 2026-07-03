import cancelEvent from '@helpers/dom/cancelEvent';
import {getOverlayRoot} from '@helpers/appWindow';

export default function cancelClickOrNextIfNotClick(e: Event) {
  if(e.type === 'click') {
    cancelEvent(e);
    return;
  }

  getOverlayRoot().addEventListener('click', cancelEvent, {once: true, capture: true});
}
