import {pinObjectURL} from '@helpers/objectUrl';
import {isObjectURL} from '@helpers/objectUrlUtils';

// * MediaSession artwork has no DOM element and the OS fetches it lazily, so
// * its blob URLs must stay pinned for as long as the metadata is current.
export default function createMediaMetadataObjectURLPins(
  setMetadata = (metadata: MediaMetadata | null) => {
    navigator.mediaSession.metadata = metadata;
  }
) {
  let pins = new Map<string, () => void>();

  return (metadata: MediaMetadata | null) => {
    const nextPins = new Map<string, () => void>();
    const createdPins: Array<() => void> = [];
    for(const {src} of metadata?.artwork ?? []) {
      if(isObjectURL(src) && !nextPins.has(src)) {
        let unpin = pins.get(src);
        if(!unpin) {
          createdPins.push(unpin = pinObjectURL(src));
        }
        nextPins.set(src, unpin);
      }
    }

    try {
      setMetadata(metadata);
    } catch(error) {
      createdPins.forEach((unpin) => unpin());
      throw error;
    }

    for(const [url, unpin] of pins) {
      if(!nextPins.has(url)) {
        unpin();
      }
    }
    pins = nextPins;
  };
}
