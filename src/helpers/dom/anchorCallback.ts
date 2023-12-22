import cancelEvent from './cancelEvent';

export default function anchorCallback(callback: (e: MouseEvent) => any, _cancelEvent = true) {
  const a = document.createElement('a');
  a.href = '#';
  a.onclick = (e) => {
    _cancelEvent && cancelEvent(e);
    callback(e);
  };
  return a;
}
