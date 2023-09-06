import noop from '../noop';

export default function safePlay(media: {play: () => any}) {
  try {
    const promise = media.play();
    if(promise instanceof Promise) {
      promise.catch(noop);
    }
  } catch(e) {
    console.error(e);
  }
}
