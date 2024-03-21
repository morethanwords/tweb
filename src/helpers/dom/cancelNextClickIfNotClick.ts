import cancelEvent from './cancelEvent';

export default function cancelNextClickIfNotClick(e: Event) {
  if(e.type === 'click') {
    return;
  }

  document.body.addEventListener('click', cancelEvent, {once: true});
}
