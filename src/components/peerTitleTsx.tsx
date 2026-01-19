import {createResource, onCleanup, Ref} from 'solid-js';
import PeerTitle from '@components/peerTitle';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {attachClassName} from '@helpers/solid/classname';
import {createListenerSetter} from '@components/stories/viewer';

export const PeerTitleTsx = (props: {
  ref?: Ref<HTMLElement>;
  class?: string
  peerId: PeerId,
  threadId?: number,
  onlyFirstName?: boolean,
  username?: boolean,
  limitSymbols?: number,
  withIcons?: boolean,
  onClick?: () => void
}) => {
  const peerTitle = new PeerTitle();
  const listenerSetter = createListenerSetter();

  props.ref instanceof Function && props.ref?.(peerTitle.element); // solid will always make it a function

  const [loaded] = createResource(
    () => [props.peerId, props.threadId],
    async([peerId, threadId]) => {
      await peerTitle.update({
        peerId,
        threadId,
        dialog: false,
        onlyFirstName: props.onlyFirstName,
        username: props.username,
        limitSymbols: props.limitSymbols,
        withIcons: props.withIcons
      });
      if(props.onClick) {
        attachClickEvent(peerTitle.element, props.onClick, {listenerSetter});
      }
      return true;
    }
  );

  attachClassName(peerTitle.element, () => props.class);

  return (
    <>
      {loaded() && peerTitle.element}
    </>
  );
};
