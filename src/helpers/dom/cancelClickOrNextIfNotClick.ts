import cancelEvent from '@helpers/dom/cancelEvent';

export default function cancelClickOrNextIfNotClick(e: Event) {
  if(e.type === 'click') {
    cancelEvent(e);
    return;
  }

  document.body.addEventListener('click', cancelEvent, {once: true, capture: true});
}
