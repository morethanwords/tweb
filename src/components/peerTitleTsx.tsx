import {createResource, onCleanup, Ref} from 'solid-js';
import PeerTitle from './peerTitle';
import {attachClickEvent} from '../helpers/dom/clickEvent';
import {attachClassName} from '../helpers/solid/classname';

export const PeerTitleTsx = (props: {
  ref?: Ref<HTMLElement>;
  class?: string
  peerId: PeerId,
  onlyFirstName?: boolean,
  username?: boolean,
  limitSymbols?: number,
  onClick?: () => void
}) => {
  const peerTitle = new PeerTitle();

  props.ref instanceof Function && props.ref?.(peerTitle.element); // solid will always make it a function

  const [loaded] = createResource(
    () => props.peerId,
    async(peerId) => {
      await peerTitle.update({
        peerId,
        dialog: false,
        onlyFirstName: props.onlyFirstName,
        username: props.username,
        limitSymbols: props.limitSymbols
      });
      if(props.onClick) {
        const detach = attachClickEvent(peerTitle.element, props.onClick);
        onCleanup(detach);
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
