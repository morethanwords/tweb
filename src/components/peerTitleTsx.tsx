import {createResource, onCleanup, Ref} from 'solid-js';
import PeerTitle from '@components/peerTitle';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {attachClassName} from '@helpers/solid/classname';
import createListenerSetter from '../helpers/solid/createListenerSetter';
import createMiddleware from '@helpers/solid/createMiddleware';

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
  // * what the title draws (its icons' players) lives as long as the component
  const middleware = createMiddleware().get();

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
        withIcons: props.withIcons,
        wrapOptions: {middleware},
        // * as without a middleware: no emoji status here
        noPremiumIcon: true
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
