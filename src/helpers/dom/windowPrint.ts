function preparePrint() {
  const chat = document.querySelector('.chat.active');
  if(!chat) {
    return;
  }

  const chatClone = chat.cloneNode(true) as HTMLElement;
  chatClone.querySelectorAll('.chat-input, .chat-background').forEach((element) => element.remove());
  const bubbles = chatClone.querySelector('.bubbles');
  const bubblesInner = bubbles.querySelector('.bubbles-inner');
  bubbles.replaceChildren(bubblesInner);
  const video = bubbles.querySelectorAll<HTMLVideoElement>('video');
  video.forEach((video) => (video.muted = true));
  const printable = document.createElement('div');
  printable.setAttribute('id', 'printable');
  printable.append(chatClone);
  document.body.append(printable);
}

function removePrint() {
  const printContent = document.getElementById('printable');
  printContent?.remove();
}

export default function listenForWindowPrint() {
  window.addEventListener('beforeprint', preparePrint);
  window.addEventListener('afterprint', removePrint);
}
