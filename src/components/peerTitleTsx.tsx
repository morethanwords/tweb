import {createResource, onCleanup} from 'solid-js';
import PeerTitle from './peerTitle';
import {attachClickEvent} from '../helpers/dom/clickEvent';
import {attachClassName} from '../helpers/solid/classname';
import {createListenerSetter} from './stories/viewer';

export const PeerTitleTsx = (props: {
  class?: string
  peerId: PeerId,
  onlyFirstName?: boolean,
  username?: boolean,
  withIcons?: boolean,
  onClick?: () => void
}) => {
  const peerTitle = new PeerTitle();
  const listenerSetter = createListenerSetter();

  const [loaded] = createResource(
    () => props.peerId,
    async(peerId) => {
      await peerTitle.update({
        peerId,
        dialog: false,
        onlyFirstName: props.onlyFirstName,
        username: props.username,
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
