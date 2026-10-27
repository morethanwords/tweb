export default function clearMediaElementSource(element: HTMLImageElement | HTMLMediaElement) {
  const isMedia = element.tagName === 'AUDIO' || element.tagName === 'VIDEO';
  const media = element as HTMLMediaElement;

  if(isMedia) {
    try {
      media.pause();
    } catch{}

    media.srcObject = null;
    // Assign through the property before removing the attribute. createVideo
    // installs a setter here to release stream/* bookkeeping.
    media.src = '';
  }

  // * An image that never was in the document (a loader for a decode or a canvas) and loses its src
  // * attribute after loading shows the broken-image fallback, and Chrome keeps such an image alive
  // * for good - with everything its listeners and properties hold. An empty src does not.
  if(!isMedia && !element.isConnected) {
    (element as HTMLImageElement).src = '';
    return;
  }

  element.removeAttribute('src');
  if(isMedia) {
    try {
      media.load();
    } catch{}
  }
}
