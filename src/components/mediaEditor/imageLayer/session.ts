import type {MediaEditorContextValue} from '@components/mediaEditor/context';
import {createStaticImageLayerResources} from '@components/mediaEditor/imageLayer/resources';

const sessions = new WeakMap<MediaEditorContextValue, ReturnType<typeof createSession>>();

function createSession() {
  const resources = createStaticImageLayerResources();
  let closed = false, leases = 0;
  return {
    resources,
    get closed() { return closed; },
    retain() {
      if(closed) throw new DOMException('Image layer session ended', 'AbortError');
      leases++;
      let released = false;
      return () => {
        if(released) return;
        released = true;
        if(--leases === 0 && closed) resources.dispose();
      };
    },
    close() {
      closed = true;
      if(!leases) resources.dispose();
    }
  };
}

/** Context identity, never serialized. Export leases outlive the closing editor. */
export function imageLayerSession(context: MediaEditorContextValue) {
  let session = sessions.get(context);
  if(!session) sessions.set(context, session = createSession());
  return session;
}
